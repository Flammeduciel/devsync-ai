import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

/** Local socket of the DevSync Bridge daemon (same rule as the daemon itself). */
export function bridgeSocketPath(
  home = process.env.DEVSYNC_HOME ?? join(homedir(), '.devsync'),
): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\devsync-${process.env.USERNAME ?? 'user'}`
    : join(home, 'bridge.sock');
}

export interface BridgeError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  /** The daemon is not running or not reachable. */
  unavailable?: boolean;
}

/** One request/response round trip with the daemon (newline-delimited JSON). */
export function callBridge<T = unknown>(
  method: string,
  params?: unknown,
  options: { path?: string; timeoutMs?: number } = {},
): Promise<T> {
  const path = options.path ?? bridgeSocketPath();
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error('DevSync daemon did not answer'), { unavailable: true }));
    }, options.timeoutMs ?? 5000);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, method, params })}\n`));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const index = buffer.indexOf('\n');
      if (index < 0) return;
      clearTimeout(timer);
      socket.end();
      const response = JSON.parse(buffer.slice(0, index)) as {
        result?: unknown;
        error?: { message: string };
      };
      if (response.error) reject(Object.assign(new Error(response.error.message), response.error));
      else resolve(response.result as T);
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(
        Object.assign(new Error('DevSync daemon is not running (start it with `devsync start`)'), {
          cause: error,
          unavailable: true,
        }),
      );
    });
  });
}
