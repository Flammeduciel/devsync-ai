/** Every MCP tool the server will expose (Phase 3). Contracts: docs/protocol/mcp-tools.md. */
export const TEAM_TOOLS = [
  'team_get_context',
  'team_search_agents',
  'team_search_knowledge',
  'team_get_activity',
  'team_ask_agent',
  'team_broadcast',
  'team_find_expert',
  'team_suggest_collaboration',
  'team_create_request',
  'team_get_inbox',
  'team_update_request',
  'team_get_dependencies',
  'team_publish_knowledge',
  'team_submit_deliverable',
  'team_publish_deliverable',
  'team_request_clarification',
  'team_claim_resource',
  'team_release_resource',
] as const;

export type TeamToolName = (typeof TEAM_TOOLS)[number];
