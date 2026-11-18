# @devsync/mcp-server

stdio MCP server launched by the Claude Code plugin. **Phase 3** (not implemented yet).

It talks to the local Bridge (identity, offline queue) and to the REST API through `@devsync/sdk`.
Every tool call is authorized server-side; the MCP server never trusts team/project ids on its own.
Tool contracts: [`docs/protocol/mcp-tools.md`](../../docs/protocol/mcp-tools.md).
