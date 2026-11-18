import { callBridge, type BridgeError } from '@devsync/sdk';

export type ApiOperation =
  | 'context'
  | 'searchAgents'
  | 'activity'
  | 'experts'
  | 'inbox'
  | 'claim'
  | 'releaseClaim'
  | 'createRequest'
  | 'getRequest'
  | 'requestAction'
  | 'comment'
  | 'requestDependencies'
  | 'taskDependencies'
  | 'createDeliverable'
  | 'addDeliverableVersion'
  | 'publishDeliverable'
  | 'readDeliverable'
  | 'uploadDeliverableFile'
  | 'broadcast'
  | 'searchKnowledge'
  | 'listKnowledge'
  | 'getKnowledge'
  | 'publishKnowledge'
  | 'setKnowledgeVisibility'
  | 'setKnowledgeValidity'
  | 'promoteDeliverable';

export interface BridgeClient {
  api<T>(operation: ApiOperation, params?: Record<string, unknown>): Promise<T>;
  call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** Project directory of the Claude Code session (the daemon maps it to a project via the Git remote). */
export const workingDirectory = (): string => process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

export function createBridgeClient(socketPath?: string): BridgeClient {
  const options = socketPath ? { path: socketPath } : {};
  return {
    api: (operation, params = {}) =>
      callBridge('api.call', { operation, params, workingDirectory: workingDirectory() }, options),
    call: (method, params = {}) => callBridge(method, params, options),
  };
}

/** Error text written for the model: what happened and what to do next. */
export function describeError(error: unknown): string {
  const e = error as BridgeError;
  if (e?.unavailable)
    return 'DevSync is not reachable on this machine: the Bridge daemon is not running. Ask the developer to run `devsync start` (or `devsync login` first if the machine is not paired). Continue the task without team features.';
  if (e?.status === 401)
    return 'This machine is no longer authorized in DevSync (revoked token). Ask the developer to run `devsync login`.';
  if (e?.status === 404) return `Not found: ${e.message}`;
  if (e?.status === 403) return `Not allowed: ${e.message}`;
  if (e?.status === 409) return `Conflict: ${e.message}`;
  return `DevSync error: ${e?.message ?? String(error)}`;
}
