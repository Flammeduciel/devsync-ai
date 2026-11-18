import type {
  DeliverableContent,
  DependencyGraph,
  RequestDetail,
  RequestSummary,
} from '@devsync/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeError, type BridgeClient } from '../bridge';
import { formatDependencies, formatRequest } from '../format';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (error: unknown) => {
  const requestId = (error as { details?: { requestId?: string } }).details?.requestId;
  return {
    ...text(
      describeError(error) +
        (requestId ? ` Existing request: ${requestId} (use team_get_request).` : ''),
    ),
    isError: true,
  };
};
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const requestFields = {
  type: z
    .enum(['KNOWLEDGE', 'WORK', 'DEPENDENCY', 'REVIEW', 'COLLABORATION'])
    .describe(
      'KNOWLEDGE: an answer; WORK: something to build; DEPENDENCY: you are blocked until it exists; REVIEW: review something; COLLABORATION: work together',
    ),
  title: z.string().min(3).max(200),
  description: z
    .string()
    .min(1)
    .max(5000)
    .describe('Context and what is needed. Facts only: no secrets, no private reasoning.'),
  instructions: z.string().max(10_000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assigneeAgentId: z.uuid().optional().describe('From team_find_expert / team_search_agents'),
  assigneeUserId: z.uuid().optional(),
  expectedDeliverables: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        format: z.enum([
          'MARKDOWN',
          'JSON',
          'OPENAPI',
          'PDF',
          'IMAGE',
          'ARCHIVE',
          'GIT_REF',
          'PULL_REQUEST',
        ]),
        description: z.string().max(1000).optional(),
      }),
    )
    .max(10)
    .optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  parentRequestId: z
    .uuid()
    .optional()
    .describe('Set when this request is needed to fulfil another request you received'),
  dependentTaskId: z.uuid().optional(),
  projectId: z.uuid().optional(),
};

const created = (r: RequestSummary) =>
  text(
    r.awaitingApproval
      ? `Request ${r.id} created but held for approval by ${r.createdBy.name} (team autonomy rules). Tell the developer: they can approve it with \`devsync request approve ${r.id}\` or in the dashboard.`
      : `Request ${r.id} sent to ${r.assigneeUser?.name ?? '?'}${r.assigneeAgent ? `'s agent` : ''} (status ${r.status}). They are notified; check progress with team_get_request or team_get_inbox.`,
  );

