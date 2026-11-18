import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InvitationsService } from '../../server/services/invitations.service';
import { MembersService } from '../../server/services/members.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('projects and multi-tenant isolation', () => {
  const h = createHarness();
  const teams = new TeamsService(h.deps);
  const projects = new ProjectsService(h.deps);
  const members = new MembersService(h.deps);
  const invitations = new InvitationsService(h.deps);

  let a: { owner: string; dev: string; viewer: string; teamId: string; projectId: string };
  let b: { owner: string; teamId: string; projectId: string };

  beforeAll(async () => {
    const [ao, ad, av, bo] = await Promise.all([h.user('Ann'), h.user('Dev'), h.user('Vic'), h.user('Ben')]);
    const ta = await teams.create(ao!.id, { name: 'Team A', slug: `a-${h.run}` });
    const tb = await teams.create(bo!.id, { name: 'Team B', slug: `b-${h.run}` });
    await h.db.teamMember.createMany({
      data: [
        { teamId: ta.id, userId: ad!.id, role: 'DEVELOPER' },
        { teamId: ta.id, userId: av!.id, role: 'VIEWER' },
      ],
    });
    const pa = await projects.create(ao!.id, ta.id, { name: 'Checkout' });
    const pb = await projects.create(bo!.id, tb.id, { name: 'Secret' });
    a = { owner: ao!.id, dev: ad!.id, viewer: av!.id, teamId: ta.id, projectId: pa.id };
    b = { owner: bo!.id, teamId: tb.id, projectId: pb.id };
  });
  afterAll(() => h.cleanup());

  it('hides every team B resource from team A users (NOT_FOUND, never FORBIDDEN)', async () => {
    const calls = [
      () => teams.get(a.owner, b.teamId),
      () => teams.update(a.owner, b.teamId, { name: 'pwned' }),
      () => teams.remove(a.owner, b.teamId),
      () => members.list(a.owner, b.teamId),
      () => members.remove(a.owner, b.teamId, b.owner),
      () => invitations.invite(a.owner, b.teamId, { email: `z-${h.run}@t.local`, role: 'VIEWER' }),
      () => invitations.listPending(a.owner, b.teamId),
      () => projects.list(a.owner, b.teamId),
      () => projects.create(a.owner, b.teamId, { name: 'Injected' }),
      () => projects.get(a.owner, b.projectId),
      () => projects.update(a.owner, b.projectId, { name: 'Renamed' }),
      () => projects.remove(a.owner, b.projectId),
      () => projects.listMembers(a.owner, b.projectId),
      () => projects.addMember(a.owner, b.projectId, { userId: a.owner, role: 'MAINTAINER' }),
      () => projects.listRepositories(a.owner, b.projectId),
      () => projects.addRepository(a.owner, b.projectId, { remoteUrl: 'https://github.com/x/y' }),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await h.db.project.count({ where: { teamId: b.teamId, deletedAt: null } })).toBe(1);
  });

  it('refuses to add a user of another team to a project', async () => {
    await expect(projects.addMember(a.owner, a.projectId, { userId: b.owner, role: 'CONTRIBUTOR' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('scopes project visibility and rights by membership', async () => {
    expect(await projects.list(a.dev, a.teamId)).toHaveLength(0);
    await expect(projects.get(a.dev, a.projectId)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await projects.addMember(a.owner, a.projectId, { userId: a.dev, role: 'CONTRIBUTOR' });
    await projects.addMember(a.owner, a.projectId, { userId: a.viewer, role: 'MAINTAINER' });
    expect(await projects.list(a.dev, a.teamId)).toHaveLength(1);
    await expect(projects.get(a.viewer, a.projectId)).resolves.toMatchObject({ access: 'read' });
    await expect(projects.update(a.dev, a.projectId, { name: 'Renamed' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(projects.create(a.viewer, a.teamId, { name: 'Nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets a developer manage a project they created', async () => {
    const own = await projects.create(a.dev, a.teamId, { name: 'Dev Tools' });
    await expect(projects.update(a.dev, own.id, { description: 'Internal CLI' })).resolves.toMatchObject({ description: 'Internal CLI' });
  });

  it('normalizes, dedupes and soft-deletes repositories', async () => {
    const repo = await projects.addRepository(a.owner, a.projectId, { remoteUrl: 'git@github.com:acme/checkout.git' });
    expect(repo).toMatchObject({ remoteUrl: 'github.com/acme/checkout', provider: 'GITHUB', name: 'checkout' });
    await expect(projects.addRepository(a.owner, a.projectId, { remoteUrl: 'https://github.com/acme/checkout' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await projects.removeRepository(a.owner, a.projectId, repo.id);
    expect(await projects.listRepositories(a.owner, a.projectId)).toHaveLength(0);
    await expect(projects.addRepository(a.owner, a.projectId, { remoteUrl: 'https://github.com/acme/checkout' })).resolves.toBeTruthy();
  });
});
