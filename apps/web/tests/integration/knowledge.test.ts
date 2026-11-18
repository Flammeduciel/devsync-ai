import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../server/services/actor';
import type { EmbeddingProvider } from '../../server/services/embeddings';
import type { QueryEmbedder } from '../../server/services/jobs';
import { KnowledgeService } from '../../server/services/knowledge.service';
import { NotificationsService } from '../../server/services/notifications.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

/**
 * Deterministic stand-in for the model: words map to shared "concept" dimensions, so synonyms in
 * different languages land close together. Exercises the real pgvector path without downloading a model.
 */
const CONCEPTS: Record<string, number> = { amount: 1, montant: 1, cents: 1, centimes: 1, payment: 2, paiement: 2, currency: 3, devise: 3, login: 10, theme: 11, dark: 11 };
function vectorOf(text: string): number[] {
  const v = new Array<number>(384).fill(0.001);
  for (const word of text.toLowerCase().split(/[^a-zà-ÿ]+/)) if (CONCEPTS[word]) v[CONCEPTS[word]]! += 1;
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}
const fakeProvider: EmbeddingProvider = { model: 'test-concepts', dimensions: 384, embedQuery: async (t) => vectorOf(t), embedPassage: async (t) => vectorOf(t) };
const fakeEmbedder: QueryEmbedder = { model: 'test-concepts', embedQuery: async (t) => vectorOf(t) };

describe.skipIf(!testDatabaseUrl)('knowledge engine', () => {
  const h = createHarness();
  const enqueued: string[] = [];
  const deps = { ...h.deps, embedder: fakeEmbedder, jobs: { enqueue: async (name: string, data: Record<string, unknown>) => void enqueued.push(`${name}:${String(data.knowledgeId)}`) } };
  const knowledge = new KnowledgeService(deps);
  const notifications = new NotificationsService(deps);
  let teamId: string;
  let projectId: string;
  let alice: Actor;
  let bob: Actor;
  let outsider: Actor;

  beforeAll(async () => {
    const a = await h.user('Ada');
    const b = await h.user('Ben');
    const c = await h.user('Cid');
    teamId = (await new TeamsService(deps).create(a.id, { name: 'Knowledge', slug: `kn-${h.run}` })).id;
    await h.db.teamMember.createMany({ data: [{ teamId, userId: b.id, role: 'DEVELOPER' }, { teamId, userId: c.id, role: 'DEVELOPER' }] });
    const projects = new ProjectsService(deps);
    projectId = (await projects.create(a.id, teamId, { name: 'Payments' })).id;
    await projects.addMember(a.id, projectId, { userId: b.id, role: 'CONTRIBUTOR' });
    alice = { type: 'HUMAN', userId: a.id };
    bob = { type: 'HUMAN', userId: b.id };
    outsider = { type: 'HUMAN', userId: c.id }; // team member without access to the project
  });
  afterAll(() => h.cleanup());

  it('publishes, embeds and finds by text, title and meaning — across languages', async () => {
    const { knowledgeId } = await knowledge.publish(alice, {
      projectId,
      kind: 'DECISION',
      title: 'Payment amounts are integers in cents',
      content: 'All APIs exchange the amount as an integer number of cents. Currency is EUR or XAF.',
      summary: 'Amounts in cents, EUR/XAF',
      tags: ['payments', 'api'],
    });
    await knowledge.publish(alice, { projectId, kind: 'DOCUMENTATION', title: 'Login page theme', content: 'The login uses a dark theme.' });
    expect(enqueued).toContain(`embed-knowledge:${knowledgeId}`);
    expect(await knowledge.embedPending(fakeProvider)).toBeGreaterThanOrEqual(2);

    const lexical = await knowledge.search(bob, teamId, { query: 'cents' });
    expect(lexical.items[0]).toMatchObject({ id: knowledgeId, matchedBy: expect.arrayContaining(['text match']) });

    const french = await knowledge.search(bob, teamId, { query: 'quel montant pour un paiement' });
    expect(french.semantic).toBe(true);
    expect(french.items[0]).toMatchObject({ id: knowledgeId, matchedBy: expect.arrayContaining(['similar meaning']) });
    expect(french.items.some((i) => i.title === 'Login page theme')).toBe(false);

    await expect(knowledge.search(outsider, teamId, { query: 'cents' })).resolves.toMatchObject({ items: [] });
    await expect(knowledge.get(outsider, knowledgeId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps private items to their author until shared', async () => {
    const { knowledgeId } = await knowledge.publish(bob, { projectId, kind: 'BRAINSTORM', title: 'Ideas for refunds', content: 'Partial refunds in cents, refund reasons…', visibility: 'PRIVATE' });
    expect((await knowledge.search(alice, teamId, { query: 'refunds' })).items).toEqual([]);
    expect((await knowledge.search(bob, teamId, { query: 'refunds' })).items[0]).toMatchObject({ id: knowledgeId, visibility: 'PRIVATE' });
    expect((await knowledge.list(bob.userId, teamId, { mine: true, visibility: 'PRIVATE' })).map((k) => k.id)).toEqual([knowledgeId]);
    await expect(knowledge.get(alice, knowledgeId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(knowledge.setVisibility(alice, knowledgeId, { visibility: 'PROJECT' })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    h.publisher.published.length = 0;
    await knowledge.setVisibility(bob, knowledgeId, { visibility: 'PROJECT' });
    expect(h.publisher.published.find((e) => e.type === 'knowledge.published')?.audience).toEqual(expect.arrayContaining([alice.userId, bob.userId]));
    expect((await knowledge.search(alice, teamId, { query: 'refunds' })).items[0]?.id).toBe(knowledgeId);
  });

  it('warns readers when what they relied on changes or becomes outdated', async () => {
    const { knowledgeId } = await knowledge.publish(alice, { projectId, kind: 'API_CONTRACT', title: 'POST /payments contract', content: 'amount: integer (cents)' });
    await knowledge.get(bob, knowledgeId, { trackUsage: true });
    await knowledge.publish(alice, { knowledgeId, projectId, kind: 'API_CONTRACT', title: 'POST /payments contract', content: 'amount: string decimal' });
    let inbox = await notifications.list(bob.userId, teamId);
    expect(inbox.items[0]).toMatchObject({ kind: 'KNOWLEDGE_PUBLISHED', title: 'Updated: POST /payments contract (v1 → v2)' });
    expect(inbox.items[0]?.body).toContain('you used v1');

    await expect(knowledge.setValidity(bob, knowledgeId, { validity: 'OUTDATED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await knowledge.setValidity(alice, knowledgeId, { validity: 'DEPRECATED', reason: 'Replaced by /v2/payments' });
    inbox = await notifications.list(bob.userId, teamId);
    expect(inbox.items[0]).toMatchObject({ title: 'Deprecated: POST /payments contract', body: expect.stringContaining('Replaced by /v2/payments') });
    expect((await knowledge.search(bob, teamId, { query: 'payments contract' })).items.some((i) => i.id === knowledgeId)).toBe(false);
    expect((await knowledge.search(bob, teamId, { query: 'payments contract', includeOutdated: true })).items.some((i) => i.id === knowledgeId)).toBe(true);

    const v1 = await knowledge.get(bob, knowledgeId, { version: 1 });
    expect(v1.content).toBe('amount: integer (cents)');
    expect(v1.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});
