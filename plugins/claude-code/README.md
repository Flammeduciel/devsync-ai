# DevSync — Claude Code plugin

Connects Claude Code to your DevSync AI team through the local **DevSync Bridge** (`devsync start`).

## Install

```text
/plugin marketplace add RICKOLLAS12/devsync-ai
/plugin install devsync@devsync-ai
```

Prerequisites: Node.js ≥ 20, the Bridge paired with `devsync login` and running (`devsync start`).

## What it adds

| Part                 | Content                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP server `devsync` | `team_get_context`, `team_search_agents`, `team_get_activity`, `team_find_expert`, `team_get_inbox`, `team_claim_resource`, `team_release_resource`, `team_set_status`                                                                                                    |
| Hooks                | `SessionStart` registers the session and injects the team context; `UserPromptSubmit`/`Notification`/`Stop` publish the state (working/waiting/idle); `PostToolUse` on edit tools publishes the repository-relative path of edited files; `SessionEnd` closes the session |
| Commands             | `/devsync:inbox`, `/devsync:status`, `/devsync:team-context`                                                                                                                                                                                                              |
| Skill                | `team-first`: check context, experts and claims before working alone                                                                                                                                                                                                      |

## Privacy

Hooks send only technical facts to the Bridge on your machine: session id, working directory, Git
branch/remote, declared state and **paths** of edited files. Prompts, file contents, shell commands and
model reasoning are never sent. All tool calls are authorized server-side with the machine's device token,
which stays inside the Bridge (the MCP server reaches it through a user-only local socket).

## Development

The `dist/` bundles are built from `apps/mcp-server` (`pnpm --filter @devsync/mcp-server build`) and committed
so that installing the plugin requires no build. CI checks they are up to date.
