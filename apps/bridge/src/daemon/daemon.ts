import { hostname } from 'node:os';
import { createLogger, type Logger } from '@devsync/config';
import type { Envelope } from '@devsync/protocol';
import { DevSyncClient } from '@devsync/sdk';
import { declaredAgentStatusSchema } from '@devsync/validation';
import { z } from 'zod';
import { loadConfig, loadToken, type BridgePaths } from '../config';
import { createRealtimeLink, type RealtimeLink } from '../connection/realtime-link';
import { detectRepository } from '../git/repo';
import { createNotifier, type Notifier } from '../notifications/notifier';
import { Outbox } from '../queue/outbox';
import { DeliveryState } from '../queue/state';
import { HEARTBEAT_INTERVAL_MS, SessionManager } from '../sessions/session-manager';
import { BRIDGE_VERSION } from '../version';
import { startIpcServer } from './ipc';

const sessionStart = z.object({
  externalSessionId: z.string().min(1).max(200),
  workingDirectory: z.string().max(1024).optional(),
  agentName: z.string().max(100).optional(),
  pluginVersion: z.string().max(32).optional(),
  specialties: z.array(z.string().max(48)).max(20).optional(),
});
const sessionUpdate = z.object({
  externalSessionId: z.string().min(1).max(200),
  status: declaredAgentStatusSchema.optional(),
  currentTask: z.string().max(500).nullable().optional(),
});
const sessionRef = z.object({ externalSessionId: z.string().min(1).max(200) });
const activity = sessionRef.extend({
  kind: z.enum(['tool_used', 'task_declared', 'summary_published']),
  summary: z.string().min(1).max(500),
  tool: z.string().max(64).optional(),
});

/** Long-running process: one per machine, many Claude Code sessions. */
export async function runDaemon(
  paths: BridgePaths,
  options: { logger?: Logger; notifier?: Notifier } = {},
) {
  const logger = options.logger ?? createLogger('bridge');
  const notify = options.notifier ?? createNotifier();
  const config = await loadConfig(paths);
  const token = await loadToken(paths);
  if (!token) throw new Error('This machine is not paired. Run `devsync login` first.');

  const api = new DevSyncClient({ baseUrl: config.serverUrl, token });
  const me = await api.whoami();
  const outbox = await new Outbox(paths.outbox).load();
  const state = await DeliveryState.load(paths.state);
  const sessions = new SessionManager(api, outbox, logger);
  let unauthorized = false;
  let link: RealtimeLink | undefined;

  const onUnauthorized = () => {
    if (unauthorized) return;
    unauthorized = true;
    link?.close();
    logger.error(
      'device token rejected (machine revoked or membership removed); run `devsync login` again',
    );
    void notify({
      title: 'DevSync disconnected',
      body: 'This machine is no longer authorized. Run devsync login.',
    });
  };
  sessions.onTokenRejected(onUnauthorized);

  const onEvent = async (event: Envelope) => {
    logger.debug({ type: event.type, sequence: event.sequence }, 'event received');
    if (event.type === 'notification.created') {
      const n = event.payload as {
        userId: string;
        title: string;
        body?: string;
        playSound: boolean;
      };
      if (n.userId === me.user.id)
        await notify({ title: n.title, ...(n.body ? { body: n.body } : {}), sound: n.playSound });
    }
  };

  link = createRealtimeLink({ url: me.realtimeUrl, token, state, logger, onEvent, onUnauthorized });

  const ipc = await startIpcServer(paths.socket, {
    status: async () => ({
      version: BRIDGE_VERSION,
      realtime: unauthorized ? 'unauthorized' : link?.status,
      machine: me.machine,
      team: me.team,
      user: me.user,
      sessions: sessions.list(),
      pendingOutbox: outbox.size,
    }),
    'session.start': async (raw) => {
      const input = sessionStart.parse(raw);
      const repo = input.workingDirectory ? await detectRepository(input.workingDirectory) : null;
      return sessions.start({
        externalSessionId: input.externalSessionId,
        ...(input.agentName ? { agentName: input.agentName } : {}),
        ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {}),
        ...(repo?.branch ? { branch: repo.branch } : {}),
        ...(repo?.remote ? { repositoryRemote: repo.remote } : {}),
        ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {}),
        ...(input.specialties ? { specialties: input.specialties } : {}),
      });
    },
    'session.update': async (raw) => {
      const { externalSessionId, ...state } = sessionUpdate.parse(raw);
      await sessions.update(externalSessionId, state);
    },
    'session.end': async (raw) => sessions.end(sessionRef.parse(raw).externalSessionId),
    'activity.publish': async (raw) => {
      const { externalSessionId, ...body } = activity.parse(raw);
      await sessions.activity(externalSessionId, body);
    },
    'inbox.list': async () => (await api.inbox()).items,
    'notify.test': async () =>
      notify({ title: 'DevSync', body: `Notifications work on ${hostname()}`, sound: true }),
  });

  const timer = setInterval(
    () => void sessions.tick().catch((error) => logger.warn({ err: error }, 'tick failed')),
    HEARTBEAT_INTERVAL_MS,
  );
  logger.info(
    { team: me.team.slug, machine: me.machine.name, socket: paths.socket },
    'DevSync Bridge running',
  );

  return {
    async stop() {
      clearInterval(timer);
      link?.close();
      ipc.close();
      await state.flush();
    },
  };
}
