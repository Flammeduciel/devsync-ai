import { describe, expect, it } from 'vitest';
import { checkHealth } from '../server/services/health.service';

describe('checkHealth', () => {
  it('is ok when every probe succeeds', async () => {
    const report = await checkHealth({
      database: async () => 1,
      redis: async () => 'PONG',
      storage: async () => undefined,
    });
    expect(report.status).toBe('ok');
  });

  it('is degraded on failure or timeout and reports the error', async () => {
    const report = await checkHealth(
      {
        database: async () => {
          throw new Error('connection refused');
        },
        redis: () => new Promise(() => {}),
        storage: async () => undefined,
      },
      50,
    );
    expect(report.status).toBe('degraded');
    expect(report.checks.find((c) => c.name === 'database')?.error).toBe('connection refused');
    expect(report.checks.find((c) => c.name === 'redis')?.error).toBe('timeout');
  });
});
