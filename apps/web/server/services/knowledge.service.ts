import { Prisma, type Db, type KnowledgeKind, type KnowledgeValidity } from '@devsync/database';
import { AppError } from '@devsync/shared';
import {
  listKnowledgeSchema,
  promoteDeliverableSchema,
  publishKnowledgeSchema,
  searchKnowledgeSchema,
  setValiditySchema,
  setVisibilitySchema,
  type KnowledgeVisibility,
  type ListKnowledgeInput,
  type PromoteDeliverableInput,
  type PublishKnowledgeInput,
  type SearchKnowledgeInput,
  type SetValidityInput,
} from '@devsync/validation';
import { hasTeamPermission } from '../domain/permissions';
import { hasProjectAccess, projectAccess, type ProjectAccess } from '../domain/project-access';
import { recordAudit } from '../repositories/audit.repository';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { actorAgentId, actorRef, type Actor } from './actor';
import type { DeliverablesService } from './deliverables.service';
import { resolveDeviceProject } from './device-project.service';
import { passageText, toVectorLiteral, type EmbeddingProvider } from './embeddings';
import { withEvents, type DraftEvent } from './events.service';
import { noEmbeddings, noJobs } from './jobs';
import { notify } from './notifications.service';
import { clock, type ServiceDeps } from './ports';

type Emit = (draft: DraftEvent) => Promise<void>;

/** e5 cosine similarities are compressed (~0.7 unrelated, ~0.8+ related): rescale and threshold. */
const SEMANTIC_FLOOR = 0.75;
const SEMANTIC_ONLY_MIN = 0.8;
const semanticScore = (cos: number) => Math.max(0, Math.min(1, (cos - SEMANTIC_FLOOR) / 0.15));

interface Candidate {
  id: string;
  fts: number;
  trgm: number;
  cosine: number | null;
  snippet: string | null;
}

/**
 * Shared team knowledge: explicitly published decisions, contracts, solutions and summaries — never raw
 * conversations. Versioned; readers are tracked so they hear when what they relied on changes.
 */
