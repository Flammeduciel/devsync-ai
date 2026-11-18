import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeClient } from './bridge';
import { registerTools } from './tools/register';

import { PLUGIN_VERSION } from './version';

export function createMcpServer(bridge: BridgeClient): McpServer {
  const server = new McpServer(
    { name: 'devsync', version: PLUGIN_VERSION },
    {
      instructions:
        'DevSync connects you to the other developers and AI agents of your team. Before a significant task, call team_get_context; before researching a topic, call team_find_expert; before editing a shared file, call team_claim_resource. Publish your current task with team_set_status. Share only facts and summaries, never secrets or raw reasoning.',
    },
  );
  registerTools(server, bridge);
  return server;
}
