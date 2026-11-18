import type { ConflictKind, Db, GitActivity, Prisma } from '@devsync/database';
import { AppError } from '@devsync/shared';
import {
  checkOverlapSchema,
  gitSnapshotSchema,
  mergeCheckSchema,
  normalizeRemoteUrl,
  updateConflictSchema,
  type CheckOverlapInput,
  type GitSnapshotInput,
  type MergeCheckInput,
} from '@devsync/validation';
import { z } from 'zod';
import { conflictFingerprint, detectOverlaps, formatRanges, SEVERITY, type LineRange, type Overlap, type WorktreeState } from '../domain/git-overlap';
import { hasTeamPermission } from '../domain/permissions';
import { projectAccess } from '../domain/project-access';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { agentActor } from './actor';
import { resolveDeviceProject } from './device-project.service';
import type { DeviceActor } from './devices.service';
import { withEvents, type DraftEvent } from './events.service';
import { notify } from './notifications.service';
import { clock, type ServiceDeps } from './ports';

type Emit = (draft: DraftEvent) => Promise<void>;
type Hunks = Record<string, LineRange[]>;

/** Snapshots older than this do not take part in overlap detection (the work is probably gone). */
export const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000;

const asHunks = (value: Prisma.JsonValue): Hunks => (value && typeof value === 'object' && !Array.isArray(value) ? (value as unknown as Hunks) : {});

/**
 * Git intelligence: Bridges report read-only snapshots of the worktrees agents use; the server compares
 * agents working on the same repository and warns both developers of overlaps before they merge. It never
 * pushes, merges or modifies anything in Git.
 */
export class GitService {
  constructor(private readonly deps: ServiceDeps) {}

  async reportSnapshot(device: DeviceActor, rawInput: GitSnapshotInput) {
    const input = gitSnapshotSchema.parse(rawInput);
    const db = this.deps.db;
    const now = clock(this.deps);
    const repository = await this.resolveRepository(device, input.remote);
    if (!repository) return { tracked: false as const, conflicts: [], mergeChecks: [] };
    const actor = await agentActor(db, device, input.agentName);
    if (actor.type !== 'AGENT') throw new AppError('INTERNAL', 'Agent expected');
    const session = input.externalSessionId
      ? await db.agentSession.findFirst({ where: { agentId: actor.agentId, externalSessionId: input.externalSessionId, endedAt: null }, select: { id: true } })
      : null;

    const previous = await db.gitActivity.findFirst({
      where: { repositoryId: repository.id, machineId: device.machineId, worktreePath: input.worktreePath },
      orderBy: { capturedAt: 'desc' },
      select: { id: true, fingerprint: true },
    });

    return withEvents(this.deps, async (tx, emit) => {
      let current: GitActivity;
      if (previous?.fingerprint === input.fingerprint) {
        // Same state: keep it alive for detection, no new row, no event.
        current = await tx.gitActivity.update({ where: { id: previous.id }, data: { capturedAt: now, agentId: actor.agentId, sessionId: session?.id ?? null } });
      } else {
        current = await tx.gitActivity.create({
          data: {
            teamId: device.teamId,
            repositoryId: repository.id,
            machineId: device.machineId,
            agentId: actor.agentId,
            sessionId: session?.id ?? null,
            worktreePath: input.worktreePath,
            isLinkedWorktree: input.isLinkedWorktree,
            branch: input.branch,
            head: input.head,
            lastCommitSha: input.lastCommitSha,
            lastCommitMessage: input.lastCommitMessage,
            modifiedFiles: input.modifiedFiles,
            stagedFiles: input.stagedFiles,
            untrackedFiles: input.untrackedFiles,
            unmergedFiles: input.unmergedFiles,
            changedHunks: input.changedHunks,
            baseRef: input.baseRef,
            mergeBase: input.mergeBase,
            aheadBy: input.aheadBy,
            behindBy: input.behindBy,
            fingerprint: input.fingerprint,
            capturedAt: now,
          },
        });
        await emit({
          type: 'git.activity.detected',
          teamId: device.teamId,
          projectId: repository.projectId,
          actor: { type: 'AGENT', userId: device.userId, agentId: actor.agentId },
          audience: await this.projectAudience(tx, device.teamId, repository.projectId),
          payload: { repositoryId: repository.id, agentId: actor.agentId, branch: input.branch, head: input.head, modifiedFiles: Object.keys(input.changedHunks).slice(0, 2000) },
        });
      }

      const mine: WorktreeState = { agentId: actor.agentId, userId: device.userId, branch: input.branch, changedHunks: input.changedHunks, unmergedFiles: input.unmergedFiles };
      const others = await this.latestOtherStates(tx, repository.id, actor.agentId, now);
      const seen = new Set<string>();
      const mergeChecks: { otherAgentId: string; otherBranch: string; files: string[] }[] = [];

      for (const other of others) {
        const overlaps = detectOverlaps(mine, other.state);
        for (const overlap of overlaps) {
          const fingerprint = conflictFingerprint(repository.id, overlap.filePath, actor.agentId, other.state.agentId);
          seen.add(fingerprint);
          await this.upsertConflict(tx, emit, { teamId: device.teamId, repositoryId: repository.id, projectId: repository.projectId, fingerprint, overlap, mine, other: other.state, now });
        }
        const lineFiles = overlaps.filter((o) => o.kind === 'LINE_OVERLAP').map((o) => o.filePath);
        if (lineFiles.length && other.state.branch !== input.branch) mergeChecks.push({ otherAgentId: other.state.agentId, otherBranch: other.state.branch, files: lineFiles });
      }

      // Overlaps that disappeared (file reverted, branch merged, work abandoned) close themselves.
      const open = await tx.gitConflict.findMany({
        where: { repositoryId: repository.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, OR: [{ agentAId: actor.agentId }, { agentBId: actor.agentId }] },
        select: { id: true, fingerprint: true },
      });
      const gone = open.filter((c) => !seen.has(c.fingerprint)).map((c) => c.id);
      if (gone.length) await tx.gitConflict.updateMany({ where: { id: { in: gone } }, data: { status: 'RESOLVED', resolvedAt: now } });

      return {
        tracked: true as const,
        repositoryId: repository.id,
        snapshotId: current.id,
        conflicts: await this.conflictsFor(tx, repository.id, actor.agentId),
        mergeChecks,
      };
    });
  }

