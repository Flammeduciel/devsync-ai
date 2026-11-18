import type { Prisma } from '@devsync/database';
import { AppError } from '@devsync/shared';
import { z } from 'zod';
import { isPlatformAdmin, parseAdminEmails, type SignupMode } from '../domain/platform';
import type { ServiceDeps } from './ports';
import { clock } from './ports';

export const signupModeSchema = z.enum(['OPEN', 'INVITE_ONLY', 'CLOSED']);

/** Disconnects sockets of a suspended user/team (Redis control channel in production). */
export type PlatformControl = (message: { type: 'user.suspended'; userId: string } | { type: 'team.suspended'; teamId: string }) => Promise<void>;

/**
 * Console of the instance owner. Shows metadata and counts across teams — never team content (requests,
 * knowledge, code activity details). Every action is written to the platform audit log.
 */
export class PlatformAdminService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly control: PlatformControl = async () => {},
    private readonly adminEmails: () => Set<string> = () => parseAdminEmails(process.env.PLATFORM_ADMIN_EMAILS),
  ) {}

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.deps.db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, suspendedAt: true, deletedAt: true } });
    return !!user && !user.suspendedAt && !user.deletedAt && isPlatformAdmin(user, this.adminEmails());
  }

  /** NOT_FOUND for everyone else: the console's existence is not advertised. */
  async requireAdmin(userId: string): Promise<void> {
    if (!(await this.isAdmin(userId))) throw new AppError('NOT_FOUND', 'Not found');
  }

  async overview(adminId: string) {
    await this.requireAdmin(adminId);
    const db = this.deps.db;
    const since = new Date(clock(this.deps).getTime() - 7 * 86_400_000);
    const [users, suspendedUsers, newUsers, teams, suspendedTeams, projects, agentsOnline, machines, openRequests, knowledge, gitAlerts, settings] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
      db.user.count({ where: { deletedAt: null, createdAt: { gt: since } } }),
      db.team.count({ where: { deletedAt: null } }),
      db.team.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
      db.project.count({ where: { deletedAt: null } }),
      db.agent.count({ where: { status: { not: 'OFFLINE' } } }),
      db.agentMachine.count({ where: { revokedAt: null } }),
      db.collaborationRequest.count({ where: { deletedAt: null, status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_CLARIFICATION'] } } }),
      db.knowledge.count({ where: { deletedAt: null } }),
      db.gitConflict.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
      this.settings(),
    ]);
    return { users, suspendedUsers, newUsers, teams, suspendedTeams, projects, agentsOnline, machines, openRequests, knowledge, gitAlerts, signupMode: settings.signupMode };
  }

  async listTeams(adminId: string, query = '') {
    await this.requireAdmin(adminId);
    const teams = await this.deps.db.team.findMany({
      where: { deletedAt: null, ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { slug: { contains: query, mode: 'insensitive' } }] } : {}) },
      include: { _count: { select: { members: true, projects: { where: { deletedAt: null } }, agents: true, machines: { where: { revokedAt: null } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const lastActivity = await this.deps.db.agentActivity.groupBy({ by: ['teamId'], where: { teamId: { in: teams.map((t) => t.id) } }, _max: { occurredAt: true } });
    const last = new Map(lastActivity.map((a) => [a.teamId, a._max.occurredAt]));
    return teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, createdAt: t.createdAt, suspendedAt: t.suspendedAt, members: t._count.members, projects: t._count.projects, agents: t._count.agents, machines: t._count.machines, lastAgentActivity: last.get(t.id) ?? null }));
  }

  async listUsers(adminId: string, query = '') {
    await this.requireAdmin(adminId);
    const users = await this.deps.db.user.findMany({
      where: { deletedAt: null, ...(query ? { OR: [{ email: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }] } : {}) },
      include: {
        _count: { select: { memberships: true, machines: { where: { revokedAt: null } } } },
        sessions: { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const admins = this.adminEmails();
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      suspendedAt: u.suspendedAt,
      teams: u._count.memberships,
      machines: u._count.machines,
      lastSeenAt: u.sessions[0]?.updatedAt ?? null,
      platformAdmin: admins.has(u.email.toLowerCase()),
    }));
  }

  /** Suspension cuts web sessions, API, device tokens and realtime at once; reactivation restores access. */
  async setUserSuspended(adminId: string, userId: string, suspended: boolean, reason?: string) {
    await this.requireAdmin(adminId);
    if (userId === adminId) throw new AppError('BAD_REQUEST', 'You cannot suspend yourself');
    const user = await this.deps.db.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    await this.deps.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { suspendedAt: suspended ? clock(this.deps) : null } });
      if (suspended) await tx.session.deleteMany({ where: { userId } });
      await this.audit(tx, adminId, suspended ? 'user.suspended' : 'user.reactivated', 'user', userId, { email: user.email, reason: reason ?? null });
    });
    if (suspended) await this.control({ type: 'user.suspended', userId });
    return { userId, suspended };
  }

  async setTeamSuspended(adminId: string, teamId: string, suspended: boolean, reason?: string) {
    await this.requireAdmin(adminId);
    const team = await this.deps.db.team.findFirst({ where: { id: teamId, deletedAt: null } });
    if (!team) throw new AppError('NOT_FOUND', 'Team not found');
    await this.deps.db.$transaction(async (tx) => {
      await tx.team.update({ where: { id: teamId }, data: { suspendedAt: suspended ? clock(this.deps) : null } });
      await this.audit(tx, adminId, suspended ? 'team.suspended' : 'team.reactivated', 'team', teamId, { slug: team.slug, reason: reason ?? null });
    });
    if (suspended) await this.control({ type: 'team.suspended', teamId });
    return { teamId, suspended };
  }

  async settings() {
    return (await this.deps.db.platformSettings.findUnique({ where: { id: 'platform' } })) ?? { id: 'platform', signupMode: 'OPEN' as SignupMode, updatedAt: null, updatedById: null };
  }

  async setSignupMode(adminId: string, mode: SignupMode) {
    await this.requireAdmin(adminId);
    const signupMode = signupModeSchema.parse(mode);
    await this.deps.db.$transaction(async (tx) => {
      await tx.platformSettings.upsert({ where: { id: 'platform' }, create: { id: 'platform', signupMode, updatedById: adminId }, update: { signupMode, updatedById: adminId } });
      await this.audit(tx, adminId, 'settings.signup_mode', 'platform', null, { signupMode });
    });
    return { signupMode };
  }

  async auditLog(adminId: string, limit = 100) {
    await this.requireAdmin(adminId);
    const rows = await this.deps.db.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    const admins = await this.deps.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.adminUserId))] } }, select: { id: true, email: true } });
    const byId = new Map(admins.map((a) => [a.id, a.email]));
    return rows.map((r) => ({ ...r, admin: byId.get(r.adminUserId) ?? r.adminUserId }));
  }

  private audit(tx: Prisma.TransactionClient, adminUserId: string, action: string, targetType: string, targetId: string | null, metadata: Prisma.InputJsonValue) {
    return tx.platformAuditLog.create({ data: { adminUserId, action, targetType, targetId, metadata } });
  }
}
