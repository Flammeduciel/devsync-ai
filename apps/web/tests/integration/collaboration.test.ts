import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentActor, type Actor } from '../../server/services/actor';
import { AgentsService } from '../../server/services/agents.service';
import { AutonomyService } from '../../server/services/autonomy.service';
import { DeliverablesService } from '../../server/services/deliverables.service';
import { MemoryDeviceFlowStore } from '../../server/services/device-flow-store';
import { DevicesService, type DeviceActor } from '../../server/services/devices.service';
import { NotificationsService } from '../../server/services/notifications.service';
import { MemoryObjectStorage } from '../../server/services/object-storage';
import { ProjectsService } from '../../server/services/projects.service';
import { RequestsService } from '../../server/services/requests.service';
import { TasksService } from '../../server/services/tasks.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('collaboration between agents', () => {
  const h = createHarness();
  const deps = h.deps;
  const storage = new MemoryObjectStorage();
  const devices = new DevicesService(deps, new MemoryDeviceFlowStore());
  const agents = new AgentsService(deps);
  const requests = new RequestsService(deps);
  const deliverables = new DeliverablesService(deps, storage);
  const notifications = new NotificationsService(deps);
  const tasks = new TasksService(deps);
  const autonomy = new AutonomyService(deps);

  let teamId: string;
  let projectId: string;
  let alice: { id: string };
  let bob: { id: string };
  let aliceDevice: DeviceActor;
  let bobDevice: DeviceActor;
  let aliceAgent: Actor & { type: 'AGENT' };
  let bobAgent: Actor & { type: 'AGENT' };

  async function pair(userId: string, name: string) {
    const { deviceCode, userCode } = await devices.authorize({ machineName: name, bridgeVersion: '0.1.0' });
    await devices.approve(userId, { userCode, teamId });
    const r = await devices.exchange(deviceCode);
    return (await devices.authenticate((r as { deviceToken: string }).deviceToken))!;
  }

  const contract = { type: 'WORK' as const, title: 'Payment API contract', description: 'The checkout form needs POST /payments.', expectedDeliverables: [{ title: 'OpenAPI spec', format: 'OPENAPI' as const }] };

  beforeAll(async () => {
    alice = await h.user('Alicia');
    bob = await h.user('Bruno');
    teamId = (await new TeamsService(deps).create(alice.id, { name: 'Collab', slug: `collab-${h.run}` })).id;
    await h.db.teamMember.create({ data: { teamId, userId: bob.id, role: 'DEVELOPER' } });
    const projects = new ProjectsService(deps);
    projectId = (await projects.create(alice.id, teamId, { name: 'Checkout' })).id;
    await projects.addRepository(alice.id, projectId, { remoteUrl: 'github.com/acme/checkout' });
    await projects.addMember(alice.id, projectId, { userId: bob.id, role: 'CONTRIBUTOR' });
    aliceDevice = await pair(alice.id, 'alice-laptop');
    bobDevice = await pair(bob.id, 'bob-laptop');
    await agents.registerSession(aliceDevice, { externalSessionId: 'a', projectId, specialties: ['backend'] });
    await agents.registerSession(bobDevice, { externalSessionId: 'b', projectId, specialties: ['frontend'] });
    aliceAgent = (await agentActor(h.db, aliceDevice, 'claude-code')) as typeof aliceAgent;
    bobAgent = (await agentActor(h.db, bobDevice, 'claude-code')) as typeof bobAgent;
  });
  afterAll(() => h.cleanup());

  it('runs the frontend → backend contract scenario end to end', async () => {
    h.publisher.published.length = 0;
    const created = await requests.create(bobAgent, { ...contract, remote: 'git@github.com:acme/checkout.git', assigneeAgentId: aliceAgent.agentId }, bobDevice);
    expect(created).toMatchObject({ status: 'PENDING', origin: 'AGENT', awaitingApproval: false, assigneeUser: { name: 'Alicia' } });

    const ping = h.publisher.published.find((e) => e.type === 'notification.created');
    expect(ping?.audience).toEqual([alice.id]);
    expect(ping?.payload).toMatchObject({ kind: 'REQUEST_CREATED', playSound: true, desktop: true });
    expect(h.publisher.published.find((e) => e.type === 'collaboration.request.created')?.audience?.sort()).toEqual([alice.id, bob.id].sort());

    await expect(requests.create(bobAgent, { ...contract, projectId, assigneeAgentId: aliceAgent.agentId, title: 'payment api CONTRACT' }, bobDevice)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { requestId: created.id },
    });

    expect((await requests.act(aliceAgent, created.id, { action: 'accept' })).status).toBe('ACCEPTED');
    expect((await requests.act(aliceAgent, created.id, { action: 'clarify', comment: 'Which currencies?' })).status).toBe('WAITING_FOR_CLARIFICATION');
    expect((await requests.act(bobAgent, created.id, { action: 'answer', comment: 'EUR and XAF' })).status).toBe('ACCEPTED');
    expect((await requests.act(aliceAgent, created.id, { action: 'start' })).status).toBe('IN_PROGRESS');
    await expect(requests.act(bobAgent, created.id, { action: 'complete' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const d = await deliverables.create(aliceAgent, { requestId: created.id, title: 'Payments OpenAPI', format: 'OPENAPI' });
    await deliverables.addVersion(aliceAgent, d.id, { kind: 'inline', content: 'openapi: 3.1.0\npaths:\n  /payments: {}\n' });
    h.publisher.published.length = 0;
    await deliverables.publish(aliceAgent, d.id);

    const detail = await requests.get(bobAgent, created.id);
    expect(detail.status).toBe('DELIVERED');
    expect(detail.tasks).toEqual([expect.objectContaining({ status: 'DONE' })]);
    expect(detail.history.map((x) => x.action)).toEqual(['created', 'accept', 'clarify', 'answer', 'start', 'deliverable_published']);
    expect(detail.comments.map((c) => c.body)).toEqual(['Which currencies?', 'EUR and XAF']);
    expect(h.publisher.types()).toContain('collaboration.deliverable.ready');
    const ready = h.publisher.published.find((e) => e.type === 'notification.created');
    expect(ready?.payload).toMatchObject({ kind: 'DELIVERABLE_READY', userId: bob.id, playSound: true });

    const read = await deliverables.read(bobAgent, d.id, { inline: true });
    expect(read.content).toContain('/payments');
    expect(read.downloadUrl).toContain('memory://download/');

    const inbox = await notifications.list(bob.id, teamId, { unreadOnly: true });
    expect(inbox.items.map((n) => n.kind)).toEqual(expect.arrayContaining(['REQUEST_ACCEPTED', 'REQUEST_CLARIFICATION', 'DELIVERABLE_READY']));
    await notifications.markRead(bob.id, teamId, 'all');
    expect((await notifications.list(bob.id, teamId)).unread).toBe(0);
  });

  it('holds suggested requests until a developer approves them (level 1)', async () => {
    await autonomy.upsert(alice.id, teamId, { level: 'SUGGEST', maxRequestsPerHour: 20, maxPriority: 'HIGH', maxChainDepth: 3 });
    const r = await requests.create(bobAgent, { ...contract, title: 'Refund endpoint', projectId, assigneeAgentId: aliceAgent.agentId }, bobDevice);
    expect(r.awaitingApproval).toBe(true);
    await expect(requests.act(aliceAgent, r.id, { action: 'accept' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await requests.list(alice.id, teamId, { scope: 'assigned' })).some((x) => x.id === r.id)).toBe(false);
    await requests.act({ type: 'HUMAN', userId: bob.id }, r.id, { action: 'approve' });
    expect((await requests.act(aliceAgent, r.id, { action: 'accept' })).status).toBe('ACCEPTED');
    await autonomy.upsert(alice.id, teamId, { level: 'CONTROLLED', maxRequestsPerHour: 20, maxPriority: 'HIGH', maxChainDepth: 3 });
  });

  it('enforces chains, loops and rate limits', async () => {
    const parent = await requests.create(bobAgent, { ...contract, title: 'Webhook signature', projectId, assigneeAgentId: aliceAgent.agentId }, bobDevice);
    await expect(requests.create(aliceAgent, { ...contract, title: 'Sub-task', projectId, assigneeAgentId: bobAgent.agentId, parentRequestId: parent.id }, aliceDevice)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await autonomy.upsert(alice.id, teamId, { level: 'COORDINATED', maxRequestsPerHour: 20, maxPriority: 'HIGH', maxChainDepth: 3 });
    await expect(requests.create(aliceAgent, { ...contract, title: 'Back to you', projectId, assigneeAgentId: bobAgent.agentId, parentRequestId: parent.id }, aliceDevice)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('loop'),
    });
    await autonomy.upsert(alice.id, teamId, { level: 'CONTROLLED', maxRequestsPerHour: 1, maxPriority: 'HIGH', maxChainDepth: 3 });
    await expect(requests.create(bobAgent, { ...contract, title: 'One too many', projectId, assigneeAgentId: aliceAgent.agentId }, bobDevice)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await autonomy.upsert(alice.id, teamId, { level: 'CONTROLLED', maxRequestsPerHour: 20, maxPriority: 'HIGH', maxChainDepth: 3 });
  });

  it('unblocks dependent tasks when the work is done', async () => {
    const myTask = await tasks.create(bobDevice, bobAgent, { projectId, title: 'Checkout form submit' });
    const r = await requests.create(bobAgent, { ...contract, type: 'DEPENDENCY', title: 'Payment status enum', projectId, assigneeAgentId: aliceAgent.agentId, dependentTaskId: myTask.id }, bobDevice);
    await requests.act(aliceAgent, r.id, { action: 'start' });
    const graph = await tasks.dependencies(bobAgent, teamId, { taskId: myTask.id });
    expect(graph.blockedBy).toEqual([expect.objectContaining({ status: 'OPEN' })]);
    await requests.act(aliceAgent, r.id, { action: 'complete' });
    expect((await tasks.dependencies(bobAgent, teamId, { taskId: myTask.id })).blockedBy[0]?.status).toBe('RESOLVED');
    expect((await notifications.list(bob.id, teamId)).items.some((n) => n.kind === 'DEPENDENCY_RESOLVED')).toBe(true);
  });

  it('checks uploaded files before publishing and refuses unsafe types', async () => {
    const r = await requests.create(bobAgent, { ...contract, title: 'Architecture diagram', projectId, assigneeAgentId: aliceAgent.agentId }, bobDevice);
    await requests.act(aliceAgent, r.id, { action: 'start' });
    const d = await deliverables.create(aliceAgent, { requestId: r.id, title: 'Diagram', format: 'IMAGE' });
    await expect(deliverables.addVersion(aliceAgent, d.id, { kind: 'upload', fileName: 'x.svg', contentType: 'image/svg+xml', sizeBytes: 10 })).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    const v = await deliverables.addVersion(aliceAgent, d.id, { kind: 'upload', fileName: 'diagram.png', contentType: 'image/png', sizeBytes: 4 });
    expect(v.uploadUrl).toContain('memory://upload/');
    await expect(deliverables.publish(aliceAgent, d.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await storage.put(`teams/${teamId}/deliverables/${d.id}/v1/diagram.png`, new Uint8Array([1, 2, 3, 4]), 'image/png');
    await expect(deliverables.publish(aliceAgent, d.id)).resolves.toMatchObject({ status: 'PUBLISHED' });
  });

  it('hides requests from other teams', async () => {
    const outsider = await h.user('Oscar');
    await new TeamsService(deps).create(outsider.id, { name: 'Other', slug: `other-${h.run}` });
    const r = (await requests.list(alice.id, teamId, {}))[0]!;
    await expect(requests.get({ type: 'HUMAN', userId: outsider.id }, r.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(requests.list(outsider.id, teamId, {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
