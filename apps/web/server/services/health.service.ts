export type DependencyName = 'database' | 'redis' | 'storage';

export interface DependencyStatus {
  name: DependencyName;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: DependencyStatus[];
}

export type HealthProbe = () => Promise<unknown>;

/** Runs every probe in parallel with a timeout. Pure: probes are injected, so it is unit-testable. */
export async function checkHealth(
  probes: Record<DependencyName, HealthProbe>,
  timeoutMs = 2_000,
): Promise<HealthReport> {
  const checks = await Promise.all(
    (Object.entries(probes) as [DependencyName, HealthProbe][]).map(async ([name, probe]) => {
      const start = performance.now();
      try {
        await Promise.race([
          probe(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ]);
        return { name, ok: true, latencyMs: Math.round(performance.now() - start) };
      } catch (error) {
        return {
          name,
          ok: false,
          latencyMs: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : 'unknown error',
        };
      }
    }),
  );
  return { status: checks.every((c) => c.ok) ? 'ok' : 'degraded', checks };
}
