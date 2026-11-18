import { createDatabaseClient, type DatabaseClient } from '@devsync/database';
import { newId } from '@devsync/shared';
import type { MailMessage, Mailer, ServiceDeps } from '../../server/services/ports';

export const testDatabaseUrl = process.env.DATABASE_URL_TEST;

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  lastLink(): string {
    const match = /(https?:\/\/\S+)/.exec(this.sent.at(-1)?.text ?? '');
    if (!match) throw new Error('no link in last email');
    return match[1]!;
  }
}

export function createHarness() {
  const db: DatabaseClient = createDatabaseClient(testDatabaseUrl!);
  const mailer = new MemoryMailer();
  const deps: ServiceDeps = { db, mailer, appUrl: 'http://app.test' };
  const run = newId().slice(-12);
  const createdUsers: string[] = [];

  async function user(name: string) {
    const created = await db.user.create({
      data: { name, email: `${name.toLowerCase()}-${run}@test.local`, emailVerified: true },
    });
    createdUsers.push(created.id);
    return created;
  }

  async function cleanup() {
    await db.team.deleteMany({ where: { members: { some: { userId: { in: createdUsers } } } } });
    await db.team.deleteMany({ where: { slug: { endsWith: run } } });
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
    await db.$disconnect();
  }

  return { db, mailer, deps, run, user, cleanup };
}