  /** A Bridge ran `git merge-tree` against another agent's branch: overlaps that really conflict escalate. */
  async reportMergeCheck(device: DeviceActor, rawInput: MergeCheckInput) {
    const input = mergeCheckSchema.parse(rawInput);
    const actor = await agentActor(this.deps.db, device, input.agentName);
    if (actor.type !== 'AGENT') throw new AppError('INTERNAL', 'Agent expected');
    const repository = await this.deps.db.repository.findFirst({ where: { id: input.repositoryId, teamId: device.teamId, deletedAt: null } });
    if (!repository) throw new AppError('NOT_FOUND', 'Repository not found');
    const now = clock(this.deps);
    let escalated = 0;
    await withEvents(this.deps, async (tx, emit) => {
      for (const filePath of input.conflictingFiles) {
        const fingerprint = conflictFingerprint(repository.id, filePath, actor.agentId, input.otherAgentId);
        const existing = await tx.gitConflict.findUnique({ where: { teamId_fingerprint: { teamId: device.teamId, fingerprint } } });
        if (!existing || existing.status === 'RESOLVED' || existing.status === 'DISMISSED' || SEVERITY[existing.kind] >= SEVERITY.POTENTIAL_CONFLICT) continue;
        const updated = await tx.gitConflict.update({
          where: { id: existing.id },
          data: { kind: 'POTENTIAL_CONFLICT', lastDetectedAt: now, details: { ...(existing.details as object), mergeTree: { otherBranch: input.otherBranch, checkedAt: now.toISOString() } } },
          include: { agentA: { select: { userId: true } }, agentB: { select: { userId: true } } },
        });
        escalated += 1;
        await this.announce(tx, emit, updated, repository.projectId, `Merge conflict likely on ${filePath}`, `git merge-tree predicts a conflict with branch ${input.otherBranch}.`);
      }
    });
    return { escalated };
  }

