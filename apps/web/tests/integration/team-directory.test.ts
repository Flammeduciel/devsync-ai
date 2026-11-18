import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../../server/services/agents.service';
import { ClaimsService } from '../../server/services/claims.service';
import { MemoryDeviceFlowStore } from '../../server/services/device-flow-store';
import { DevicesService, type DeviceActor } from '../../server/services/devices.service';
import { InboxService } from '../../server/services/inbox.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamDirectoryService } from '../../server/services/team-directory.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('team directory and claims', () => {
  const h = createHarness();
  let now = new Date();
  const deps = { ...h.deps, now: () => now };
  const devices = new DevicesService(deps, new MemoryDeviceFlowStore());
  const agents = new AgentsService(deps);
  const claims = new ClaimsService(deps);
  const directory = new TeamDirectoryService(deps, agents, new InboxService(deps), claims);
  const projects = new ProjectsService(deps);

  let teamId: string;
  let payments: string;
  let secret: string;
  let alice: DeviceActor;
  let bob: DeviceActor;
  let viewerDevice: DeviceActor;

  async function pair(userId: string) {
    const { deviceCode, userCode } = await devices.authorize({ machineName: `m-${userId.slice(-4)}`, bridgeVersion: '0.1.0' });
    await devices.approve(userId, { userCode, teamId });
    const r = await devices.exchange(deviceCode);
    return (await devices.authenticate((r as { deviceToken: string }).deviceToken))!;
  }

  beforeAll(async () => {
    const [a, b, c] = [await h.user('Alba'), await h.user('Boris'), await h.user('Cyd')];
    const team = await new TeamsService(deps).create(a.id, { name: 'Directory', slug: `dir-${h.run}` });
    teamId = team.id;
    await h.db.teamMember.createMany({ data: [{ teamId, userId: b.id, role: 'DEVELOPER' }, { teamId, userId: c.id, role: 'DEVELOPER' }] });
    payments = (await projects.create(a.id, teamId, { name: 'Payments' })).id;
    secret = (await projects.create(a.id, teamId, { name: 'Secret' })).id;
    await projects.addRepository(a.id, payments, { remoteUrl: 'github.com/acme/payments' });
    await projects.addMember(a.id, payments, { userId: b.id, role: 'CONTRIBUTOR' });
    await projects.addMember(a.id, payments, { userId: c.id, role: 'VIEWER' });
    alice = await pair(a.id);
    bob = await pair(b.id);
    viewerDevice = await pair(c.id);

    const aSession = await agents.registerSession(alice, { externalSessionId: 'a1', repositoryRemote: 'git@github.com:acme/payments.git', branch: 'feat/api', specialties: ['backend', 'payments'] });
    await agents.heartbeat(alice, aSession.sessionId, { status: 'WORKING', currentTask: 'Payments API contract' });
    await agents.publishActivity(alice, { sessionId: aSession.sessionId, kind: 'tool_used', summary: 'Edited src/webhooks/stripe.ts', tool: 'Edit' });
    const secretSession = await agents.registerSession(alice, { externalSessionId: 'a2', projectId: secret });
    await agents.publishActivity(alice, { sessionId: secretSession.sessionId, kind: 'tool_used', summary: 'Edited secret.ts' });
    await agents.registerSession(bob, { externalSessionId: 'b1', repositoryRemote: 'https://github.com/acme/payments', specialties: ['frontend'] });
    await agents.registerSession(viewerDevice, { externalSessionId: 'c1' });
  });
  afterAll(() => h.cleanup());

  it('gives Bob the project context without leaking projects he cannot see', async () => {
    const context = await directory.context(bob, { remote: 'git@github.com:acme/payments.git' });
    expect(context.project).toMatchObject({ name: 'Payments', access: 'write' });
    const teammate = context.teammates.find((t) => t.owner === 'Alba')!;
    expect(teammate).toMatchObject({ status: 'WORKING', currentTask: 'Payments API contract', projects: ['Payments'], branches: ['feat/api'] });
    expect(JSON.stringify(context)).not.toContain('Secret');
    expect(JSON.stringify(context.recentActivity)).not.toContain('secret.ts');
    expect(context.recentActivity.some((a) => a.summary.includes('stripe.ts'))).toBe(true);
  });

  it('searches agents and finds experts with reasons', async () => {
    expect((await directory.searchAgents(bob, { query: 'payments' })).map((a) => a.user.name)).toContain('Alba');
    const experts = await directory.findExperts(bob, { topic: 'stripe payments webhooks' });
    expect(experts[0]).toMatchObject({ owner: 'Alba' });
    expect(experts[0]!.reasons.join(' ')).toContain('specialty: payments');
  });

  it('arbitrates claims between agents', async () => {
    const first = await claims.claim(alice, { remote: 'github.com/acme/payments', resourceType: 'FILE', resourceKey: './src/payment.service.ts', reason: 'Refactoring' });
    expect(first).toMatchObject({ resourceKey: 'src/payment.service.ts', renewed: false });
    await expect(claims.claim(bob, { remote: 'github.com/acme/payments', resourceType: 'FILE', resourceKey: 'src/payment.service.ts' })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { claim: { holder: { userName: 'Alba' } } },
    });
    await expect(claims.claim(alice, { projectId: payments, resourceType: 'FILE', resourceKey: 'src/payment.service.ts' })).resolves.toMatchObject({ renewed: true });
    await expect(claims.claim(viewerDevice, { projectId: payments, resourceType: 'FILE', resourceKey: 'x.ts' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(claims.release(bob, first.claimId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await directory.context(bob, { projectId: payments })).claims).toHaveLength(1);

    now = new Date(now.getTime() + 2 * 60 * 60_000); // claim expired
    await expect(claims.claim(bob, { projectId: payments, resourceType: 'FILE', resourceKey: 'src/payment.service.ts' })).resolves.toMatchObject({ renewed: false });
    now = new Date();
  });
});