/** Phase 4 tools: requests, clarifications, deliverables, dependencies, broadcast. */
export function registerCollaborationTools(server: McpServer, bridge: BridgeClient) {
  server.registerTool(
    'team_create_request',
    {
      title: 'Ask a teammate (developer or agent) for something',
      description:
        'Create a collaboration request when you need work, an answer, a review or a dependency from someone else in the team — typically after team_find_expert. Subject to the team autonomy policy: it may be held until your developer approves it, rate-limited, or refused as a duplicate (then you get the existing request id).',
      inputSchema: requestFields,
      annotations: write,
    },
    async (args) => {
      try {
        return created(await bridge.api<RequestSummary>('createRequest', args));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_suggest_collaboration',
    {
      title: 'Suggest a request for your developer to approve',
      description:
        'Like team_create_request, but always held until your developer approves it. Use it when unsure the request is wanted, or when it would interrupt someone.',
      inputSchema: requestFields,
      annotations: write,
    },
    async (args) => {
      try {
        return created(
          await bridge.api<RequestSummary>('createRequest', { ...args, suggestOnly: true }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_ask_agent',
    {
      title: 'Ask a teammate agent a question',
      description:
        'Shortcut for a KNOWLEDGE request to one agent. The answer arrives as a comment or a deliverable; check it later with team_get_request.',
      inputSchema: {
        agentId: z.uuid(),
        question: z.string().min(5).max(2000),
        context: z.string().max(5000).optional(),
        projectId: z.uuid().optional(),
      },
      annotations: write,
    },
    async ({ agentId, question, context, projectId }) => {
      try {
        const title = question.length > 120 ? `${question.slice(0, 117)}…` : question;
        return created(
          await bridge.api<RequestSummary>('createRequest', {
            type: 'KNOWLEDGE',
            title,
            description: context ? `${question}\n\n${context}` : question,
            assigneeAgentId: agentId,
            ...(projectId ? { projectId } : {}),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_get_request',
    {
      title: 'Read a collaboration request',
      description:
        'Full request: description, instructions, conversation, deliverables (with ids), tasks, and the actions you can take now.',
      inputSchema: { requestId: z.uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ requestId }) => {
      try {
        return text(formatRequest(await bridge.api<RequestDetail>('getRequest', { requestId })));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_update_request',
    {
      title: 'Act on a collaboration request',
      description:
        'Assignee: accept, reject (with a reason), start, complete. Requester: answer a clarification, cancel, approve a request your agent suggested. Or add a comment. Only actions listed by team_get_request are possible. Do not accept work your developer would not agree to — ask them when unsure.',
      inputSchema: {
        requestId: z.uuid(),
        action: z.enum([
          'accept',
          'reject',
          'start',
          'complete',
          'cancel',
          'answer',
          'approve',
          'comment',
        ]),
        comment: z
          .string()
          .max(5000)
          .optional()
          .describe('Required for answer and comment; a reason for reject'),
      },
      annotations: write,
    },
    async ({ requestId, action, comment }) => {
      try {
        if (action === 'comment') {
          if (!comment) return failure(new Error('A comment is required'));
          await bridge.api('comment', { requestId, body: comment });
          return text('Comment added.');
        }
        const r = await bridge.api<RequestSummary>('requestAction', {
          requestId,
          action,
          ...(comment ? { comment } : {}),
        });
        return text(
          `Request ${r.id} is now ${r.status}. Next possible actions for you: ${r.availableActions.join(', ') || 'none'}.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_request_clarification',
    {
      title: 'Ask the requester a question',
      description:
        'As the assignee, pause a request and ask its author a precise question. They are notified; the request resumes when they answer.',
      inputSchema: { requestId: z.uuid(), question: z.string().min(5).max(5000) },
      annotations: write,
    },
    async ({ requestId, question }) => {
      try {
        await bridge.api('requestAction', { requestId, action: 'clarify', comment: question });
        return text(
          'Question sent. The request waits for the answer (check it with team_get_request).',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_submit_deliverable',
    {
      title: 'Submit a deliverable',
      description:
        'Store a result on the DevSync server (not only on this machine): text content for MARKDOWN/JSON/OPENAPI (≤ 1 MB), a project file (filePath, ≤ 25 MB: pdf, images, archives, yaml, json, md), a Git commit (GIT_REF) or a pull request URL (PULL_REQUEST). Creates the deliverable or adds a new version (deliverableId). Then call team_publish_deliverable to deliver it.',
      inputSchema: {
        requestId: z
          .uuid()
          .optional()
          .describe('The request this deliverable answers (you must be its assignee)'),
        deliverableId: z
          .uuid()
          .optional()
          .describe('Add a new version to an existing deliverable instead of creating one'),
        title: z.string().min(1).max(200).optional(),
        format: z
          .enum([
            'MARKDOWN',
            'JSON',
            'OPENAPI',
            'PDF',
            'IMAGE',
            'ARCHIVE',
            'GIT_REF',
            'PULL_REQUEST',
          ])
          .optional(),
        content: z.string().max(1_000_000).optional(),
        filePath: z
          .string()
          .max(1024)
          .optional()
          .describe('Absolute or project-relative path of a file inside the project'),
        commit: z
          .string()
          .regex(/^[0-9a-f]{7,64}$/)
          .optional(),
        branch: z.string().max(255).optional(),
        path: z.string().max(1024).optional(),
        url: z.url().optional(),
        notes: z.string().max(2000).optional(),
        projectId: z.uuid().optional(),
      },
      annotations: write,
    },
    async (args) => {
      let createdId: string | undefined;
      try {
        let deliverableId = args.deliverableId;
        if (!deliverableId) {
          if (!args.title || !args.format)
            return failure(new Error('title and format are required for a new deliverable'));
          const d = await bridge.api<{ id: string }>('createDeliverable', {
            title: args.title,
            format: args.format,
            ...(args.requestId ? { requestId: args.requestId } : {}),
            ...(args.projectId ? { projectId: args.projectId } : {}),
          });
          deliverableId = d.id;
          createdId = d.id;
        }
        const notes = args.notes ? { notes: args.notes } : {};
        let version: { version: number };
        if (args.filePath)
          version = await bridge.api('uploadDeliverableFile', {
            deliverableId,
            filePath: args.filePath,
            ...notes,
          });
        else if (args.content)
          version = await bridge.api('addDeliverableVersion', {
            deliverableId,
            kind: 'inline',
            content: args.content,
            ...notes,
          });
        else if (args.commit)
          version = await bridge.api('addDeliverableVersion', {
            deliverableId,
            kind: 'git_ref',
            commit: args.commit,
            ...(args.branch ? { branch: args.branch } : {}),
            ...(args.path ? { path: args.path } : {}),
            ...notes,
          });
        else if (args.url)
          version = await bridge.api('addDeliverableVersion', {
            deliverableId,
            kind: 'url',
            url: args.url,
            ...notes,
          });
        else return failure(new Error('Provide content, filePath, commit or url'));
        return text(
          `Deliverable ${deliverableId} v${version.version} stored on the server. Call team_publish_deliverable with this deliverableId to deliver it.`,
        );
      } catch (error) {
        const result = failure(error);
        // Retry on the same deliverable instead of creating an empty one each time.
        if (createdId)
          result.content[0]!.text += ` The deliverable ${createdId} was created without a version: retry with deliverableId ${createdId}.`;
        return result;
      }
    },
  );

  server.registerTool(
    'team_publish_deliverable',
    {
      title: 'Publish (deliver) a deliverable',
      description:
        'Publishes the latest version. If it answers a request, the request becomes DELIVERED and the requester is notified (desktop notification and sound on their machine). Published versions are immutable.',
      inputSchema: { deliverableId: z.uuid() },
      annotations: write,
    },
    async ({ deliverableId }) => {
      try {
        const r = await bridge.api<{ requestStatus: string | null }>('publishDeliverable', {
          deliverableId,
        });
        return text(
          r.requestStatus
            ? `Published. The request is now ${r.requestStatus} and the requester has been notified — no further action is needed on it.`
            : 'Published.',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_read_deliverable',
    {
      title: 'Read a deliverable you received',
      description:
        'Returns the content of a text deliverable (Markdown, JSON, OpenAPI) or a short-lived download link / Git reference / URL for the others.',
      inputSchema: { deliverableId: z.uuid(), version: z.number().int().positive().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const d = await bridge.api<DeliverableContent>('readDeliverable', args);
        const header = `# ${d.title} (${d.format}, v${d.version})`;
        if (d.content) return text(`${header}\n\n${d.content}`);
        if (d.gitRef)
          return text(
            `${header}\nGit commit ${d.gitRef.commit}${d.gitRef.branch ? ` on ${d.gitRef.branch}` : ''}${d.gitRef.path ? `, path ${d.gitRef.path}` : ''}`,
          );
        if (d.url) return text(`${header}\n${d.url}`);
        return text(`${header}\nDownload (valid 5 minutes): ${d.downloadUrl}`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_get_dependencies',
    {
      title: 'Show what blocks what',
      description:
        'Dependency graph around a request or a task: which tasks block it and which it blocks, with their status.',
      inputSchema: { requestId: z.uuid().optional(), taskId: z.uuid().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ requestId, taskId }) => {
      try {
        if (!requestId && !taskId) return failure(new Error('requestId or taskId is required'));
        const graph = taskId
          ? await bridge.api<DependencyGraph>('taskDependencies', { taskId })
          : await bridge.api<DependencyGraph>('requestDependencies', { requestId });
        return text(formatDependencies(graph));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_broadcast',
    {
      title: 'Tell your project team something',
      description:
        'Short notification to every member of the project (e.g. "The POST /payments contract changed: amount is now in cents"). Limited to 10 per hour. Facts only.',
      inputSchema: { message: z.string().min(3).max(1000), projectId: z.uuid().optional() },
      annotations: write,
    },
    async (args) => {
      try {
        const { delivered } = await bridge.api<{ delivered: number }>('broadcast', args);
        return text(`Sent to ${delivered} teammate(s).`);
      } catch (error) {
        return failure(error);
      }
    },
  );
}
