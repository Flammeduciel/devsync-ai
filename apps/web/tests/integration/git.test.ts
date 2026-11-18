import { createHash } from 'node:crypto';
import type { GitSnapshotInput } from '@devsync/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../../server/services/agents.service';
import { MemoryDeviceFlowStore } from '../../server/services/device-flow-store';
import { DevicesService, type DeviceActor } from '../../server/services/devices.service';
import { GitService } from '../../server/services/git.service';
import { NotificationsService } from '../../server/services/notifications.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

function snapshot(branch: string, changedHunks: Record<string, [number, number][]>, extra: Partial<GitSnapshotInput> = {}): GitSnapshotInput {
  const base = {
    remote: 'git@github.com:acme/checkout.git',
    worktreePath: `/work/${branch}`,
    isLinkedWorktree: false,
    branch,
    head: 'a'.repeat(40),
    lastCommitSha: 'a'.repeat(40),
    lastCommitMessage: 'wip',
    baseRef: 'origin/main',
    mergeBase: 'b'.repeat(40),
    aheadBy: 1,
    behindBy: 0,
    modifiedFiles: Object.keys(changedHunks),
    stagedFiles: [],
    untrackedFiles: [],
    unmergedFiles: [],
    changedHunks,
    ...extra,
  };
  return { ...base, fingerprint: createHash('sha256').update(JSON.stringify(base)).digest('hex') };
}

