import { API_BASE_PATH } from '@devsync/protocol';

export interface DevSyncClientOptions {
  baseUrl: string;
  /** API key or device token. Sent as a Bearer token. */
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class DevSyncApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DevSyncApiError';
  }
}

/**
 * Minimal typed HTTP client for the DevSync REST API, shared by the Bridge and the MCP server.
 * Resource-specific methods are added as each API module lands.
 */
export class DevSyncClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DevSyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${API_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const error = (
        data as { error?: { code?: string; message?: string; details?: unknown } } | undefined
      )?.error;
      throw new DevSyncApiError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed with status ${response.status}`,
        error?.details,
      );
    }
    return data as T;
  }
}
