import type { Db, NotificationKind, Prisma } from '@devsync/database';
import { notificationPreferencesSchema } from '@devsync/validation';
import type { z } from 'zod';
import { requireTeamMember } from './access.service';
import type { DraftEvent } from './events.service';
import type { ServiceDeps } from './ports';

type Emit = (draft: DraftEvent) => Promise<void>;

interface Preference {
  inApp: boolean;
  desktop: boolean;
  sound: boolean;
}

/** Sound by default for what a developer is waiting for. */
const SOUND_BY_DEFAULT: NotificationKind[] = ['REQUEST_CREATED', 'DELIVERABLE_READY', 'REQUEST_CLARIFICATION'];
export const defaultPreference = (kind: NotificationKind): Preference => ({ inApp: true, desktop: true, sound: SOUND_BY_DEFAULT.includes(kind) });

export const NOTIFICATION_KINDS: NotificationKind[] = [
  'REQUEST_CREATED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_IN_PROGRESS', 'REQUEST_CLARIFICATION', 'DELIVERABLE_READY',
  'DEPENDENCY_RESOLVED', 'AGENT_CONNECTED', 'AGENT_DISCONNECTED', 'GIT_CONFLICT', 'KNOWLEDGE_PUBLISHED', 'INVITATION',
];

export interface NotificationDraft {
  teamId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  data?: Prisma.InputJsonValue;
  /** Same (user, dedupeKey) is notified once: retries and duplicate events never spam. */
  dedupeKey: string;
}

/**
 * Persistent notifications. Written in the caller's transaction; the realtime event (in-app badge,
 * Bridge desktop notification and sound) follows the user's preferences.
 */
export async function notify(tx: Db, emit: Emit, draft: NotificationDraft): Promise<boolean> {
  const stored = await tx.notificationPreference.findUnique({
    where: { userId_teamId_kind: { userId: draft.userId, teamId: draft.teamId, kind: draft.kind } },
  });
  const pref = stored ?? defaultPreference(draft.kind);
  if (!pref.inApp && !pref.desktop) return false;
  const { count } = await tx.notification.createMany({
    data: [{ teamId: draft.teamId, userId: draft.userId, kind: draft.kind, title: draft.title, body: draft.body ?? null, link: draft.link ?? null, data: draft.data ?? {}, dedupeKey: draft.dedupeKey, readAt: pref.inApp ? null : new Date() }],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  const created = await tx.notification.findUniqueOrThrow({ where: { userId_dedupeKey: { userId: draft.userId, dedupeKey: draft.dedupeKey } }, select: { id: true } });
  await emit({
    type: 'notification.created',
    teamId: draft.teamId,
    actor: { type: 'SYSTEM' },
    audience: [draft.userId],
    payload: {
      notificationId: created.id,
      userId: draft.userId,
      kind: draft.kind,
      title: draft.title,
      ...(draft.body ? { body: draft.body } : {}),
      ...(draft.link ? { link: draft.link } : {}),
      desktop: pref.desktop,
      playSound: pref.desktop && pref.sound,
    },
  });
  return true;
}

export class NotificationsService {
  constructor(private readonly deps: ServiceDeps) {}

  async list(userId: string, teamId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const [items, unread] = await Promise.all([
      this.deps.db.notification.findMany({
        where: { userId, teamId, ...(options.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(options.limit ?? 50, 100),
      }),
      this.deps.db.notification.count({ where: { userId, teamId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, teamId: string, ids: string[] | 'all') {
    await requireTeamMember(this.deps.db, userId, teamId);
    const { count } = await this.deps.db.notification.updateMany({
      where: { userId, teamId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async preferences(userId: string, teamId: string) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const stored = await this.deps.db.notificationPreference.findMany({ where: { userId, teamId } });
    return NOTIFICATION_KINDS.map((kind) => {
      const p = stored.find((s) => s.kind === kind) ?? defaultPreference(kind);
      return { kind, inApp: p.inApp, desktop: p.desktop, sound: p.sound };
    });
  }

  async updatePreferences(userId: string, teamId: string, input: z.input<typeof notificationPreferencesSchema>) {
    const { preferences } = notificationPreferencesSchema.parse(input);
    await requireTeamMember(this.deps.db, userId, teamId);
    await this.deps.db.$transaction(
      preferences.map((p) =>
        this.deps.db.notificationPreference.upsert({
          where: { userId_teamId_kind: { userId, teamId, kind: p.kind } },
          create: { userId, teamId, kind: p.kind, inApp: p.inApp, desktop: p.desktop, sound: p.sound },
          update: { inApp: p.inApp, desktop: p.desktop, sound: p.sound },
        }),
      ),
    );
    return this.preferences(userId, teamId);
  }
}