  /** Before editing: who else is changing these files right now (and which lines)? */
  async checkOverlap(device: DeviceActor, rawInput: CheckOverlapInput) {
    const input = checkOverlapSchema.parse(rawInput);
    const repository = input.remote ? await this.resolveRepository(device, input.remote) : null;
    if (!repository) return { tracked: false, files: [] };
    const machineAgents = await this.deps.db.agent.findMany({ where: { machineId: device.machineId }, select: { id: true } });
    const others = await this.latestOtherStates(this.deps.db, repository.id, machineAgents.map((a) => a.id), clock(this.deps));
    const claims = await this.deps.db.resourceClaim.findMany({
      where: { projectId: repository.projectId, resourceType: 'FILE', resourceKey: { in: input.files }, releasedAt: null, expiresAt: { gt: clock(this.deps) }, agent: { machineId: { not: device.machineId } } },
      include: { agent: { select: { name: true, user: { select: { name: true } } } } },
    });
    return {
      tracked: true,
      files: input.files.map((file) => ({
        file,
        touchedBy: others
          .filter((o) => o.state.changedHunks[file])
          .map((o) => ({ owner: o.userName, agentId: o.state.agentId, branch: o.state.branch, lines: formatRanges(o.state.changedHunks[file]!), capturedAt: o.capturedAt })),
        claimedBy: claims.filter((c) => c.resourceKey === file).map((c) => ({ owner: c.agent.user.name, reason: c.reason, expiresAt: c.expiresAt })),
      })),
    };
  }

