import { createHash } from 'node:crypto';
import type { Prisma } from '@devsync/database';
import { AppError, newId } from '@devsync/shared';
import {
  attachmentUploadSchema,
  createDeliverableSchema,
  deliverableVersionSchema,
  type AttachmentUploadInput,
  type CreateDeliverableInput,
  type DeliverableVersionInput,
} from '@devsync/validation';
import { INLINE_FORMATS, isAllowedContentType, MAX_FILE_BYTES, MAX_INLINE_BYTES, ATTACHMENT_CONTENT_TYPES, safeFileName, storageKeys } from '../domain/files';
import { hasProjectAccess, projectAccess, type ProjectAccess } from '../domain/project-access';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requestsRepository } from '../repositories/requests.repository';
import { tasksRepository } from '../repositories/tasks.repository';
import { actorAgentId, actorRef, type Actor } from './actor';
import { resolveDeviceProject } from './device-project.service';
import { withEvents } from './events.service';
import { notify } from './notifications.service';
import type { ObjectStorage } from './object-storage';
import { clock, type ServiceDeps } from './ports';
import { transitionTask } from './tasks.service';

const DEFAULT_INLINE_TYPE = { MARKDOWN: 'text/markdown', JSON: 'application/json', OPENAPI: 'application/yaml' } as const;
const DEFAULT_INLINE_NAME = { MARKDOWN: 'deliverable.md', JSON: 'deliverable.json', OPENAPI: 'openapi.yaml' } as const;
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/**
 * Deliverables live on the server (object storage), not on their author's machine. Versions are
 * immutable; publishing the latest version delivers the linked request and notifies the requester.
 */
