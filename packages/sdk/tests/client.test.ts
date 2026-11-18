import { describe, expect, it, vi } from 'vitest';
import { DevSyncApiError, DevSyncClient } from '../src';

describe('DevSyncClient', () => {
  it('sends bearer auth to the versioned API and parses JSON', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }),
    );
    const client = new DevSyncClient({
      baseUrl: 'http://localhost:3000/',
      token: 'tok',
      fetch: fetchMock,
    });
    await expect(client.request('GET', '/teams')).resolves.toEqual({ hello: 'world' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/teams');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('maps error responses to DevSyncApiError', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'no' } }), {
          status: 403,
        }),
    );
    const client = new DevSyncClient({ baseUrl: 'http://x', token: 't', fetch: fetchMock });
    await expect(client.request('GET', '/teams')).rejects.toMatchObject(
      new DevSyncApiError(403, 'FORBIDDEN', 'no'),
    );
  });
});

describe('typed endpoints', () => {
  it('omits the bearer token for public device-flow calls and handles 204', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const anon = new DevSyncClient({ baseUrl: 'http://x', fetch: fetchMock });
    await anon.endSession('s1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/v1/sessions/s1/end');
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});
