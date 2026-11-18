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

describe.skipIf(!testDatabaseUrl)('continuity across Claude Code conversations', () => {
  const h = createHarness();
  let now = new Date();
  const deps = { ...h.deps, now: () => now };
  const devices = new DevicesService(deps, new MemoryDeviceFlowStore());
  const agents = new AgentsService(deps);
  const claims = new ClaimsService(deps);
  const directory = new TeamDirectoryService(deps, agents, new InboxService(deps), claims);
  let device: DeviceActor;
  let projectId: string;
  let teamId: string;

  beforeAll(async () => {
    const dev = await h.user('Cora');
    teamId = (await new TeamsService(deps).create(dev.id, { name: 'Continuity', slug: `cont-${h.run}` })).id;
    projectId = (await new ProjectsService(deps).create(dev.id, teamId, { name: 'Shop' })).id;
    const { deviceCode, userCode } = await devices.authorize({ machineName: 'cora-mbp', bridgeVersion: '0.1.0' });
    await devices.approve(dev.id, { userCode, teamId });
    const r = await devices.exchange(deviceCode);
    device = (await devices.authenticate((r as { deviceToken: string }).deviceToken))!;
  });
  afterAll(() => h.cleanup());

  it('keeps the agent IDLE between conversations, then OFFLINE after the grace period', async () => {
    const first = await agents.registerSession(device, { externalSessionId: 'conv-1', projectId, branch: 'feat/cart' });
    await agents.heartbeat(device, first.sessionId, { status: 'WORKING', currentTask: 'Cart total with discounts' });
    await agents.publishActivity(device, { sessionId: first.sessionId, kind: 'tool_used', summary: 'Edited src/cart.ts', tool: 'Edit' });
    await claims.claim(device, { projectId, resourceType: 'FILE', resourceKey: 'src/cart.ts', reason: 'Discount rules' });

    h.publisher.published.length = 0;
    await agents.endSession(device, first.sessionId);
    expect(h.publisher.types()).not.toContain('agent.disconnected');
    expect((await h.db.agent.findUniqueOrThrow({ where: { id: first.agentId } })).status).toBe('IDLE');

    // A new conversation right away: no "connected" event, the agent never looked offline.
    const second = await agents.registerSession(device, { externalSessionId: 'conv-2', projectId });
    expect(h.publisher.types()).not.toContain('agent.connected');

    const context = await directory.context(device, { projectId });
    expect(context.yourWork).toMatchObject({
      lastDeclaredTask: { task: 'Cart total with discounts' },
      previousSession: { branch: 'feat/cart', edited: ['Edited src/cart.ts'] },
      claimsHeld: [expect.objectContaining({ resourceKey: 'src/cart.ts' })],
    });

    await agents.endSession(device, second.sessionId);
    now = new Date(now.getTime() + 2 * 60_000);
    h.publisher.published.length = 0;
    expect(await agents.sweepIdleAgents({ teamId })).toBeGreaterThanOrEqual(1);
    expect((await h.db.agent.findUniqueOrThrow({ where: { id: first.agentId } })).status).toBe('OFFLINE');
    expect(h.publisher.types()).toContain('agent.disconnected');
  });
});
