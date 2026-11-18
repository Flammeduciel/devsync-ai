import { afterAll, describe, expect, it } from 'vitest';
import { InvitationsService } from '../../server/services/invitations.service';
import { MembersService } from '../../server/services/members.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('teams, members and invitations', () => {
  const h = createHarness();
  const teams = new TeamsService(h.deps);
  const members = new MembersService(h.deps);
  const invitations = new InvitationsService(h.deps);
  afterAll(() => h.cleanup());

  it('makes the creator owner and creates a default autonomy policy', async () => {
    const alice = await h.user('Alice');
    const team = await teams.create(alice.id, { name: 'Payments', slug: `payments-${h.run}` });
    expect(team.role).toBe('OWNER');
    const policy = await h.db.autonomyPolicy.findFirst({ where: { teamId: team.id, projectId: null } });
    expect(policy?.level).toBe('CONTROLLED');
    await expect(teams.create(alice.id, { name: 'Again', slug: `payments-${h.run}` })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('runs the full invitation round-trip with the emailed token', async () => {
    const owner = await h.user('Owner');
    const bob = await h.user('Bob');
    const team = await teams.create(owner.id, { name: 'Core', slug: `core-${h.run}` });

    await invitations.invite(owner.id, team.id, { email: bob.email.toUpperCase(), role: 'DEVELOPER' });
    const token = decodeURIComponent(h.mailer.lastLink().split('/invitations/')[1]!);
    const stored = await h.db.teamInvitation.findFirst({ where: { teamId: team.id } });
    expect(stored?.tokenHash).not.toBe(token);

    await expect(invitations.preview(token)).resolves.toMatchObject({ teamName: 'Core', state: 'pending' });
    await expect(invitations.accept(owner.id, token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(invitations.accept(bob.id, token)).resolves.toMatchObject({ teamId: team.id });
    await expect(invitations.accept(bob.id, token)).rejects.toMatchObject({ code: 'CONFLICT' });

    const list = await members.list(owner.id, team.id);
    expect(list.find((m) => m.id === bob.id)?.role).toBe('DEVELOPER');
    await expect(invitations.invite(owner.id, team.id, { email: bob.email, role: 'VIEWER' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('revokes, replaces and expires invitations', async () => {
    const owner = await h.user('Olga');
    const team = await teams.create(owner.id, { name: 'Ops', slug: `ops-${h.run}` });
    const email = `guest-${h.run}@test.local`;

    const first = await invitations.invite(owner.id, team.id, { email, role: 'VIEWER' });
    const firstToken = decodeURIComponent(h.mailer.lastLink().split('/invitations/')[1]!);
    await invitations.invite(owner.id, team.id, { email, role: 'DEVELOPER' });
    await expect(invitations.preview(firstToken)).resolves.toMatchObject({ state: 'revoked' });

    const pending = await invitations.listPending(owner.id, team.id);
    expect(pending).toHaveLength(1);
    await invitations.revoke(owner.id, team.id, pending[0]!.id);
    await expect(invitations.revoke(owner.id, team.id, first.id)).rejects.toMatchObject({ code: 'CONFLICT' });

    const later = new InvitationsService({ ...h.deps, now: () => new Date(Date.now() + 8 * 86_400_000) });
    await invitations.invite(owner.id, team.id, { email, role: 'VIEWER' });
    const token = decodeURIComponent(h.mailer.lastLink().split('/invitations/')[1]!);
    await expect(later.preview(token)).resolves.toMatchObject({ state: 'expired' });
  });

  it('enforces role rules on members', async () => {
    const owner = await h.user('Root');
    const admin = await h.user('Adam');
    const dev = await h.user('Dana');
    const team = await teams.create(owner.id, { name: 'Roles', slug: `roles-${h.run}` });
    await h.db.teamMember.createMany({
      data: [
        { teamId: team.id, userId: admin.id, role: 'ADMIN' },
        { teamId: team.id, userId: dev.id, role: 'DEVELOPER' },
      ],
    });

    await expect(invitations.invite(admin.id, team.id, { email: `x-${h.run}@t.local`, role: 'OWNER' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(invitations.invite(dev.id, team.id, { email: `y-${h.run}@t.local`, role: 'VIEWER' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(members.updateRole(admin.id, team.id, owner.id, { role: 'VIEWER' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(members.remove(owner.id, team.id, owner.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(members.updateRole(admin.id, team.id, dev.id, { role: 'VIEWER' })).resolves.toMatchObject({ role: 'VIEWER' });
    await members.remove(dev.id, team.id, dev.id); // leaving
    await expect(members.list(dev.id, team.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(teams.remove(admin.id, team.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await teams.remove(owner.id, team.id);
    await expect(teams.get(owner.id, team.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const audit = await h.db.auditLog.findMany({ where: { teamId: team.id }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['team.created', 'member.role_changed', 'member.removed', 'team.deleted']));
  });
});
