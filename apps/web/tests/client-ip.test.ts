import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../server/infrastructure/redis', () => ({ redis: () => ({}) }));
const { clientIp } = await import('../server/infrastructure/rate-limit');

const req = (xff?: string) => new Request('http://x', { headers: xff ? { 'x-forwarded-for': xff } : {} });

describe('clientIp', () => {
  afterEach(() => delete process.env.TRUSTED_PROXY_HOPS);
  it('takes the address seen by the trusted proxy, not a forged first entry', () => {
    expect(clientIp(req('6.6.6.6, 203.0.113.7'))).toBe('203.0.113.7');
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(clientIp(req('6.6.6.6, 203.0.113.7, 10.0.0.2'))).toBe('203.0.113.7');
    expect(clientIp(req())).toBe('unknown');
  });
});
