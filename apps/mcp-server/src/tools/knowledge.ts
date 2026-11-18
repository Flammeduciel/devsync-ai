import type { KnowledgeItem, KnowledgeListItem, KnowledgeSearchResult } from '@devsync/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeError, type BridgeClient } from '../bridge';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (error: unknown) => ({ ...text(describeError(error)), isError: true });
const kind = z.enum([
  'DECISION',
  'BRAINSTORM',
  'DOCUMENTATION',
  'API_CONTRACT',
  'SOLUTION',
  'ANALYSIS',
  'INSTRUCTION',
  'DELIVERABLE',
]);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const line = (k: {
  id: string;
  title: string;
  kind: string;
  version: number;
  visibility?: string;
  validity?: string;
}) =>
  `"${k.title}" (${k.kind.toLowerCase()}, v${k.version}${k.visibility === 'PRIVATE' ? ', private' : ''}${k.validity && k.validity !== 'VALID' ? `, ${k.validity.toLowerCase()}` : ''}, knowledgeId ${k.id})`;

/** Phase 5 tools: search before researching, read, publish (private or shared), share later. */
export function registerKnowledgeTools(server: McpServer, bridge: BridgeClient) {
  server.registerTool(
    'team_search_knowledge',
    {
      title: 'Search team knowledge',
      description:
        'Search what the team (and you, in previous sessions) already published: decisions, API contracts, analyses, solutions, project understanding, brainstorms. Call it BEFORE researching, exploring the codebase from scratch or designing something. Matches text, titles and meaning (also across French/English).',
      inputSchema: {
        query: z.string().min(2).max(500),
        tags: z.array(z.string().max(48)).max(10).optional(),
        kind: kind.optional(),
        includeOutdated: z.boolean().optional(),
        projectId: z.uuid().optional(),
      },
      annotations: readOnly,
    },
    async (args) => {
      try {
        const r = await bridge.api<KnowledgeSearchResult>('searchKnowledge', args);
        if (r.items.length === 0)
          return text(
            `Nothing found${r.semantic ? '' : ' (text search only: semantic search is not running)'}. If you do the work, offer the developer to publish a reusable summary afterwards.`,
          );
        return text(
          r.items
            .map(
              (k) =>
                `- ${line(k)} by ${k.author} — ${k.summary ?? k.snippet ?? ''} [${k.matchedBy.join(', ')}]`,
            )
            .join('\n') + '\n\nRead an item with team_get_knowledge before relying on it.',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_get_knowledge',
    {
      title: 'Read a knowledge item',
      description:
        'Full content of a knowledge item (latest version by default). Reading it records that you rely on it: you will be told if it changes or becomes outdated.',
      inputSchema: { knowledgeId: z.uuid(), version: z.number().int().positive().optional() },
      annotations: readOnly,
    },
    async (args) => {
      try {
        const k = await bridge.api<KnowledgeItem>('getKnowledge', args);
        const header = [
          `# ${k.title}`,
          `${k.kind.toLowerCase()} · v${k.version}${k.version !== k.currentVersion ? ` (latest is v${k.currentVersion})` : ''} · ${k.validity.toLowerCase()} · ${k.visibility === 'PRIVATE' ? 'private (only you)' : `shared with ${k.project.name}`} · by ${k.author}`,
          k.tags.length ? `Tags: ${k.tags.join(', ')}` : '',
          k.references.length
            ? `References: ${k.references.map((r) => `${r.type} ${r.ref}`).join('; ')}`
            : '',
        ].filter(Boolean);
        return text(`${header.join('\n')}\n\n${k.content}`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_publish_knowledge',
    {
      title: 'Publish knowledge (private or shared)',
      description:
        'Save a structured, reusable summary: project understanding, decision, API contract, analysis, solution, brainstorm. Write a clean synthesis (context, conclusions, key files, open questions) — never the raw conversation, secrets or private reasoning. ASK THE DEVELOPER whether to share it with the project (visibility PROJECT) or keep it for themselves and their future sessions (PRIVATE), and show them the summary first. Pass knowledgeId to publish a new version.',
      inputSchema: {
        title: z.string().min(3).max(200),
        kind,
        content: z.string().min(1).max(100_000).describe('Markdown'),
        summary: z
          .string()
          .max(1000)
          .optional()
          .describe('One or two sentences shown in search results'),
        tags: z.array(z.string().max(48)).max(20).optional(),
        references: z
          .array(
            z.object({
              type: z.enum(['file', 'commit', 'url', 'deliverable', 'request']),
              ref: z.string().min(1).max(1024),
            }),
          )
          .max(50)
          .optional(),
        visibility: z.enum(['PRIVATE', 'PROJECT']).describe('Chosen by the developer'),
        knowledgeId: z.uuid().optional(),
        validity: z.enum(['DRAFT', 'VALID']).optional(),
        projectId: z.uuid().optional(),
      },
      annotations: write,
    },
    async (args) => {
      try {
        const r = await bridge.api<{ knowledgeId: string; version: number; visibility: string }>(
          'publishKnowledge',
          args,
        );
        return text(
          r.visibility === 'PRIVATE'
            ? `Saved privately (knowledgeId ${r.knowledgeId}, v${r.version}): only the developer and their future sessions can find it. Share it later with team_set_knowledge_visibility.`
            : `Shared with the project (knowledgeId ${r.knowledgeId}, v${r.version}). Teammates' agents will find it with team_search_knowledge.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_list_my_knowledge',
    {
      title: "List the developer's own knowledge",
      description:
        'Items the developer published, private and shared — e.g. to pick which private results to share.',
      inputSchema: { visibility: z.enum(['PRIVATE', 'PROJECT']).optional(), kind: kind.optional() },
      annotations: readOnly,
    },
    async (args) => {
      try {
        const { items } = await bridge.api<{ items: KnowledgeListItem[] }>('listKnowledge', {
          ...args,
          mine: true,
        });
        return text(
          items.length
            ? items.map((k) => `- ${line(k)} · ${k.project} · ${k.readers} reader(s)`).join('\n')
            : 'Nothing published yet.',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_set_knowledge_visibility',
    {
      title: 'Share or unshare a knowledge item',
      description:
        "Make one of the developer's items visible to the project (PROJECT) or private again (PRIVATE). Only when the developer asks.",
      inputSchema: { knowledgeId: z.uuid(), visibility: z.enum(['PRIVATE', 'PROJECT']) },
      annotations: write,
    },
    async (args) => {
      try {
        await bridge.api('setKnowledgeVisibility', args);
        return text(args.visibility === 'PROJECT' ? 'Shared with the project.' : 'Now private.');
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_set_knowledge_validity',
    {
      title: 'Mark knowledge outdated or deprecated',
      description:
        'For items the developer authored (or as project maintainer): mark them OUTDATED or DEPRECATED with a reason. Everyone who relied on them is warned.',
      inputSchema: {
        knowledgeId: z.uuid(),
        validity: z.enum(['VALID', 'OUTDATED', 'DEPRECATED', 'DRAFT']),
        reason: z.string().max(1000).optional(),
      },
      annotations: write,
    },
    async (args) => {
      try {
        await bridge.api('setKnowledgeValidity', args);
        return text(`Marked ${args.validity.toLowerCase()}.`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_promote_deliverable',
    {
      title: 'Turn a deliverable into shared knowledge',
      description:
        'Make a published text deliverable (e.g. an OpenAPI contract you received or produced) searchable by the whole project.',
      inputSchema: {
        deliverableId: z.uuid(),
        kind: kind.optional(),
        tags: z.array(z.string().max(48)).max(20).optional(),
      },
      annotations: write,
    },
    async (args) => {
      try {
        const r = await bridge.api<{ knowledgeId: string }>('promoteDeliverable', args);
        return text(`Now shared knowledge (knowledgeId ${r.knowledgeId}).`);
      } catch (error) {
        return failure(error);
      }
    },
  );
}
