import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createDatabaseClient } from '../src/client';

/**
 * Development-only demo data: one team with two projects and a repository.
 * Users are created through the app (sign-up) so passwords are hashed by Better Auth;
 * this seed attaches existing users given in SEED_EMAILS (comma-separated) to the demo team.
 */
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data in production');
}

const db = createDatabaseClient(process.env.DATABASE_URL!);
const emails = (process.env.SEED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  const users = await db.user.findMany({ where: { email: { in: emails } } });
  if (users.length === 0) {
    console.log(
      'No user found. Sign up in the app, then run: SEED_EMAILS=you@example.com pnpm db:seed',
    );
    return;
  }
  const [owner, ...others] = users;
  const team = await db.team.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo team', slug: 'demo', autonomyPolicies: { create: {} } },
  });
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: owner!.id } },
    update: { role: 'OWNER' },
    create: { teamId: team.id, userId: owner!.id, role: 'OWNER' },
  });
  for (const user of others) {
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: {},
      create: { teamId: team.id, userId: user.id, role: 'DEVELOPER' },
    });
  }
  for (const [slug, name] of [
    ['payments-api', 'Payments API'],
    ['checkout-web', 'Checkout web'],
  ] as const) {
    const project = await db.project.upsert({
      where: { teamId_slug: { teamId: team.id, slug } },
      update: {},
      create: { teamId: team.id, slug, name, createdById: owner!.id },
    });
    for (const user of users) {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        update: {},
        create: { teamId: team.id, projectId: project.id, userId: user.id, role: 'CONTRIBUTOR' },
      });
    }
    await db.repository.upsert({
      where: {
        projectId_remoteUrl: {
          projectId: project.id,
          remoteUrl: `github.com/devsync-demo/${slug}`,
        },
      },
      update: {},
      create: {
        teamId: team.id,
        projectId: project.id,
        name: slug,
        provider: 'GITHUB',
        remoteUrl: `github.com/devsync-demo/${slug}`,
      },
    });
  }
  console.log(`Seeded team "demo" with ${users.length} member(s): /t/demo`);
}

main().finally(() => db.$disconnect());
