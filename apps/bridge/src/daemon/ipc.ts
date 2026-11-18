import { rm } from 'node:fs/promises';
import { createConnection, createServer, type Server } from 'node:net';
import { chmod } from 'node:fs/promises';

/**
 * Local IPC between the daemon and its clients (CLI, Claude Code hooks, MCP server):
 * newline-delimited JSON over a Unix socket (mode 0600) or a Windows named pipe.
 */
export interface IpcRequest {
  id: number;
  method: string;
  params?: unknown;
}
export type IpcResponse =
  { id: number; result: unknown } | { id: number; error: { message: string } };

export type IpcHandlers = Record<string, (params: unknown) => Promise<unknown>>;

const MAX_LINE = 1_000_000;

export async function startIpcServer(path: string, handlers: IpcHandlers): Promise<Server> {
  if (process.platform !== 'win32') await rm(path, { force: true });
  const server = createServer((connection) => {
    let buffer = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) return connection.destroy();
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        void handle(line).then((response) => connection.write(`${JSON.stringify(response)}\n`));
      }
    });
    connection.on('error', () => undefined);
  });

  async function handle(line: string): Promise<IpcResponse> {
    let request: IpcRequest;
    try {
      request = JSON.parse(line) as IpcRequest;
    } catch {
      return { id: -1, error: { message: 'Malformed request' } };
    }
    const handler = handlers[request.method];
    if (!handler) return { id: request.id, error: { message: `Unknown method ${request.method}` } };
    try {
      return { id: request.id, result: (await handler(request.params ?? {})) ?? null };
    } catch (error) {
      return {
        id: request.id,
        error: { message: error instanceof Error ? error.message : 'Request failed' },
      };
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => resolve());
  });
  if (process.platform !== 'win32') await chmod(path, 0o600);
  return server;
}

/** One request/response round trip. Rejects quickly when the daemon is not running. */
export function ipcCall<T = unknown>(
  path: string,
  method: string,
  params?: unknown,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('DevSync daemon did not answer'));
    }, timeoutMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, method, params })}\n`));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const index = buffer.indexOf('\n');
      if (index < 0) return;
      clearTimeout(timer);
      socket.end();
      const response = JSON.parse(buffer.slice(0, index)) as IpcResponse;
      if ('error' in response) reject(new Error(response.error.message));
      else resolve(response.result as T);
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(
        Object.assign(new Error('DevSync daemon is not running (start it with `devsync start`)'), {
          cause: error,
        }),
      );
    });
  });
}
