import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../../server/services/agents.service';
import { MemoryDeviceFlowStore } from '../../server/services/device-flow-store';
import { DevicesService } from '../../server/services/devices.service';
import { PlatformAdminService } from '../../server/services/platform-admin.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('platform admin console', () => {
  const h = createHarness();
  const controls: string[] = [];
  let adminId: string;
  let devId: string;
  let teamId: string;
  let admin: PlatformAdminService;
  const teams = new TeamsService(h.deps);
  const devices = new DevicesService(h.deps, new MemoryDeviceFlowStore());

  beforeAll(async () => {
    const a = await h.user('Root');
    const d = await h.user('Dina');
    adminId = a.id;
    devId = d.id;
    admin = new PlatformAdminService(h.deps, async (m) => void controls.push(m.type), () => new Set([a.email]));
    teamId = (await teams.create(d.id, { name: 'Tenant', slug: `tenant-${h.run}` })).id;
  });
  afterAll(() => h.cleanup());

  it('is hidden from non-admins and from unverified admin emails', async () => {
    await expect(admin.overview(devId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await h.db.user.update({ where: { id: adminId }, data: { emailVerified: false } });
    await expect(admin.overview(adminId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await h.db.user.update({ where: { id: adminId }, data: { emailVerified: true } });
    await expect(admin.overview(adminId)).resolves.toMatchObject({ signupMode: expect.any(String) });
  });

  it('suspends a user everywhere (web, devices) and audits it', async () => {
    const { deviceCode, userCode } = await devices.authorize({ machineName: 'dina-mbp', bridgeVersion: '0.1.0' });
    await devices.approve(devId, { userCode, teamId });
    const token = ((await devices.exchange(deviceCode)) as { deviceToken: string }).deviceToken;
    await expect(devices.authenticate(token)).resolves.not.toBeNull();

    await admin.setUserSuspended(adminId, devId, true, 'abuse');
    await expect(devices.authenticate(token)).resolves.toBeNull();
    expect(controls).toContain('user.suspended');
    await expect(admin.setUserSuspended(adminId, adminId, true)).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await admin.setUserSuspended(adminId, devId, false);
    await expect(devices.authenticate(token)).resolves.not.toBeNull();
    expect((await admin.auditLog(adminId)).map((r) => r.action).slice(0, 2)).toEqual(['user.reactivated', 'user.suspended']);
  });

  it('suspends a team: it disappears for its members until reactivated', async () => {
    await admin.setTeamSuspended(adminId, teamId, true);
    await expect(teams.get(devId, teamId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await teams.listMine(devId)).some((t) => t.id === teamId)).toBe(false);
    await admin.setTeamSuspended(adminId, teamId, false);
    await expect(teams.get(devId, teamId)).resolves.toMatchObject({ id: teamId });
    const listed = (await admin.listTeams(adminId, `tenant-${h.run}`))[0];
    expect(listed).toMatchObject({ members: 1, machines: 1, suspendedAt: null });
  });

  it('sets the sign-up mode', async () => {
    await admin.setSignupMode(adminId, 'INVITE_ONLY');
    expect((await admin.settings()).signupMode).toBe('INVITE_ONLY');
    await admin.setSignupMode(adminId, 'OPEN');
  });
});
