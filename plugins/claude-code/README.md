# DevSync — Claude Code plugin

Connects Claude Code to your DevSync AI team through the local **DevSync Bridge** (`devsync start`).

## Install

```text
/plugin marketplace add RICKOLLAS12/devsync-ai
/plugin install dev@devsync-ai
```

Prerequisites: Node.js ≥ 20, the Bridge paired with `devsync login` and running (`devsync start`).

### Upgrading from 0.1.x

Since 0.2.0 the plugin is named `dev` (commands `/dev:share`, `/dev:inbox`…) instead of `devsync`. Replace
the old one once, from a terminal:

```text
claude plugin uninstall devsync@devsync-ai
claude plugin marketplace update devsync-ai
claude plugin install dev@devsync-ai
```

Permission rules naming `mcp__plugin_devsync_devsync__*` tools must be renamed to `mcp__plugin_dev_devsync__*`.

## What it adds

| Part                 | Content                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP server `devsync` | `team_get_context`, `team_search_agents`, `team_get_activity`, `team_find_expert`, `team_get_inbox`, `team_claim_resource`, `team_release_resource`, `team_set_status`                                                                                                                                                                                                                                    |
| Hooks                | `SessionStart` registers the session and injects the team context, plus two standing rules: check the team (knowledge, experts) before a significant task, and offer to save a significant result; `UserPromptSubmit`/`Notification`/`Stop` publish the state (working/waiting/idle); `PostToolUse` on edit tools publishes the repository-relative path of edited files; `SessionEnd` closes the session |
| Commands             | `/dev:inbox`, `/dev:status`, `/dev:team-context`, `/dev:share`, `/dev:keep` (Claude also offers the last two on its own and runs them once the developer agrees)                                                                                                                                                                                                                                          |
| Skill                | `team-first`: check context, experts and claims before working alone                                                                                                                                                                                                                                                                                                                                      |

## Expertise

`team_find_expert` ranks teammates by declared expertise first. Each developer declares theirs in the web app,
**Settings → My expertise** (per team, applies to all their machines), with the words teammates would use
(`payments, stripe, frontend`).

## Privacy

Hooks send only technical facts to the Bridge on your machine: session id, working directory, Git
branch/remote, declared state and **paths** of edited files. Prompts, file contents, shell commands and
model reasoning are never sent. All tool calls are authorized server-side with the machine's device token,
which stays inside the Bridge (the MCP server reaches it through a user-only local socket).

## Development

The `dist/` bundles are built from `apps/mcp-server` (`pnpm --filter @devsync/mcp-server build`) and committed
so that installing the plugin requires no build. CI checks they are up to date.
