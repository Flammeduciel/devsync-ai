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
const sessionUpdateByDirectory = sessionUpdate
  .omit({ externalSessionId: true })
  .extend({ workingDirectory: z.string().min(1).max(1024) });
const sessionRef = z.object({ externalSessionId: z.string().min(1).max(200) });
const activity = sessionRef.extend({
  kind: z.enum(['tool_used', 'task_declared', 'summary_published']),
  summary: z.string().min(1).max(500),
  tool: z.string().max(64).optional(),
});

const API_OPERATIONS = [
  'context',
  'searchAgents',
  'activity',
  'experts',
  'inbox',
  'claim',
  'releaseClaim',
] as const;
type ApiOperation = (typeof API_OPERATIONS)[number];
const apiCall = z.object({
  operation: z.enum(API_OPERATIONS),
  params: z.record(z.string(), z.unknown()).default({}),
  workingDirectory: z.string().max(1024).optional(),
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
        desktop?: boolean;
      };
      if (n.userId === me.user.id && n.desktop !== false)
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
    'session.updateByDirectory': async (raw) => {
      const { workingDirectory, ...state } = sessionUpdateByDirectory.parse(raw);
      const keys = sessions.keysForDirectory(workingDirectory);
      for (const key of keys) await sessions.update(key, state);
      return { updated: keys.length };
    },
    'session.end': async (raw) => sessions.end(sessionRef.parse(raw).externalSessionId),
    'activity.publish': async (raw) => {
      const { externalSessionId, ...body } = activity.parse(raw);
      await sessions.activity(externalSessionId, body);
    },
    'inbox.list': async () => (await api.inbox()).items,
    /**
     * Allow-listed API proxy for the MCP server: it never sees the device token. When a working
     * directory is given and no project id, the project is found from the repository's origin remote.
     */
    'api.call': async (raw) => {
      const { operation, params, workingDirectory } = apiCall.parse(raw);
      const handler = apiOperations[operation];
      let input = params;
      if (workingDirectory && !('projectId' in input) && !('remote' in input)) {
        const repo = await detectRepository(workingDirectory);
        if (repo?.remote) input = { ...input, remote: repo.remote };
      }
      return handler(input);
    },
    'notify.test': async () =>
      notify({ title: 'DevSync', body: `Notifications work on ${hostname()}`, sound: true }),
  });

  const apiOperations: Record<ApiOperation, (p: Record<string, unknown>) => Promise<unknown>> = {
    context: (p) => api.context(p),
    searchAgents: (p) => api.searchAgents(p),
    activity: (p) => api.activity(p),
    experts: (p) => api.experts(p as { topic: string }),
    inbox: () => api.inbox(),
    claim: (p) => api.claim(p as { resourceType: string; resourceKey: string }),
    releaseClaim: (p) => api.releaseClaim(String(p.claimId)),
  };

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