  /** Repositories the user can see, with the latest state of each agent worktree (24 h) and open conflicts. */
  async teamState(userId: string, teamId: string) {
    const visible = await this.visibleProjectIds(userId, teamId);
    const since = new Date(clock(this.deps).getTime() - 24 * 60 * 60 * 1000);
    const repositories = await this.deps.db.repository.findMany({
      where: { teamId, deletedAt: null, projectId: { in: visible } },
      include: {
        project: { select: { name: true } },
        gitActivities: {
          where: { capturedAt: { gt: since } },
          orderBy: { capturedAt: 'desc' },
          take: 200,
          include: { agent: { select: { id: true, name: true, status: true, user: { select: { name: true } } } }, machine: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    const conflicts = await this.listConflicts(userId, teamId, { status: 'open' });
    return repositories.map((repo) => {
      const latest = new Map<string, (typeof repo.gitActivities)[number]>();
      for (const a of repo.gitActivities) {
        const key = `${a.machineId}|${a.worktreePath}`;
        if (!latest.has(key)) latest.set(key, a);
      }
      return {
        id: repo.id,
        name: repo.name,
        remoteUrl: repo.remoteUrl,
        defaultBranch: repo.defaultBranch,
        project: repo.project.name,
        worktrees: [...latest.values()].map((a) => ({
          owner: a.agent?.user.name ?? '?',
          agentStatus: a.agent?.status ?? null,
          machine: a.machine.name,
          worktreePath: a.worktreePath,
          isLinkedWorktree: a.isLinkedWorktree,
          branch: a.branch,
          head: a.head.slice(0, 10),
          lastCommitMessage: a.lastCommitMessage,
          aheadBy: a.aheadBy,
          behindBy: a.behindBy,
          changedFiles: Object.keys(asHunks(a.changedHunks)).length,
          unmergedFiles: a.unmergedFiles.length,
          capturedAt: a.capturedAt,
        })),
        conflicts: conflicts.filter((c) => c.repositoryId === repo.id),
      };
    });
  }

  async listConflicts(userId: string, teamId: string, options: { status?: 'open' | 'all' } = {}) {
    const visible = await this.visibleProjectIds(userId, teamId);
    const rows = await this.deps.db.gitConflict.findMany({
      where: { teamId, repository: { projectId: { in: visible }, deletedAt: null }, ...(options.status === 'all' ? {} : { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }) },
      include: {
        repository: { select: { name: true } },
        agentA: { select: { id: true, name: true, user: { select: { id: true, name: true } } } },
        agentB: { select: { id: true, name: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ lastDetectedAt: 'desc' }],
      take: 200,
    });
    return rows
      .map((c) => ({
        id: c.id,
        repositoryId: c.repositoryId,
        repository: c.repository.name,
        kind: c.kind,
        status: c.status,
        filePath: c.filePath,
        a: { agentId: c.agentA.id, owner: c.agentA.user.name, userId: c.agentA.user.id, branch: c.branchA },
        b: { agentId: c.agentB.id, owner: c.agentB.user.name, userId: c.agentB.user.id, branch: c.branchB },
        details: c.details as { sharedLines?: string; linesA?: string; linesB?: string },
        firstDetectedAt: c.firstDetectedAt,
        lastDetectedAt: c.lastDetectedAt,
      }))
      .sort((x, y) => SEVERITY[y.kind] - SEVERITY[x.kind]);
  }

  /** Participants (or project maintainers) acknowledge, resolve or dismiss a conflict. */
  async updateConflict(userId: string, conflictId: string, rawInput: z.input<typeof updateConflictSchema>) {
    const { status } = updateConflictSchema.parse(rawInput);
    const c = await this.deps.db.gitConflict.findUnique({ where: { id: conflictId }, include: { repository: true, agentA: { select: { userId: true } }, agentB: { select: { userId: true } } } });
    if (!c) throw new AppError('NOT_FOUND', 'Conflict not found');
    const membership = await membersRepository.find(this.deps.db, c.teamId, userId);
    const member = await projectsRepository.findProjectMember(this.deps.db, c.repository.projectId, userId);
    const access = membership ? projectAccess(membership.role, member?.role ?? null) : 'none';
    if (access === 'none') throw new AppError('NOT_FOUND', 'Conflict not found');
    if (![c.agentA.userId, c.agentB.userId].includes(userId) && access !== 'manage') throw new AppError('FORBIDDEN', 'Only the developers involved can update this alert');
    const now = clock(this.deps);
    return this.deps.db.gitConflict.update({
      where: { id: conflictId },
      data: { status, ...(status === 'RESOLVED' || status === 'DISMISSED' ? { resolvedAt: now, resolvedByUserId: userId } : {}) },
      select: { id: true, status: true },
    });
  }

  // ── helpers ──

  private async resolveRepository(device: DeviceActor, remote: string) {
    const normalized = normalizeRemoteUrl(remote);
    if (!normalized) return null;
    const resolved = await resolveDeviceProject(this.deps, device, { remote });
    if (!resolved) return null;
    return this.deps.db.repository.findFirst({ where: { teamId: device.teamId, projectId: resolved.projectId, remoteUrl: normalized, deletedAt: null } });
  }

  /** Latest snapshot per (machine, worktree) of other agents on the repository, within the TTL. */
  private async latestOtherStates(db: Db, repositoryId: string, excludeAgentIds: string | string[], now: Date) {
    const exclude = Array.isArray(excludeAgentIds) ? excludeAgentIds : [excludeAgentIds];
    const rows = await db.gitActivity.findMany({
      where: { repositoryId, capturedAt: { gt: new Date(now.getTime() - SNAPSHOT_TTL_MS) }, agentId: { not: null, notIn: exclude } },
      orderBy: { capturedAt: 'desc' },
      take: 500,
      include: { agent: { select: { userId: true, user: { select: { name: true } } } } },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.machineId}|${r.worktreePath}`;
      if (!latest.has(key)) latest.set(key, r);
    }
    return [...latest.values()].map((r) => ({
      userName: r.agent!.user.name,
      capturedAt: r.capturedAt,
      state: { agentId: r.agentId!, userId: r.agent!.userId, branch: r.branch, changedHunks: asHunks(r.changedHunks), unmergedFiles: r.unmergedFiles } satisfies WorktreeState,
    }));
  }

  private async upsertConflict(
    tx: Db,
    emit: Emit,
    p: { teamId: string; repositoryId: string; projectId: string; fingerprint: string; overlap: Overlap; mine: WorktreeState; other: WorktreeState; now: Date },
  ) {
    const [a, b] = p.mine.agentId < p.other.agentId ? [p.mine, p.other] : [p.other, p.mine];
    const details = {
      sharedLines: formatRanges(p.overlap.shared),
      linesA: formatRanges(a === p.mine ? p.overlap.mine : p.overlap.theirs),
      linesB: formatRanges(b === p.mine ? p.overlap.mine : p.overlap.theirs),
    };
    const existing = await tx.gitConflict.findUnique({ where: { teamId_fingerprint: { teamId: p.teamId, fingerprint: p.fingerprint } } });
    // A merge-tree verdict is kept while the lines still overlap.
    const kind: ConflictKind = existing?.kind === 'POTENTIAL_CONFLICT' && p.overlap.kind === 'LINE_OVERLAP' && existing.status !== 'RESOLVED' ? 'POTENTIAL_CONFLICT' : p.overlap.kind;
    const reopened = !existing || existing.status === 'RESOLVED';
    const escalated = !!existing && SEVERITY[kind] > SEVERITY[existing.kind];
    const dismissed = existing?.status === 'DISMISSED' && !escalated;
    const conflict = await tx.gitConflict.upsert({
      where: { teamId_fingerprint: { teamId: p.teamId, fingerprint: p.fingerprint } },
      create: { teamId: p.teamId, repositoryId: p.repositoryId, kind, filePath: p.overlap.filePath, agentAId: a.agentId, agentBId: b.agentId, branchA: a.branch, branchB: b.branch, details, fingerprint: p.fingerprint, firstDetectedAt: p.now, lastDetectedAt: p.now },
      update: {
        kind,
        branchA: a.branch,
        branchB: b.branch,
        details: { ...((existing?.details as object) ?? {}), ...details },
        lastDetectedAt: p.now,
        // A dismissed alert stays dismissed unless the situation gets worse.
        ...(reopened || (existing?.status === 'DISMISSED' && escalated) ? { status: 'OPEN', resolvedAt: null, resolvedByUserId: null } : {}),
      },
      include: { agentA: { select: { userId: true } }, agentB: { select: { userId: true } } },
    });
    if ((reopened || escalated) && !dismissed) {
      const what = { FILE_OVERLAP: 'Same file', LINE_OVERLAP: 'Same lines', POTENTIAL_CONFLICT: 'Merge conflict likely', CONFIRMED_CONFLICT: 'Merge conflict' }[kind];
      await this.announce(tx, emit, conflict, p.projectId, `${what}: ${p.overlap.filePath}`, `Branches ${a.branch} and ${b.branch}${details.sharedLines ? `, base lines ${details.sharedLines}` : ''}. Coordinate before merging.`);
    }
  }

  /** Event to both developers + persistent notification (deduplicated per conflict and severity). */
  private async announce(tx: Db, emit: Emit, c: { id: string; teamId: string; repositoryId: string; kind: ConflictKind; filePath: string; agentAId: string; agentBId: string; fingerprint: string; agentA: { userId: string }; agentB: { userId: string } }, projectId: string, title: string, body: string) {
    const users = [...new Set([c.agentA.userId, c.agentB.userId])];
    await emit({
      type: 'git.conflict.detected',
      teamId: c.teamId,
      projectId,
      actor: { type: 'SYSTEM' },
      audience: users,
      payload: { conflictId: c.id, repositoryId: c.repositoryId, kind: c.kind, filePath: c.filePath, agentIds: [c.agentAId, c.agentBId] },
    });
    for (const userId of users) {
      await notify(tx, emit, { teamId: c.teamId, userId, kind: 'GIT_CONFLICT', title, body, link: '/git', dedupeKey: `git:${c.fingerprint}:${c.kind}:${c.id}`, data: { conflictId: c.id } });
    }
  }

  private async conflictsFor(db: Db, repositoryId: string, agentId: string) {
    const rows = await db.gitConflict.findMany({
      where: { repositoryId, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, OR: [{ agentAId: agentId }, { agentBId: agentId }] },
      include: { agentA: { select: { id: true, user: { select: { name: true } } } }, agentB: { select: { id: true, user: { select: { name: true } } } } },
    });
    return rows
      .map((c) => {
        const other = c.agentAId === agentId ? { agent: c.agentB, branch: c.branchB } : { agent: c.agentA, branch: c.branchA };
        const d = c.details as { sharedLines?: string };
        return { id: c.id, kind: c.kind, status: c.status, filePath: c.filePath, otherOwner: other.agent.user.name, otherAgentId: other.agent.id, otherBranch: other.branch, sharedLines: d.sharedLines ?? '' };
      })
      .sort((x, y) => SEVERITY[y.kind] - SEVERITY[x.kind]);
  }

  private async projectAudience(db: Db, teamId: string, projectId: string): Promise<string[]> {
    const members = await db.teamMember.findMany({
      where: { teamId, OR: [{ role: { in: ['OWNER', 'ADMIN'] } }, { user: { projectMemberships: { some: { projectId } } } }] },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  private async visibleProjectIds(userId: string, teamId: string): Promise<string[]> {
    const membership = await membersRepository.find(this.deps.db, teamId, userId);
    if (!membership) throw new AppError('NOT_FOUND', 'Team not found');
    const projects = await projectsRepository.list(this.deps.db, teamId, hasTeamPermission(membership.role, 'project:read_all') ? {} : { memberUserId: userId });
    return projects.map((p) => p.id);
  }
}
