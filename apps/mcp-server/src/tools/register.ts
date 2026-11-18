import type {
  ActivityEntry,
  ClaimInfo,
  DeliveredItem,
  Expert,
  InboxItem,
  TeamContext,
} from '@devsync/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeError, workingDirectory, type BridgeClient } from '../bridge';
import {
  formatActivity,
  formatClaims,
  formatContext,
  formatDelivered,
  formatExperts,
  formatInbox,
} from '../format';
import { registerCollaborationTools } from './collaboration';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (error: unknown) => ({ ...text(describeError(error)), isError: true });

const projectId = z
  .uuid()
  .optional()
  .describe(
    'DevSync project id. Omit it: the project is found from the Git remote of the current repository.',
  );
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

/** Tools available in Phase 3. Each one is backed by a real API; permissions are enforced server-side. */
export function registerTools(server: McpServer, bridge: BridgeClient) {
  server.registerTool(
    'team_get_context',
    {
      title: 'Get team context',
      description:
        'Call this at the start of a significant task. Returns the DevSync project of the current repository, teammates currently working (and on what), requests waiting for you, claimed resources and recent team activity. Use it to avoid duplicating work another agent is doing.',
      inputSchema: { projectId },
      annotations: readOnly,
    },
    async (args) => {
      try {
        return text(formatContext(await bridge.api<TeamContext>('context', args)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_search_agents',
    {
      title: 'Search teammate agents',
      description:
        'Find agents of the team by owner, agent name, current task or specialty (e.g. "payments", "frontend"). Offline agents are excluded unless includeOffline is true.',
      inputSchema: {
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Free text matched against owner, agent name, task and specialties'),
        includeOffline: z.boolean().optional(),
        projectId,
      },
      annotations: readOnly,
    },
    async (args) => {
      try {
        const { items } = await bridge.api<{
          items: {
            id: string;
            user: { name: string };
            name: string;
            status: string;
            currentTask: string | null;
            specialties: string[];
          }[];
        }>('searchAgents', args);
        return text(
          items.length
            ? items
                .map(
                  (a) =>
                    `- ${a.user.name} (${a.name}, ${a.status.toLowerCase()})${a.currentTask ? `: ${a.currentTask}` : ''}${a.specialties.length ? ` · ${a.specialties.join(', ')}` : ''} (agentId ${a.id})`,
                )
                .join('\n')
            : 'No matching agent.',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_get_activity',
    {
      title: 'Get recent team activity',
      description:
        "Recent structured activity of the team (sessions, declared tasks, files edited). Only explicitly published facts, never other agents' reasoning.",
      inputSchema: {
        agentId: z.uuid().optional(),
        since: z.iso
          .datetime({ offset: true })
          .optional()
          .describe('ISO date; only activity after it'),
        limit: z.number().int().min(1).max(50).optional(),
        projectId,
      },
      annotations: readOnly,
    },
    async (args) => {
      try {
        return text(
          formatActivity((await bridge.api<{ items: ActivityEntry[] }>('activity', args)).items),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_find_expert',
    {
      title: 'Find a teammate who knows a topic',
      description:
        'Before researching a topic from scratch, find who in the team has worked on it (declared specialties, current task, recent activity). Each result explains why it matched.',
      inputSchema: {
        topic: z
          .string()
          .min(2)
          .max(200)
          .describe('e.g. "stripe webhooks", "payment API contract"'),
        projectId,
      },
      annotations: readOnly,
    },
    async (args) => {
      try {
        return text(formatExperts((await bridge.api<{ items: Expert[] }>('experts', args)).items));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_get_inbox',
    {
      title: 'Get my inbox',
      description:
        'Collaboration requests assigned to the developer or to their agents that are still open.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      try {
        const { items, delivered } = await bridge.api<{
          items: InboxItem[];
          delivered?: DeliveredItem[];
        }>('inbox');
        return text(
          [formatInbox(items), formatDelivered(delivered ?? [])].filter(Boolean).join('\n\n'),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_claim_resource',
    {
      title: 'Claim a resource before working on it',
      description:
        'Signal to other agents that you are about to change a file, directory, API contract or topic, so they do not work on it at the same time. Advisory only: it never blocks Git. If someone else holds it, you get who and why — coordinate instead of overwriting. Claims expire (default 60 min); renewing your own claim extends it.',
      inputSchema: {
        resourceType: z.enum(['FILE', 'DIRECTORY', 'API_CONTRACT', 'TOPIC']),
        resourceKey: z
          .string()
          .min(1)
          .max(500)
          .describe(
            'Repository-relative path for FILE/DIRECTORY (e.g. src/payment.service.ts), or a name for API_CONTRACT/TOPIC',
          ),
        reason: z.string().max(500).optional(),
        ttlMinutes: z.number().int().min(1).max(240).optional(),
        projectId,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const claim = await bridge.api<{
          claimId: string;
          resourceKey: string;
          expiresAt: string;
          renewed: boolean;
        }>('claim', args);
        return text(
          `${claim.renewed ? 'Renewed' : 'Claimed'} \`${claim.resourceKey}\` until ${claim.expiresAt} (claimId ${claim.claimId}). Release it with team_release_resource when done.`,
        );
      } catch (error) {
        const holder = (error as { details?: { claim?: ClaimInfo } }).details?.claim;
        if (holder)
          return {
            ...text(
              `Already claimed:\n${formatClaims([holder])}\nCoordinate with ${holder.holder.userName} (agentId ${holder.holder.agentId}) before changing it.`,
            ),
            isError: true,
          };
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_release_resource',
    {
      title: 'Release a claimed resource',
      description: 'Release a claim obtained with team_claim_resource once your change is done.',
      inputSchema: { claimId: z.uuid() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        await bridge.api('releaseClaim', args);
        return text('Released.');
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'team_set_status',
    {
      title: 'Declare what you are working on',
      description:
        'Publish a short, factual description of your current task (visible to the team on the Live agents page) and your state. Never include secrets or private reasoning. Use null to clear the task.',
      inputSchema: {
        currentTask: z.string().max(500).nullable().optional(),
        status: z.enum(['WORKING', 'WAITING', 'IDLE']).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const { updated } = await bridge.call<{ updated: number }>('session.updateByDirectory', {
          ...args,
          workingDirectory: workingDirectory(),
        });
        return text(
          updated
            ? 'Status published.'
            : 'No DevSync session is registered for this directory yet (the SessionStart hook registers it).',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerCollaborationTools(server, bridge);
}