describe.skipIf(!testDatabaseUrl)('git intelligence', () => {
  const h = createHarness();
  const deps = h.deps;
  const devices = new DevicesService(deps, new MemoryDeviceFlowStore());
  const agents = new AgentsService(deps);
  const git = new GitService(deps);
  const notifications = new NotificationsService(deps);
  let teamId: string;
  let alice: DeviceActor;
  let bob: DeviceActor;
  let aliceUser: string;
  let bobUser: string;

  async function pair(userId: string) {
    const { deviceCode, userCode } = await devices.authorize({ machineName: `m-${userId.slice(-5)}`, bridgeVersion: '0.1.0' });
    await devices.approve(userId, { userCode, teamId });
    const r = await devices.exchange(deviceCode);
    const device = (await devices.authenticate((r as { deviceToken: string }).deviceToken))!;
    await agents.registerSession(device, { externalSessionId: `s-${userId}`, repositoryRemote: 'github.com/acme/checkout' });
    return device;
  }

  beforeAll(async () => {
    const a = await h.user('Gail');
    const b = await h.user('Gus');
    aliceUser = a.id;
    bobUser = b.id;
    teamId = (await new TeamsService(deps).create(a.id, { name: 'Git', slug: `git-${h.run}` })).id;
    await h.db.teamMember.create({ data: { teamId, userId: b.id, role: 'DEVELOPER' } });
    const projects = new ProjectsService(deps);
    const projectId = (await projects.create(a.id, teamId, { name: 'Checkout' })).id;
    await projects.addRepository(a.id, projectId, { remoteUrl: 'github.com/acme/checkout' });
    await projects.addMember(a.id, projectId, { userId: b.id, role: 'CONTRIBUTOR' });
    alice = await pair(a.id);
    bob = await pair(b.id);
  });
  afterAll(() => h.cleanup());

  it('ignores repositories that are not linked to a project', async () => {
    await expect(git.reportSnapshot(alice, { ...snapshot('x', {}), remote: 'github.com/other/repo' })).resolves.toMatchObject({ tracked: false });
  });

  it('detects line and file overlaps, notifies both developers once, and asks for a merge-tree check', async () => {
    await git.reportSnapshot(alice, snapshot('feat/a', { 'src/payment.ts': [[40, 60]], 'src/cart.ts': [[1, 5]] }));
    h.publisher.published.length = 0;
    const r = await git.reportSnapshot(bob, snapshot('feat/b', { 'src/payment.ts': [[55, 70]], 'src/cart.ts': [[30, 31]], 'README.md': [[1, 1]] }));
    expect(r.conflicts.map((c) => [c.filePath, c.kind, c.otherOwner, c.sharedLines])).toEqual([
      ['src/payment.ts', 'LINE_OVERLAP', 'Gail', '55-60'],
      ['src/cart.ts', 'FILE_OVERLAP', 'Gail', ''],
    ]);
    expect(r.mergeChecks).toEqual([{ otherAgentId: expect.any(String), otherBranch: 'feat/a', files: ['src/payment.ts'] }]);
    const detected = h.publisher.published.filter((e) => e.type === 'git.conflict.detected');
    expect(detected).toHaveLength(2);
    expect(detected[0]!.audience?.sort()).toEqual([aliceUser, bobUser].sort());
    const aliceInbox = (await notifications.list(aliceUser, teamId)).items.filter((n) => n.kind === 'GIT_CONFLICT');
    expect(aliceInbox.map((n) => n.title).sort()).toEqual(['Same file: src/cart.ts', 'Same lines: src/payment.ts']);

    // Same state again: kept alive, no new row, no new notification.
    const rows = await h.db.gitActivity.count({ where: { teamId } });
    h.publisher.published.length = 0;
    await git.reportSnapshot(bob, snapshot('feat/b', { 'src/payment.ts': [[55, 70]], 'src/cart.ts': [[30, 31]], 'README.md': [[1, 1]] }));
    expect(await h.db.gitActivity.count({ where: { teamId } })).toBe(rows);
    expect(h.publisher.types()).not.toContain('notification.created');
  });

  it('escalates to a likely merge conflict on merge-tree evidence', async () => {
    const aliceAgent = (await h.db.agent.findFirstOrThrow({ where: { machineId: alice.machineId } })).id;
    const repo = await h.db.repository.findFirstOrThrow({ where: { teamId } });
    await expect(git.reportMergeCheck(bob, { repositoryId: repo.id, otherAgentId: aliceAgent, otherBranch: 'feat/a', conflictingFiles: ['src/payment.ts'] })).resolves.toEqual({ escalated: 1 });
    const conflicts = await git.listConflicts(bobUser, teamId);
    expect(conflicts[0]).toMatchObject({ filePath: 'src/payment.ts', kind: 'POTENTIAL_CONFLICT' });
    expect((await notifications.list(bobUser, teamId)).items[0]?.title).toBe('Merge conflict likely on src/payment.ts');
    // Still overlapping lines: the merge-tree verdict is kept.
    await git.reportSnapshot(bob, snapshot('feat/b', { 'src/payment.ts': [[56, 70]], 'src/cart.ts': [[30, 31]] }));
    expect((await git.listConflicts(bobUser, teamId))[0]?.kind).toBe('POTENTIAL_CONFLICT');
  });

  it('answers "who else touches these files" before editing', async () => {
    const r = await git.checkOverlap(alice, { remote: 'github.com/acme/checkout', files: ['src/payment.ts', 'docs/x.md'] });
    expect(r.files[0]!.touchedBy).toEqual([expect.objectContaining({ owner: 'Gus', branch: 'feat/b', lines: '56-70' })]);
    expect(r.files[1]!.touchedBy).toEqual([]);
  });

  it('confirms conflicts during a merge and closes alerts when the overlap disappears', async () => {
    const r = await git.reportSnapshot(alice, snapshot('feat/a', { 'src/payment.ts': [[40, 60]], 'src/cart.ts': [[1, 5]] }, { unmergedFiles: ['src/cart.ts'], worktreePath: '/work/feat/a' }));
    expect(r.conflicts.find((c) => c.filePath === 'src/cart.ts')?.kind).toBe('CONFIRMED_CONFLICT');

    await git.reportSnapshot(bob, snapshot('feat/b', { 'README.md': [[1, 1]] }));
    expect(await git.listConflicts(bobUser, teamId)).toEqual([]);
    expect((await git.listConflicts(bobUser, teamId, { status: 'all' })).every((c) => c.status === 'RESOLVED')).toBe(true);
  });

  it('lets participants dismiss alerts and hides them from other teams', async () => {
    await git.reportSnapshot(bob, snapshot('feat/b', { 'src/payment.ts': [[50, 52]] }));
    const [c] = await git.listConflicts(aliceUser, teamId);
    await expect(git.updateConflict(aliceUser, c!.id, { status: 'DISMISSED' })).resolves.toMatchObject({ status: 'DISMISSED' });
    const outsider = await h.user('Oz');
    await new TeamsService(deps).create(outsider.id, { name: 'Elsewhere', slug: `else-${h.run}` });
    await expect(git.listConflicts(outsider.id, teamId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(git.updateConflict(outsider.id, c!.id, { status: 'RESOLVED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const state = await git.teamState(aliceUser, teamId);
    expect(state[0]!.worktrees.map((w) => w.branch).sort()).toEqual(['feat/a', 'feat/b']);
  });
});
