import { API_BASE_PATH } from '@devsync/protocol';
import type { ActivityBody, DeviceAuthInput, HeartbeatBody, SessionBody } from './inputs';
import type {
  ActivityEntry,
  DeviceAuthorization,
  DeviceTokenResult,
  Expert,
  DeliverableContent,
  DeliveredItem,
  DependencyGraph,
  InboxItem,
  KnowledgeItem,
  KnowledgeListItem,
  KnowledgeSearchResult,
  ProjectLocator,
  RequestDetail,
  RequestSummary,
  RegisteredSession,
  TeamContext,
  WhoAmI,
} from './types';

export interface DevSyncClientOptions {
  baseUrl: string;
  /** API key or device token, sent as a Bearer token. Omitted for the public device-flow endpoints. */
  token?: string;
  /** Agent acting through the device token (default on the server: "claude-code"). */
  agentName?: string;
  /** "human": the device owner acts as themselves (CLI), not as one of their agents. */
  actAs?: 'human' | 'agent';
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
  private readonly agentName: string | undefined;
  private readonly actAs: 'human' | 'agent' | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DevSyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.agentName = options.agentName;
    this.actAs = options.actAs;
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
        ...(this.agentName ? { 'x-devsync-agent': this.agentName } : {}),
        ...(this.actAs === 'human' ? { 'x-devsync-actor': 'human' } : {}),
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
    return this.request<{ items: InboxItem[]; delivered: DeliveredItem[] }>('GET', '/inbox');
  }

  // ── Team directory (device-authenticated) ──
  context(query: ProjectLocator) {
    return this.request<TeamContext>('GET', withQuery('/context', query));
  }
  searchAgents(
    query: ProjectLocator & { query?: string; status?: string[]; includeOffline?: boolean },
  ) {
    return this.request<{ items: unknown[] }>('GET', withQuery('/agents/search', query));
  }
  activity(query: ProjectLocator & { agentId?: string; since?: string; limit?: number }) {
    return this.request<{ items: ActivityEntry[] }>('GET', withQuery('/activity', query));
  }
  experts(query: ProjectLocator & { topic: string; limit?: number }) {
    return this.request<{ items: Expert[] }>('GET', withQuery('/experts', query));
  }
  claim(
    body: ProjectLocator & {
      resourceType: string;
      resourceKey: string;
      reason?: string;
      ttlMinutes?: number;
      agentName?: string;
    },
  ) {
    return this.request<{
      claimId: string;
      resourceKey: string;
      expiresAt: string;
      renewed: boolean;
    }>('POST', '/claims', body);
  }
  releaseClaim(claimId: string) {
    return this.request<void>('DELETE', `/claims/${encodeURIComponent(claimId)}`);
  }

  // ── Collaboration (device-authenticated; the agent is named by X-DevSync-Agent) ──
  createRequest(body: Record<string, unknown>) {
    return this.request<RequestSummary>('POST', '/collaboration', body);
  }
  getRequest(requestId: string) {
    return this.request<RequestDetail>('GET', `/collaboration/${encodeURIComponent(requestId)}`);
  }
  requestAction(requestId: string, body: { action: string; comment?: string }) {
    return this.request<RequestSummary>(
      'POST',
      `/collaboration/${encodeURIComponent(requestId)}/actions`,
      body,
    );
  }
  comment(requestId: string, body: { body: string }) {
    return this.request<{ id: string }>(
      'POST',
      `/collaboration/${encodeURIComponent(requestId)}/comments`,
      body,
    );
  }
  requestDependencies(requestId: string) {
    return this.request<DependencyGraph>(
      'GET',
      `/collaboration/${encodeURIComponent(requestId)}/dependencies`,
    );
  }
  taskDependencies(taskId: string) {
    return this.request<DependencyGraph>(
      'GET',
      `/tasks/${encodeURIComponent(taskId)}/dependencies`,
    );
  }
  createTask(body: Record<string, unknown>) {
    return this.request<{ id: string; title: string; status: string }>('POST', '/tasks', body);
  }
  createDeliverable(body: Record<string, unknown>) {
    return this.request<{ id: string; title: string; format: string }>(
      'POST',
      '/deliverables',
      body,
    );
  }
  addDeliverableVersion(deliverableId: string, body: Record<string, unknown>) {
    return this.request<{
      deliverableId: string;
      version: number;
      versionId: string;
      uploadUrl: string | null;
    }>('POST', `/deliverables/${encodeURIComponent(deliverableId)}/versions`, body);
  }
  publishDeliverable(deliverableId: string) {
    return this.request<{ deliverableId: string; status: string }>(
      'POST',
      `/deliverables/${encodeURIComponent(deliverableId)}/publish`,
    );
  }
  readDeliverable(deliverableId: string, options: { version?: number; inline?: boolean } = {}) {
    return this.request<DeliverableContent>(
      'GET',
      withQuery(`/deliverables/${encodeURIComponent(deliverableId)}`, {
        version: options.version,
        inline: options.inline ? 1 : undefined,
      }),
    );
  }
  broadcast(body: Record<string, unknown>) {
    return this.request<{ delivered: number }>('POST', '/broadcast', body);
  }

  /** Uploads bytes to a pre-signed URL (content type and length must match the signature). */
  async upload(url: string, body: Uint8Array, contentType: string): Promise<void> {
    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new DevSyncApiError(
        response.status,
        'UPLOAD_FAILED',
        `Upload failed with status ${response.status}`,
      );
  }

  // ── Knowledge ──
  searchKnowledge(query: ProjectLocator & { query: string; tags?: string[]; kind?: string; includeOutdated?: boolean; limit?: number }) {
    return this.request<KnowledgeSearchResult>('GET', withQuery('/knowledge/search', query));
  }
  listKnowledge(query: { mine?: boolean; visibility?: string; kind?: string; tag?: string; limit?: number }) {
    return this.request<{ items: KnowledgeListItem[] }>('GET', withQuery('/knowledge', { ...query, mine: query.mine ? 1 : undefined }));
  }
  getKnowledge(knowledgeId: string, version?: number) {
    return this.request<KnowledgeItem>('GET', withQuery(`/knowledge/${encodeURIComponent(knowledgeId)}`, { version }));
  }
  publishKnowledge(body: Record<string, unknown>) {
    return this.request<{ knowledgeId: string; version: number; visibility: string }>('POST', '/knowledge', body);
  }
  setKnowledgeVisibility(knowledgeId: string, visibility: 'PRIVATE' | 'PROJECT') {
    return this.request<{ knowledgeId: string; visibility: string }>('PATCH', `/knowledge/${encodeURIComponent(knowledgeId)}/visibility`, { visibility });
  }
  setKnowledgeValidity(knowledgeId: string, body: { validity: string; reason?: string }) {
    return this.request<{ knowledgeId: string; validity: string }>('PATCH', `/knowledge/${encodeURIComponent(knowledgeId)}/validity`, body);
  }
  promoteDeliverable(body: { deliverableId: string; kind?: string; tags?: string[] }) {
    return this.request<{ knowledgeId: string; version: number }>('POST', '/knowledge/promote', body);
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
