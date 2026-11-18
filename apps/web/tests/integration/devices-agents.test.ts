import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../../server/services/agents.service';
import { MemoryDeviceFlowStore } from '../../server/services/device-flow-store';
import { DevicesService, type DeviceActor } from '../../server/services/devices.service';
import { InboxService } from '../../server/services/inbox.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('device pairing and agent registry', () => {
  const h = createHarness();
  let now = new Date();
  const deps = { ...h.deps, now: () => now };
  const revoked: string[] = [];
  const agents = new AgentsService(deps);
  const devices = new DevicesService(deps, new MemoryDeviceFlowStore(), async ({ machineId }) => {
    revoked.push(machineId);
    await agents.disconnectMachine(machineId);
  });
  const teams = new TeamsService(deps);
  const projects = new ProjectsService(deps);

  let owner: { id: string };
  let viewer: { id: string };
  let teamId: string;
  let projectId: string;

  async function pair(userId: string): Promise<{ token: string; device: DeviceActor }> {
    const { deviceCode, userCode } = await devices.authorize({
      machineName: 'laptop',
      bridgeVersion: '0.1.0',
      os: 'darwin',
    });
    await devices.approve(userId, { userCode: userCode.toLowerCase().replace('-', ' '), teamId });
    const result = await devices.exchange(deviceCode);
    if (result.status !== 'approved') throw new Error('not approved');
    const device = await devices.authenticate(result.deviceToken);
    return { token: result.deviceToken, device: device! };
  }

  beforeAll(async () => {
    owner = await h.user('Pia');
    viewer = await h.user('Vera');
    const team = await teams.create(owner.id, { name: 'Agents', slug: `agents-${h.run}` });
    teamId = team.id;
    await h.db.teamMember.create({ data: { teamId, userId: viewer.id, role: 'VIEWER' } });
    const project = await projects.create(owner.id, teamId, { name: 'Payments' });
    projectId = project.id;
    await projects.addRepository(owner.id, projectId, { remoteUrl: 'github.com/acme/payments' });
  });
  afterAll(() => h.cleanup());

  it('runs the device flow once and stores only a token hash', async () => {
    const { deviceCode, userCode, verificationUriComplete } = await devices.authorize({
      machineName: 'mbp',
      bridgeVersion: '0.1.0',
    });
    expect(verificationUriComplete).toBe(`http://app.test/device?code=${userCode}`);
    await expect(devices.exchange(deviceCode)).resolves.toEqual({ status: 'pending' });
    await expect(devices.describe(userCode)).resolves.toMatchObject({ machineName: 'mbp' });
    await expect(devices.approve(viewer.id, { userCode, teamId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await devices.approve(owner.id, { userCode, teamId });
    const result = await devices.exchange(deviceCode);
    expect(result).toMatchObject({ status: 'approved', teamId, userId: owner.id });
    await expect(devices.exchange(deviceCode)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const token = (result as { deviceToken: string }).deviceToken;
    expect(token.startsWith('dsd_')).toBe(true);
    const stored = await h.db.agentMachine.findFirst({ where: { teamId, name: 'mbp' } });
    expect(stored?.deviceTokenHash).not.toContain(token);
    await expect(devices.authenticate(token)).resolves.toMatchObject({ teamId, userId: owner.id });
    await expect(devices.authenticate('dsd_wrong')).resolves.toBeNull();
  });

  it('honours a denial', async () => {
    const { deviceCode, userCode } = await devices.authorize({
      machineName: 'x',
      bridgeVersion: '0.1.0',
    });
    await devices.deny(owner.id, userCode);
    await expect(devices.exchange(deviceCode)).resolves.toEqual({ status: 'denied' });
  });

  it('registers sessions, aggregates status and emits events', async () => {
    const { device } = await pair(owner.id);
    h.publisher.published.length = 0;
    const {
      agentId,
      sessionId,
      projectId: resolved,
    } = await agents.registerSession(device, {
      externalSessionId: 'claude-1',
      repositoryRemote: 'git@github.com:acme/payments.git',
      branch: 'feat/checkout',
    });
    expect(resolved).toBe(projectId);
    expect(h.publisher.types()).toEqual([
      'agent.connected',
      'agent.activity.updated',
      'agent.status.updated',
    ]);

    await agents.heartbeat(device, sessionId, {
      status: 'WORKING',
      currentTask: 'Implement payment form',
    });
    const listed = await agents.listForTeam(owner.id, teamId);
    const agent = listed.find((a) => a.id === agentId)!;
    expect(agent).toMatchObject({ status: 'WORKING', currentTask: 'Implement payment form' });
    expect(agent.sessions[0]?.project?.name).toBe('Payments');

    const second = await agents.registerSession(device, { externalSessionId: 'claude-2' });
    await agents.heartbeat(device, second.sessionId, { status: 'IDLE' });
    await agents.endSession(device, sessionId);
    expect((await agents.listForTeam(owner.id, teamId)).find((a) => a.id === agentId)?.status).toBe(
      'IDLE',
    );
  });

  it('dedupes activities by producer id and checks session ownership', async () => {
    const a = await pair(owner.id);
    const b = await pair(owner.id);
    const { sessionId } = await agents.registerSession(a.device, { externalSessionId: 'own' });
    const id = '01a1ee8d-715d-7b0d-8f27-918b280affff';
    await expect(
      agents.publishActivity(a.device, {
        id,
        sessionId,
        kind: 'tool_used',
        summary: 'Edited payment.service.ts',
        tool: 'Edit',
      }),
    ).resolves.toEqual({ duplicate: false });
    await expect(
      agents.publishActivity(a.device, {
        id,
        sessionId,
        kind: 'tool_used',
        summary: 'Edited payment.service.ts',
        tool: 'Edit',
      }),
    ).resolves.toEqual({ duplicate: true });
    await expect(agents.heartbeat(b.device, sessionId, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('closes stale sessions and marks agents offline', async () => {
    const { device } = await pair(owner.id);
    const { agentId } = await agents.registerSession(device, { externalSessionId: 'stale' });
    now = new Date(now.getTime() + 5 * 60_000);
    h.publisher.published.length = 0;
    expect(await agents.sweepStaleSessions(200, { teamId })).toBeGreaterThan(0);
    const offline = h.publisher.published.find(
      (e) =>
        e.type === 'agent.disconnected' && (e.payload as { agentId: string }).agentId === agentId,
    );
    expect(offline?.payload).toMatchObject({ reason: 'timeout' });
    now = new Date();
  });

  it('revocation disconnects the machine and invalidates its token', async () => {
    const { token, device } = await pair(owner.id);
    await agents.registerSession(device, { externalSessionId: 'to-revoke' });
    await expect(devices.revoke(viewer.id, teamId, device.machineId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await devices.revoke(owner.id, teamId, device.machineId);
    expect(revoked).toContain(device.machineId);
    await expect(devices.authenticate(token)).resolves.toBeNull();
    const sessions = await h.db.agentSession.count({
      where: { agent: { machineId: device.machineId }, endedAt: null },
    });
    expect(sessions).toBe(0);
  });

  it('rejects tokens of members who left the team, and foreign projects', async () => {
    const dev = await h.user('Leo');
    await h.db.teamMember.create({ data: { teamId, userId: dev.id, role: 'DEVELOPER' } });
    const { token, device } = await pair(dev.id);
    await expect(
      agents.registerSession(device, { externalSessionId: 's', projectId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await h.db.teamMember.delete({ where: { teamId_userId: { teamId, userId: dev.id } } });
    await expect(devices.authenticate(token)).resolves.toBeNull();
  });

  it('returns an empty inbox until requests exist', async () => {
    await expect(new InboxService(deps).forUser(owner.id, teamId)).resolves.toEqual([]);
  });
});
