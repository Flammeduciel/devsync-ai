import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from '../src';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const url = process.env.DATABASE_URL_TEST;

/**
 * Database-level guarantees (composite tenant FKs, partial unique indexes, CHECKs).
 * Requires `docker compose up` and `pnpm --filter @devsync/database db:test:prepare`.
 */
describe.skipIf(!url)('database constraints', () => {
  let db: DatabaseClient;
  const suffix = Date.now().toString(36);

  beforeAll(() => {
    db = createDatabaseClient(url!);
  });
  afterAll(async () => {
    await db.team.deleteMany({ where: { slug: { endsWith: suffix } } });
    await db.user.deleteMany({ where: { email: { endsWith: `${suffix}@test.local` } } });
    await db.$disconnect();
  });

  async function seedTeam(name: string) {
    const user = await db.user.create({ data: { name, email: `${name}-${suffix}@test.local` } });
    const team = await db.team.create({
      data: {
        name,
        slug: `${name}-${suffix}`,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    const project = await db.project.create({
      data: { teamId: team.id, name: 'Payments', slug: 'payments', createdById: user.id },
    });
    return { user, team, project };
  }

  it('refuses a row whose project belongs to another team', async () => {
    const a = await seedTeam('alpha');
    const b = await seedTeam('beta');
    await expect(
      db.repository.create({
        data: {
          teamId: b.team.id,
          projectId: a.project.id,
          name: 'api',
          remoteUrl: 'github.com/x/api',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.repository.create({
        data: {
          teamId: a.team.id,
          projectId: a.project.id,
          name: 'api',
          remoteUrl: 'github.com/x/api',
        },
      }),
    ).resolves.toMatchObject({ projectId: a.project.id });
  });

  it('allows a single team-default autonomy policy', async () => {
    const { team, project } = await seedTeam('gamma');
    await db.autonomyPolicy.create({ data: { teamId: team.id } });
    await expect(db.autonomyPolicy.create({ data: { teamId: team.id } })).rejects.toThrow();
    await expect(
      db.autonomyPolicy.create({ data: { teamId: team.id, projectId: project.id } }),
    ).resolves.toBeTruthy();
  });

  it('allows only one active claim per resource', async () => {
    const { user, team, project } = await seedTeam('delta');
    const machine = await db.agentMachine.create({
      data: { teamId: team.id, userId: user.id, name: 'laptop', deviceTokenHash: `hash-${suffix}` },
    });
    const agent = await db.agent.create({
      data: { teamId: team.id, userId: user.id, machineId: machine.id, name: 'claude' },
    });
    const claim = {
      teamId: team.id,
      projectId: project.id,
      agentId: agent.id,
      resourceType: 'FILE' as const,
      resourceKey: 'src/payment.service.ts',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const first = await db.resourceClaim.create({ data: claim });
    await expect(db.resourceClaim.create({ data: claim })).rejects.toThrow();
    await db.resourceClaim.update({ where: { id: first.id }, data: { releasedAt: new Date() } });
    await expect(db.resourceClaim.create({ data: claim })).resolves.toBeTruthy();
  });
});
