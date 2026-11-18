import type { OverlapResult } from '@devsync/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeError, workingDirectory, type BridgeClient } from '../bridge';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

/** Phase 6: Git overlap awareness before editing. */
export function registerGitTools(server: McpServer, bridge: BridgeClient) {
  server.registerTool(
    'team_check_overlap',
    {
      title: 'Who else is changing these files?',
      description:
        "Before a substantial change, check whether teammates' agents are currently modifying (uncommitted or on their branch) or have claimed the files you are about to edit, and which base lines. Use the result to decide with the developer: coordinate, choose another approach, or wait.",
      inputSchema: {
        files: z
          .array(z.string().min(1).max(1024))
          .min(1)
          .max(100)
          .describe('Repository-relative paths'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ files }) => {
      try {
        const r = await bridge.call<OverlapResult>('git.overlap', {
          workingDirectory: workingDirectory(),
          files,
        });
        if (!r.tracked)
          return text(
            'This repository is not linked to a DevSync project: no overlap information.',
          );
        const lines = r.files.flatMap((f) => {
          if (!f.touchedBy.length && !f.claimedBy.length) return [`- \`${f.file}\`: nobody else`];
          return [
            ...f.touchedBy.map(
              (t) => `- \`${f.file}\`: ${t.owner} on branch ${t.branch}, base lines ${t.lines}`,
            ),
            ...f.claimedBy.map(
              (c) =>
                `- \`${f.file}\`: claimed by ${c.owner}${c.reason ? ` (${c.reason})` : ''} until ${c.expiresAt}`,
            ),
          ];
        });
        return text(lines.join('\n'));
      } catch (error) {
        return { ...text(describeError(error)), isError: true };
      }
    },
  );
}
