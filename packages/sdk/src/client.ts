import { API_BASE_PATH } from '@devsync/protocol';
import type { ActivityBody, DeviceAuthInput, HeartbeatBody, SessionBody } from './inputs';
import type {
  ActivityEntry,
  DeviceAuthorization,
  DeviceTokenResult,
  Expert,
  InboxItem,
  ProjectLocator,
  RegisteredSession,
  TeamContext,
  WhoAmI,
} from './types';

export interface DevSyncClientOptions {
  baseUrl: string;
  /** API key or device token, sent as a Bearer token. Omitted for the public device-flow endpoints. */
  token?: string;
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
  private readonly token: string | undefined;
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
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = response.status === 204 ? '' : await response.text();
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

  // ── Device flow (public) ──
  authorizeDevice(input: DeviceAuthInput) {
    return this.request<DeviceAuthorization>('POST', '/devices/authorize', input);
  }
  exchangeDeviceCode(deviceCode: string) {
    return this.request<DeviceTokenResult>('POST', '/devices/token', { deviceCode });
  }

  // ── Device-authenticated ──
  whoami() {
    return this.request<WhoAmI>('GET', '/me');
  }
  registerSession(input: SessionBody) {
    return this.request<RegisteredSession>('POST', '/sessions', input);
  }
  heartbeat(sessionId: string, input: HeartbeatBody) {
    return this.request<{ status: string }>('POST', `/sessions/${sessionId}/heartbeat`, input);
  }
  endSession(sessionId: string) {
    return this.request<void>('POST', `/sessions/${sessionId}/end`);
  }
  publishActivity(input: ActivityBody) {
    return this.request<{ duplicate: boolean }>('POST', '/activities', input);
  }
  inbox() {
    return this.request<{ items: InboxItem[] }>('GET', '/inbox');
  }

  // ── Team directory (device-authenticated) ──
  context(query: ProjectLocator) {
    return this.request<TeamContext>('GET', withQuery('/context', query));
  }
  searchAgents(query: ProjectLocator & { query?: string; status?: string[]; includeOffline?: boolean }) {
    return this.request<{ items: unknown[] }>('GET', withQuery('/agents/search', query));
  }
  activity(query: ProjectLocator & { agentId?: string; since?: string; limit?: number }) {
    return this.request<{ items: ActivityEntry[] }>('GET', withQuery('/activity', query));
  }
  experts(query: ProjectLocator & { topic: string; limit?: number }) {
    return this.request<{ items: Expert[] }>('GET', withQuery('/experts', query));
  }
  claim(body: ProjectLocator & { resourceType: string; resourceKey: string; reason?: string; ttlMinutes?: number; agentName?: string }) {
    return this.request<{ claimId: string; resourceKey: string; expiresAt: string; renewed: boolean }>('POST', '/claims', body);
  }
  releaseClaim(claimId: string) {
    return this.request<void>('DELETE', `/claims/${encodeURIComponent(claimId)}`);
  }
}

/** Builds `path?key=value&key=v2`, skipping undefined values. */
export function withQuery(path: string, query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
