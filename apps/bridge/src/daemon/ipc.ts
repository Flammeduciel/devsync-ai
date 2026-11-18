import { rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { callBridge } from '@devsync/sdk';
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
export interface IpcError {
  message: string;
  /** Present when the error comes from the DevSync API. */
  status?: number;
  code?: string;
  details?: unknown;
}
export type IpcResponse = { id: number; result: unknown } | { id: number; error: IpcError };

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
      const e = error as { message?: string; status?: unknown; code?: unknown; details?: unknown };
      return {
        id: request.id,
        error: {
          message: e?.message ?? 'Request failed',
          ...(typeof e?.status === 'number' ? { status: e.status } : {}),
          ...(typeof e?.code === 'string' ? { code: e.code } : {}),
          ...(e?.details !== undefined ? { details: e.details } : {}),
        },
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

/** Client side lives in @devsync/sdk (shared with the MCP server and the plugin hooks). */
export function ipcCall<T = unknown>(path: string, method: string, params?: unknown, timeoutMs = 5000): Promise<T> {
  return callBridge<T>(method, params, { path, timeoutMs });
}
