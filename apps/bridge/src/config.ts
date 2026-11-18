import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface BridgeConfig {
  serverUrl: string;
  machineId?: string;
  teamId?: string;
  teamSlug?: string;
  userId?: string;
  userEmail?: string;
}

export const DEFAULT_SERVER_URL = 'http://localhost:3000';

export function bridgePaths(home = process.env.DEVSYNC_HOME ?? join(homedir(), '.devsync')) {
  return {
    home,
    config: join(home, 'config.json'),
    /** Device token, readable by the user only. */
    credentials: join(home, 'credentials'),
    state: join(home, 'state.json'),
    outbox: join(home, 'outbox.json'),
    socket:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\devsync-${process.env.USERNAME ?? 'user'}`
        : join(home, 'bridge.sock'),
    pid: join(home, 'bridge.pid'),
    log: join(home, 'bridge.log'),
  };
}
export type BridgePaths = ReturnType<typeof bridgePaths>;

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Write to a temp file then rename: a crash never leaves a half-written file. */
export async function writeJsonAtomic(path: string, data: unknown, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode });
  await rename(tmp, path);
}

export const loadConfig = (paths: BridgePaths) =>
  readJson<BridgeConfig>(paths.config, {
    serverUrl: process.env.DEVSYNC_SERVER_URL ?? DEFAULT_SERVER_URL,
  });

export const saveConfig = (paths: BridgePaths, config: BridgeConfig) =>
  writeJsonAtomic(paths.config, config);

export async function loadToken(paths: BridgePaths): Promise<string | null> {
  try {
    return (await readFile(paths.credentials, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

export async function saveToken(paths: BridgePaths, token: string): Promise<void> {
  await mkdir(paths.home, { recursive: true, mode: 0o700 });
  await writeFile(paths.credentials, token, { mode: 0o600 });
  await chmod(paths.credentials, 0o600);
}

export async function clearCredentials(paths: BridgePaths): Promise<void> {
  await rm(paths.credentials, { force: true });
  await rm(paths.state, { force: true });
  await rm(paths.outbox, { force: true });
}