export class KnowledgeService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly deliverables?: DeliverablesService,
  ) {}

  async publish(actor: Actor, rawInput: PublishKnowledgeInput, device?: { teamId: string; machineId: string; userId: string }) {
    const input = publishKnowledgeSchema.parse(rawInput);
    const db = this.deps.db;
    const now = clock(this.deps);

    let projectId: string;
    let existing: Awaited<ReturnType<typeof db.knowledge.findFirst>> = null;
    if (input.knowledgeId) {
      existing = await db.knowledge.findFirst({ where: { id: input.knowledgeId, deletedAt: null } });
      if (!existing || !(await this.canSee(actor.userId, existing))) throw new AppError('NOT_FOUND', 'Knowledge not found');
      if (existing.visibility !== input.visibility && existing.authorUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the author can change who sees this');
      projectId = existing.projectId;
    } else if (device) {
      const resolved = await resolveDeviceProject(this.deps, device, input);
      if (!resolved) throw new AppError('NOT_FOUND', 'No project matches this repository; pass projectId');
      projectId = resolved.projectId;
    } else {
      if (!input.projectId) throw new AppError('VALIDATION_FAILED', 'projectId is required');
      projectId = input.projectId;
    }
    if (!hasProjectAccess(await this.accessOf(actor.userId, projectId), 'write')) throw new AppError('NOT_FOUND', 'Project not found');
    const project = await projectsRepository.findActiveById(db, projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const version = (existing?.currentVersion ?? 0) + 1;
    const searchText = [input.summary ?? '', input.tags.join(' '), input.content].filter(Boolean).join('\n').slice(0, 200_000);

    const result = await withEvents(this.deps, async (tx, emit) => {
      const knowledge = existing
        ? await tx.knowledge.update({
            where: { id: existing.id },
            data: { title: input.title, kind: input.kind, validity: input.validity, visibility: input.visibility, currentVersion: version, searchText, publishedAt: now, embeddedAt: null, embeddingModel: null },
          })
        : await tx.knowledge.create({
            data: { teamId: project.teamId, projectId, kind: input.kind, title: input.title, validity: input.validity, visibility: input.visibility, currentVersion: 1, authorUserId: actor.userId, sourceAgentId: actorAgentId(actor), searchText, publishedAt: now },
          });
      if (existing) await tx.$executeRaw`UPDATE "knowledge" SET "embedding" = NULL WHERE "id" = ${knowledge.id}::uuid`;
      const versionRow = await tx.knowledgeVersion.create({
        data: {
          teamId: project.teamId,
          knowledgeId: knowledge.id,
          version,
          title: input.title,
          content: input.content,
          summary: input.summary ?? null,
          references: input.references,
          createdByUserId: actor.userId,
          createdByAgentId: actorAgentId(actor),
        },
      });
      await tx.knowledgeTag.deleteMany({ where: { knowledgeId: knowledge.id } });
      if (input.tags.length) await tx.knowledgeTag.createMany({ data: input.tags.map((tag) => ({ teamId: project.teamId, knowledgeId: knowledge.id, tag })) });
      await this.emitPublished(tx, emit, knowledge, versionRow.id, input.tags, actor);
      if (existing && knowledge.visibility === 'PROJECT') {
        await this.notifyReaders(tx, emit, knowledge, actor, `Updated: ${knowledge.title} (v${version - 1} → v${version})`, `knowledge-v${version}:${knowledge.id}`, 'A new version of something you relied on was published. Check what changed before continuing.');
      }
      return { knowledgeId: knowledge.id, version, projectId, visibility: knowledge.visibility };
    });
    await (this.deps.jobs ?? noJobs).enqueue('embed-knowledge', { knowledgeId: result.knowledgeId }, { jobId: `embed:${result.knowledgeId}:v${version}` });
    return result;
  }

  /** Full item. `trackUsage` records that this user (and agent) now relies on this version. */
  async get(actor: Actor, knowledgeId: string, options: { version?: number; trackUsage?: boolean } = {}) {
    const k = await this.deps.db.knowledge.findFirst({
      where: { id: knowledgeId, deletedAt: null },
      include: { project: { select: { id: true, name: true } }, author: { select: { name: true } }, sourceAgent: { select: { name: true } }, tags: true },
    });
    if (!k || !(await this.canSee(actor.userId, k))) throw new AppError('NOT_FOUND', 'Knowledge not found');
    const version = options.version ?? k.currentVersion;
    const v = await this.deps.db.knowledgeVersion.findUnique({
      where: { knowledgeId_version: { knowledgeId, version } },
      include: { createdBy: { select: { name: true } }, createdByAgent: { select: { name: true } } },
    });
    if (!v) throw new AppError('NOT_FOUND', 'Version not found');
    if (options.trackUsage) {
      await this.deps.db.knowledgeUsage.upsert({
        where: { knowledgeId_userId: { knowledgeId, userId: actor.userId } },
        create: { teamId: k.teamId, knowledgeId, userId: actor.userId, agentId: actorAgentId(actor), version },
        update: { version, agentId: actorAgentId(actor), lastUsedAt: clock(this.deps) },
      });
    }
    const versions = await this.deps.db.knowledgeVersion.findMany({ where: { knowledgeId }, select: { version: true, createdAt: true, createdBy: { select: { name: true } } }, orderBy: { version: 'desc' } });
    return {
      id: k.id,
      title: v.title,
      kind: k.kind,
      validity: k.validity,
      visibility: k.visibility,
      project: k.project,
      tags: k.tags.map((t) => t.tag),
      version: v.version,
      currentVersion: k.currentVersion,
      content: v.content,
      summary: v.summary,
      references: v.references,
      author: k.sourceAgent ? `${k.author.name} (agent ${k.sourceAgent.name})` : k.author.name,
      versionBy: v.createdByAgent ? `${v.createdBy.name} (agent ${v.createdByAgent.name})` : v.createdBy.name,
      publishedAt: k.publishedAt,
      versions: versions.map((x) => ({ version: x.version, at: x.createdAt, by: x.createdBy.name })),
    };
  }

  /** Hybrid search: full-text + fuzzy title + semantic (when the embedder is available). */
  async search(actor: Actor, teamId: string, rawInput: SearchKnowledgeInput, device?: { teamId: string; machineId: string; userId: string }) {
    const input = searchKnowledgeSchema.parse(rawInput);
    let visible = await this.visibleProjectIds(actor.userId, teamId);
    if (input.projectId || input.remote) {
      const scoped = device ? await resolveDeviceProject(this.deps, device, input) : input.projectId ? { projectId: input.projectId } : null;
      if (scoped) visible = visible.filter((id) => id === scoped.projectId);
    }
    if (visible.length === 0) return { items: [], semantic: false };

    const filters = Prisma.sql`
      k."teamId" = ${teamId}::uuid AND k."deletedAt" IS NULL AND k."projectId" = ANY(${visible}::uuid[])
      AND (k."visibility" = 'PROJECT' OR k."authorUserId" = ${actor.userId}::uuid)
      ${input.includeOutdated ? Prisma.empty : Prisma.sql`AND k."validity" IN ('VALID', 'DRAFT')`}
      ${input.kind ? Prisma.sql`AND k."kind" = ${input.kind}::"KnowledgeKind"` : Prisma.empty}
      ${input.tags?.length ? Prisma.sql`AND EXISTS (SELECT 1 FROM "knowledge_tags" t WHERE t."knowledgeId" = k."id" AND t."tag" = ANY(${input.tags}::text[]))` : Prisma.empty}`;

    const vector = await (this.deps.embedder ?? noEmbeddings).embedQuery(input.query);
    const vec = vector ? toVectorLiteral(vector) : null;
    const cosineExpr = vec ? Prisma.sql`CASE WHEN k."embedding" IS NULL THEN NULL ELSE 1 - (k."embedding" <=> ${vec}::vector) END` : Prisma.sql`NULL::float8`;

    const lexical = await this.deps.db.$queryRaw<Candidate[]>`
      WITH q AS (SELECT websearch_to_tsquery('simple', ${input.query}) AS tsq)
      SELECT k."id", ts_rank_cd(k."searchVector", q.tsq)::float8 AS fts, similarity(k."title", ${input.query})::float8 AS trgm,
             ${cosineExpr}::float8 AS cosine,
             ts_headline('simple', k."searchText", q.tsq, 'MaxWords=28, MinWords=8, MaxFragments=1, StartSel=«, StopSel=»') AS snippet
      FROM "knowledge" k, q
      WHERE ${filters} AND (k."searchVector" @@ q.tsq OR similarity(k."title", ${input.query}) > 0.2)
      LIMIT 100`;
    const semantic = vec
      ? await this.deps.db.$queryRaw<Candidate[]>`
          SELECT k."id", 0::float8 AS fts, similarity(k."title", ${input.query})::float8 AS trgm, (1 - (k."embedding" <=> ${vec}::vector))::float8 AS cosine, NULL AS snippet
          FROM "knowledge" k
          WHERE ${filters} AND k."embedding" IS NOT NULL
          ORDER BY k."embedding" <=> ${vec}::vector
          LIMIT ${input.limit * 3}`
      : [];

    const merged = new Map<string, Candidate>();
    for (const c of [...lexical, ...semantic]) {
      const prev = merged.get(c.id);
      merged.set(c.id, prev ? { ...prev, fts: Math.max(prev.fts, c.fts), cosine: prev.cosine ?? c.cosine, snippet: prev.snippet ?? c.snippet } : c);
    }
    const ranked = [...merged.values()]
      .filter((c) => c.fts > 0 || c.trgm > 0.2 || (c.cosine ?? 0) >= SEMANTIC_ONLY_MIN)
      .map((c) => {
        const sem = c.cosine === null ? 0 : semanticScore(c.cosine);
        const score = (vec ? 0.5 * sem : 0) + (vec ? 0.35 : 0.7) * Math.min(1, c.fts * 5) + (vec ? 0.15 : 0.3) * c.trgm;
        const reasons = [c.fts > 0 ? 'text match' : null, c.trgm > 0.2 ? 'similar title' : null, c.cosine !== null && c.cosine >= SEMANTIC_ONLY_MIN ? 'similar meaning' : null].filter(Boolean) as string[];
        return { ...c, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
    if (ranked.length === 0) return { items: [], semantic: !!vec };

    const rows = await this.deps.db.knowledge.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      include: { project: { select: { name: true } }, author: { select: { name: true } }, tags: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { summary: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      semantic: !!vec,
      items: ranked.flatMap((r) => {
        const k = byId.get(r.id);
        if (!k) return [];
        return [{ id: k.id, title: k.title, kind: k.kind, validity: k.validity, visibility: k.visibility, version: k.currentVersion, project: k.project.name, author: k.author.name, tags: k.tags.map((t) => t.tag), summary: k.versions[0]?.summary ?? null, snippet: r.snippet, score: Number(r.score.toFixed(3)), matchedBy: r.reasons, publishedAt: k.publishedAt }];
      }),
    };
  }

  async list(userId: string, teamId: string, rawInput: ListKnowledgeInput) {
    const input = listKnowledgeSchema.parse(rawInput);
    const visible = (await this.visibleProjectIds(userId, teamId)).filter((id) => !input.projectId || id === input.projectId);
    const rows = await this.deps.db.knowledge.findMany({
      where: {
        teamId,
        deletedAt: null,
        projectId: { in: visible },
        OR: [{ visibility: 'PROJECT' }, { authorUserId: userId }],
        ...(input.mine ? { authorUserId: userId } : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.validity ? { validity: input.validity } : {}),
        ...(input.tag ? { tags: { some: { tag: input.tag } } } : {}),
      },
      include: { project: { select: { name: true } }, author: { select: { name: true } }, tags: true, _count: { select: { usages: true } } },
      orderBy: { publishedAt: 'desc' },
      take: input.limit,
    });
    return rows.map((k) => ({ id: k.id, title: k.title, kind: k.kind, validity: k.validity, visibility: k.visibility, version: k.currentVersion, project: k.project.name, author: k.author.name, tags: k.tags.map((t) => t.tag), readers: k._count.usages, publishedAt: k.publishedAt }));
  }

  /** Author or project manager. Outdated/deprecated items warn everyone who relied on them. */
  async setValidity(actor: Actor, knowledgeId: string, rawInput: SetValidityInput) {
    const input = setValiditySchema.parse(rawInput);
    const k = await this.deps.db.knowledge.findFirst({ where: { id: knowledgeId, deletedAt: null } });
    if (!k) throw new AppError('NOT_FOUND', 'Knowledge not found');
    const access = await this.accessOf(actor.userId, k.projectId);
    if (access === 'none' || !(await this.canSee(actor.userId, k))) throw new AppError('NOT_FOUND', 'Knowledge not found');
    if (k.authorUserId !== actor.userId && access !== 'manage') throw new AppError('FORBIDDEN', 'Only the author or a project maintainer can change validity');
    await withEvents(this.deps, async (tx, emit) => {
      await tx.knowledge.update({ where: { id: knowledgeId }, data: { validity: input.validity } });
      await recordAudit(tx, { teamId: k.teamId, actorUserId: actor.userId, actorAgentId: actorAgentId(actor) ?? undefined, action: 'knowledge.validity_changed', targetType: 'knowledge', targetId: knowledgeId, metadata: { from: k.validity, to: input.validity, reason: input.reason ?? null } });
      if (input.validity === 'OUTDATED' || input.validity === 'DEPRECATED') {
        await this.notifyReaders(tx, emit, k, actor, `${input.validity === 'OUTDATED' ? 'Outdated' : 'Deprecated'}: ${k.title}`, `knowledge-validity:${knowledgeId}:${input.validity}`, input.reason ?? 'Something you relied on is no longer valid. Check before continuing.');
      }
    });
    return { knowledgeId, validity: input.validity };
  }

  /** The author decides who sees an item; sharing a private one announces it to the project. */
  async setVisibility(actor: Actor, knowledgeId: string, rawInput: { visibility: KnowledgeVisibility }) {
    const { visibility } = setVisibilitySchema.parse(rawInput);
    const k = await this.deps.db.knowledge.findFirst({ where: { id: knowledgeId, deletedAt: null }, include: { tags: true } });
    if (!k || !(await this.canSee(actor.userId, k))) throw new AppError('NOT_FOUND', 'Knowledge not found');
    if (k.authorUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the author can change who sees this');
    if (k.visibility === visibility) return { knowledgeId, visibility };
    await withEvents(this.deps, async (tx, emit) => {
      const updated = await tx.knowledge.update({ where: { id: knowledgeId }, data: { visibility } });
      if (visibility === 'PROJECT') {
        const v = await tx.knowledgeVersion.findUniqueOrThrow({ where: { knowledgeId_version: { knowledgeId, version: k.currentVersion } }, select: { id: true } });
        await this.emitPublished(tx, emit, updated, v.id, k.tags.map((t) => t.tag), actor);
      }
    });
    return { knowledgeId, visibility };
  }

  /** Turns a published text deliverable (e.g. an OpenAPI contract) into shared, searchable knowledge. */
  async promoteDeliverable(actor: Actor, rawInput: PromoteDeliverableInput) {
    if (!this.deliverables) throw new AppError('INTERNAL', 'Deliverables service unavailable');
    const input = promoteDeliverableSchema.parse(rawInput);
    const d = await this.deliverables.read(actor, input.deliverableId, { inline: true });
    if (!d.content) throw new AppError('BAD_REQUEST', 'Only text deliverables (Markdown, JSON, OpenAPI) can become knowledge');
    const row = await this.deps.db.deliverable.findUniqueOrThrow({ where: { id: input.deliverableId }, select: { projectId: true, requestId: true, description: true } });
    return this.publish(actor, {
      projectId: row.projectId,
      kind: input.kind,
      title: d.title,
      content: d.content,
      summary: row.description ?? `${d.format} deliverable v${d.version}`,
      tags: input.tags,
      references: [{ type: 'deliverable', ref: input.deliverableId }, ...(row.requestId ? [{ type: 'request' as const, ref: row.requestId }] : [])],
    });
  }

  /** Worker: (re)computes embeddings of items whose current version has none. */
  async embedPending(provider: EmbeddingProvider, limit = 20): Promise<number> {
    const pending = await this.deps.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "knowledge" WHERE "deletedAt" IS NULL AND ("embedding" IS NULL OR "embeddingModel" IS DISTINCT FROM ${provider.model}) LIMIT ${limit}`;
    for (const { id } of pending) await this.embedOne(provider, id);
    return pending.length;
  }

  async embedOne(provider: EmbeddingProvider, knowledgeId: string) {
    const k = await this.deps.db.knowledge.findUnique({ where: { id: knowledgeId }, include: { tags: true } });
    if (!k || k.deletedAt) return;
    const v = await this.deps.db.knowledgeVersion.findUnique({ where: { knowledgeId_version: { knowledgeId, version: k.currentVersion } } });
    if (!v) return;
    const vector = await provider.embedPassage(passageText({ title: v.title, summary: v.summary, content: v.content, tags: k.tags.map((t) => t.tag) }));
    if (vector.length !== provider.dimensions) throw new Error(`Embedding has ${vector.length} dimensions, expected ${provider.dimensions}`);
    // Only store it if the version did not change meanwhile.
    await this.deps.db.$executeRaw`
      UPDATE "knowledge" SET "embedding" = ${toVectorLiteral(vector)}::vector, "embeddingModel" = ${provider.model}, "embeddedAt" = now()
      WHERE "id" = ${knowledgeId}::uuid AND "currentVersion" = ${k.currentVersion}`;
  }

  // ── helpers ──

  private async emitPublished(tx: Db, emit: Emit, knowledge: { id: string; teamId: string; projectId: string; title: string; currentVersion: number; visibility: KnowledgeVisibility; authorUserId: string }, versionId: string, tags: string[], actor: Actor) {
    const audience = knowledge.visibility === 'PRIVATE' ? [knowledge.authorUserId] : await this.projectAudience(tx, knowledge.teamId, knowledge.projectId);
    await emit({
      type: 'knowledge.published',
      teamId: knowledge.teamId,
      projectId: knowledge.projectId,
      actor: actorRef(actor),
      audience,
      payload: { knowledgeId: knowledge.id, versionId, version: knowledge.currentVersion, title: knowledge.title, tags },
    });
  }

  private async notifyReaders(tx: Db, emit: Emit, knowledge: { id: string; teamId: string; title: string }, actor: Actor, title: string, dedupeKey: string, body: string) {
    const readers = await tx.knowledgeUsage.findMany({ where: { knowledgeId: knowledge.id, userId: { not: actor.userId } }, select: { userId: true, version: true } });
    for (const r of readers) {
      await notify(tx, emit, { teamId: knowledge.teamId, userId: r.userId, kind: 'KNOWLEDGE_PUBLISHED', title, body: `${body} (you used v${r.version})`, link: `/knowledge/${knowledge.id}`, dedupeKey, data: { knowledgeId: knowledge.id } });
    }
  }

  /** Project access, and private items only for their author. */
  private async canSee(userId: string, k: { projectId: string; visibility: KnowledgeVisibility; authorUserId: string }): Promise<boolean> {
    if (k.visibility === 'PRIVATE' && k.authorUserId !== userId) return false;
    return (await this.accessOf(userId, k.projectId)) !== 'none';
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

  private async accessOf(userId: string, projectId: string): Promise<ProjectAccess> {
    const project = await projectsRepository.findActiveById(this.deps.db, projectId);
    if (!project) return 'none';
    const membership = await membersRepository.find(this.deps.db, project.teamId, userId);
    if (!membership) return 'none';
    const member = await projectsRepository.findProjectMember(this.deps.db, projectId, userId);
    return projectAccess(membership.role, member?.role ?? null);
  }
}

export type { KnowledgeKind, KnowledgeValidity };