export class DeliverablesService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly storage: ObjectStorage,
  ) {}

  async create(actor: Actor, rawInput: CreateDeliverableInput, device?: { teamId: string; machineId: string; userId: string }) {
    const input = createDeliverableSchema.parse(rawInput);
    let projectId = input.projectId;
    let teamId: string;
    if (input.requestId) {
      const request = await requestsRepository.findActive(this.deps.db, input.requestId);
      if (!request || (await this.accessOf(actor.userId, request.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Request not found');
      if (request.assigneeUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the assignee delivers this request');
      if (['DELIVERED', 'REJECTED', 'CANCELLED'].includes(request.status)) throw new AppError('CONFLICT', `The request is ${request.status.toLowerCase()}`);
      projectId = request.projectId;
      teamId = request.teamId;
    } else if (device) {
      const resolved = await resolveDeviceProject(this.deps, device, input);
      if (!resolved) throw new AppError('NOT_FOUND', 'No project matches this repository; pass projectId');
      projectId = resolved.projectId;
      teamId = device.teamId;
    } else {
      if (!projectId) throw new AppError('VALIDATION_FAILED', 'projectId or requestId is required');
      const project = await projectsRepository.findActiveById(this.deps.db, projectId);
      if (!project) throw new AppError('NOT_FOUND', 'Project not found');
      teamId = project.teamId;
    }
    if (!hasProjectAccess(await this.accessOf(actor.userId, projectId!), 'write')) throw new AppError('NOT_FOUND', 'Project not found');
    return this.deps.db.deliverable.create({
      data: {
        teamId,
        projectId: projectId!,
        requestId: input.requestId ?? null,
        taskId: input.taskId ?? null,
        title: input.title,
        description: input.description ?? null,
        format: input.format,
        createdByUserId: actor.userId,
        createdByAgentId: actorAgentId(actor),
      },
    });
  }

  /**
   * Adds an immutable version. Inline text is stored by the server; files get a pre-signed upload URL
   * (the signature binds content type and size; publish checks the object really arrived).
   */
  async addVersion(actor: Actor, deliverableId: string, rawInput: DeliverableVersionInput) {
    const input = deliverableVersionSchema.parse(rawInput);
    const deliverable = await this.requireOwn(actor, deliverableId);
    if (deliverable.status === 'PUBLISHED') throw new AppError('CONFLICT', 'Published deliverables are immutable; create a new deliverable');
    const version = deliverable.currentVersion + 1;
    const base = { teamId: deliverable.teamId, deliverableId, version, notes: input.notes ?? null, createdByUserId: actor.userId, createdByAgentId: actorAgentId(actor) };
    let data: Prisma.DeliverableVersionUncheckedCreateInput;
    let uploadUrl: string | null = null;

    switch (input.kind) {
      case 'inline': {
        if (!INLINE_FORMATS.includes(deliverable.format)) throw new AppError('BAD_REQUEST', `${deliverable.format} deliverables must be uploaded as files`);
        const format = deliverable.format as keyof typeof DEFAULT_INLINE_TYPE;
        const contentType = input.contentType ?? DEFAULT_INLINE_TYPE[format];
        if (!isAllowedContentType(deliverable.format, contentType)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `${contentType} is not allowed for ${deliverable.format}`);
        const body = new TextEncoder().encode(input.content);
        if (body.byteLength > MAX_INLINE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Inline content is limited to 1 MB; upload a file instead');
        const key = storageKeys.deliverable(deliverable.teamId, deliverableId, version, input.fileName ?? DEFAULT_INLINE_NAME[format]);
        await this.storage.put(key, body, contentType);
        data = { ...base, storageKey: key, contentType, sizeBytes: body.byteLength, checksumSha256: sha256(body) };
        break;
      }
      case 'upload': {
        if (!isAllowedContentType(deliverable.format, input.contentType)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `${input.contentType} is not allowed for ${deliverable.format}`);
        if (input.sizeBytes > MAX_FILE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Files are limited to 25 MB');
        const key = storageKeys.deliverable(deliverable.teamId, deliverableId, version, input.fileName);
        uploadUrl = await this.storage.presignPut(key, input.contentType, input.sizeBytes);
        data = { ...base, storageKey: key, contentType: input.contentType, sizeBytes: input.sizeBytes, checksumSha256: input.checksumSha256 ?? null };
        break;
      }
      case 'git_ref': {
        if (deliverable.format !== 'GIT_REF') throw new AppError('BAD_REQUEST', 'Git references need a GIT_REF deliverable');
        if (input.repositoryId) {
          const repo = await this.deps.db.repository.findFirst({ where: { id: input.repositoryId, projectId: deliverable.projectId, deletedAt: null } });
          if (!repo) throw new AppError('NOT_FOUND', 'Repository not found in this project');
        }
        data = { ...base, gitRef: { commit: input.commit, branch: input.branch ?? null, path: input.path ?? null, repositoryId: input.repositoryId ?? null } };
        break;
      }
      case 'url': {
        if (deliverable.format !== 'PULL_REQUEST') throw new AppError('BAD_REQUEST', 'Links need a PULL_REQUEST deliverable');
        data = { ...base, url: input.url };
        break;
      }
    }

    const created = await this.deps.db.$transaction(async (tx) => {
      const v = await tx.deliverableVersion.create({ data });
      await tx.deliverable.update({ where: { id: deliverableId }, data: { currentVersion: version, status: 'SUBMITTED' } });
      return v;
    });
    return { deliverableId, version: created.version, versionId: created.id, uploadUrl };
  }

  /** Publishes the latest version: request → DELIVERED, task → DONE, requester notified with sound. */
  async publish(actor: Actor, deliverableId: string) {
    const deliverable = await this.requireOwn(actor, deliverableId);
    if (deliverable.status === 'PUBLISHED') return { deliverableId, status: 'PUBLISHED' as const, requestStatus: null };
    const latest = await this.deps.db.deliverableVersion.findUnique({ where: { deliverableId_version: { deliverableId, version: deliverable.currentVersion } } });
    if (!latest) throw new AppError('CONFLICT', 'Add a version before publishing');
    if (latest.storageKey) {
      const head = await this.storage.head(latest.storageKey);
      if (!head) throw new AppError('CONFLICT', 'The file of the latest version was not uploaded yet');
      if (latest.sizeBytes !== null && BigInt(head.sizeBytes) !== latest.sizeBytes) throw new AppError('CONFLICT', 'Uploaded file size does not match the declared size');
    }
    const now = clock(this.deps);
    const request = deliverable.requestId ? await requestsRepository.findActive(this.deps.db, deliverable.requestId) : null;

    await withEvents(this.deps, async (tx, emit) => {
      await tx.deliverable.update({ where: { id: deliverableId }, data: { status: 'PUBLISHED', publishedAt: now } });
      if (!request) return;
      if (!['DELIVERED', 'REJECTED', 'CANCELLED'].includes(request.status)) {
        await requestsRepository.update(tx, request.id, { status: 'DELIVERED', closedAt: now });
        const task = await tasksRepository.findForRequest(tx, request.id);
        if (task && task.status !== 'DONE') await transitionTask(tx, emit, task, 'DONE', now);
      }
      await requestsRepository.addHistory(tx, {
        teamId: request.teamId,
        requestId: request.id,
        actorType: actor.type,
        actorUserId: actor.userId,
        actorAgentId: actorAgentId(actor),
        action: 'deliverable_published',
        fromStatus: request.status,
        toStatus: 'DELIVERED',
        data: { deliverableId, version: latest.version, title: deliverable.title },
      });
      await emit({
        type: 'collaboration.deliverable.ready',
        teamId: request.teamId,
        projectId: request.projectId,
        actor: actorRef(actor),
        audience: [...new Set([request.createdByUserId, request.assigneeUserId].filter((u): u is string => !!u))],
        payload: { requestId: request.id, deliverableId, versionId: latest.id, version: latest.version, title: deliverable.title, format: deliverable.format },
      });
      await notify(tx, emit, {
        teamId: request.teamId,
        userId: request.createdByUserId,
        kind: 'DELIVERABLE_READY',
        title: `Deliverable ready: ${deliverable.title}`,
        body: `For "${request.title}" (v${latest.version}, ${deliverable.format.toLowerCase().replace('_', ' ')})`,
        link: `/requests/${request.id}`,
        dedupeKey: `deliverable-ready:${deliverableId}`,
        data: { requestId: request.id, deliverableId },
      });
    });
    return { deliverableId, status: 'PUBLISHED' as const, requestStatus: request ? ('DELIVERED' as const) : null };
  }

  /** Download link (files) or reference (git/url). Text content ≤ 1 MB is returned inline for agents. */
  async read(actor: Actor, deliverableId: string, options: { version?: number; inline?: boolean } = {}) {
    const deliverable = await this.deps.db.deliverable.findFirst({ where: { id: deliverableId, deletedAt: null } });
    if (!deliverable || (await this.accessOf(actor.userId, deliverable.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Deliverable not found');
    if (deliverable.status !== 'PUBLISHED' && deliverable.createdByUserId !== actor.userId) throw new AppError('NOT_FOUND', 'Deliverable not found');
    const version = await this.deps.db.deliverableVersion.findUnique({
      where: { deliverableId_version: { deliverableId, version: options.version ?? deliverable.currentVersion } },
    });
    if (!version) throw new AppError('NOT_FOUND', 'Version not found');
    const fileName = version.storageKey?.split('/').pop() ?? 'deliverable';
    let content: string | null = null;
    if (options.inline && version.storageKey && INLINE_FORMATS.includes(deliverable.format) && (version.sizeBytes ?? 0n) <= BigInt(MAX_INLINE_BYTES)) {
      const body = await this.storage.get(version.storageKey);
      content = body ? new TextDecoder().decode(body) : null;
    }
    return {
      deliverableId,
      title: deliverable.title,
      format: deliverable.format,
      version: version.version,
      contentType: version.contentType,
      downloadUrl: version.storageKey ? await this.storage.presignGet(version.storageKey, fileName) : null,
      gitRef: version.gitRef,
      url: version.url,
      content,
    };
  }

  /** Attachment on a request (or one of its comments): pre-signed upload with type and size limits. */
  async requestAttachmentUpload(actor: Actor, requestId: string, rawInput: AttachmentUploadInput) {
    const input = attachmentUploadSchema.parse(rawInput);
    const request = await requestsRepository.findActive(this.deps.db, requestId);
    if (!request || (await this.accessOf(actor.userId, request.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Request not found');
    if (request.createdByUserId !== actor.userId && request.assigneeUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the people involved can attach files');
    const contentType = input.contentType.toLowerCase().split(';')[0]!.trim();
    if (!ATTACHMENT_CONTENT_TYPES.includes(contentType)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `${contentType} attachments are not allowed`);
    if (input.sizeBytes > MAX_FILE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Files are limited to 25 MB');
    if (input.commentId && !(await this.deps.db.requestComment.findFirst({ where: { id: input.commentId, requestId } }))) throw new AppError('NOT_FOUND', 'Comment not found');
    const id = newId();
    const key = storageKeys.attachment(request.teamId, id, input.fileName);
    const attachment = await this.deps.db.attachment.create({
      data: {
        id,
        teamId: request.teamId,
        requestId,
        commentId: input.commentId ?? null,
        uploadedByUserId: actor.userId,
        uploadedByAgentId: actorAgentId(actor),
        fileName: safeFileName(input.fileName),
        contentType,
        sizeBytes: input.sizeBytes,
        storageKey: key,
      },
    });
    return { attachmentId: attachment.id, uploadUrl: await this.storage.presignPut(key, contentType, input.sizeBytes) };
  }

  async attachmentDownload(actor: Actor, attachmentId: string) {
    const attachment = await this.deps.db.attachment.findFirst({ where: { id: attachmentId, deletedAt: null }, include: { request: { select: { projectId: true } } } });
    if (!attachment?.request || (await this.accessOf(actor.userId, attachment.request.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Attachment not found');
    if (!(await this.storage.head(attachment.storageKey))) throw new AppError('NOT_FOUND', 'The file was not uploaded');
    return { url: await this.storage.presignGet(attachment.storageKey, attachment.fileName) };
  }

  private async requireOwn(actor: Actor, deliverableId: string) {
    const deliverable = await this.deps.db.deliverable.findFirst({ where: { id: deliverableId, deletedAt: null } });
    if (!deliverable || (await this.accessOf(actor.userId, deliverable.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Deliverable not found');
    if (deliverable.createdByUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the author can change this deliverable');
    return deliverable;
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
