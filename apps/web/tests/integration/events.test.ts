import { afterAll, describe, expect, it } from 'vitest';
import { withEvents } from '../../server/services/events.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('event outbox', () => {
  const h = createHarness();
  afterAll(() => h.cleanup());

  it('persists events with increasing sequences and publishes them after commit', async () => {
    const user = await h.user('Eve');
    const team = await new TeamsService(h.deps).create(user.id, { name: 'Events', slug: `events-${h.run}` });
    const agentId = '01a1ee8d-715d-7b0d-8f27-918b280a0001';
    await withEvents(h.deps, async (_tx, emit) => {
      await emit({ type: 'agent.status.updated', teamId: team.id, actor: { type: 'SYSTEM' }, payload: { agentId, userId: user.id, status: 'IDLE' } });
      await emit({ type: 'agent.status.updated', teamId: team.id, actor: { type: 'SYSTEM' }, payload: { agentId, userId: user.id, status: 'WORKING' } });
    });
    const [a, b] = h.publisher.published.slice(-2);
    expect(b!.sequence!).toBeGreaterThan(a!.sequence!);
    expect(await h.db.event.count({ where: { teamId: team.id } })).toBe(2);
  });

  it('neither persists nor publishes when the transaction fails', async () => {
    const user = await h.user('Fay');
    const team = await new TeamsService(h.deps).create(user.id, { name: 'Rollback', slug: `rollback-${h.run}` });
    const before = h.publisher.published.length;
    await expect(
      withEvents(h.deps, async (_tx, emit) => {
        await emit({ type: 'agent.status.updated', teamId: team.id, actor: { type: 'SYSTEM' }, payload: { agentId: user.id, userId: user.id, status: 'IDLE' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(h.publisher.published.length).toBe(before);
    expect(await h.db.event.count({ where: { teamId: team.id } })).toBe(0);
  });

  it('rejects payloads that do not match the event catalog', async () => {
    await expect(
      withEvents(h.deps, async (_tx, emit) => {
        await emit({ type: 'agent.status.updated', teamId: h.run, actor: { type: 'SYSTEM' }, payload: { status: 'DREAMING' } as never });
      }),
    ).rejects.toThrow();
  });
});
