# Claude Code plugin — development guide

```text
plugins/claude-code/            what users install (marketplace: .claude-plugin/marketplace.json at repo root)
├── .claude-plugin/plugin.json
├── .mcp.json                   stdio MCP server: node dist/mcp.mjs
├── hooks/hooks.json            node dist/hook.mjs <Event>
├── skills/                     /devsync:inbox, /devsync:status, /devsync:team-context, team-first (model-invoked)
└── dist/                       built bundles, committed (CI fails if stale)

apps/mcp-server/                sources of dist/
├── src/main.ts                 MCP entry (stdio)
├── src/tools/register.ts       team_* tools
├── src/hook.ts                 hook handler
├── src/bridge.ts               IPC client → local Bridge daemon
└── src/format.ts               compact markdown for the model
```

## Flow

```text
Claude Code ──stdio──► dist/mcp.mjs ──unix socket (0600)──► Bridge daemon ──HTTPS + device token──► /api/v1
Claude Code ──hook───► dist/hook.mjs ─┘
```

The MCP server and the hooks never hold credentials: the daemon proxies an allow-list of API operations
(`api.call`) and adds the repository's Git remote so the server resolves the project.

## Build, test, try

```bash
pnpm --filter @devsync/mcp-server test
pnpm --filter @devsync/mcp-server build          # writes plugins/claude-code/dist
claude plugin validate plugins/claude-code
claude plugin validate .                          # marketplace
claude --plugin-dir plugins/claude-code plugin details devsync

# end to end (services running, Bridge paired and started)
cd /path/to/a/repo/linked/to/a/project
claude --plugin-dir ~/devsync-ai/plugins/claude-code
```

`DEVSYNC_HOME` selects which Bridge the plugin talks to (useful to simulate several developers on one machine).

## Hooks

| Event                                                | Sends to the Bridge                               | Output                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SessionStart`                                       | `session.start` (session id, cwd, plugin version) | `additionalContext`: team context (≤ 6000 chars) or a one-line "Bridge not running" note |
| `UserPromptSubmit`                                   | `session.update` status `WORKING`                 | –                                                                                        |
| `PostToolUse` (Edit, MultiEdit, Write, NotebookEdit) | `activity.publish` "Edited <repo-relative path>"  | –                                                                                        |
| `Notification`                                       | status `WAITING`                                  | –                                                                                        |
| `Stop`                                               | status `IDLE`                                     | –                                                                                        |
| `SessionEnd`                                         | `session.end`                                     | –                                                                                        |

Rules: 2 s IPC timeout, always exit 0, never print anything except the SessionStart JSON, never send prompts,
file contents, shell commands, paths outside the project or reasoning. Unknown sessions (daemon restarted)
are re-registered transparently.

## Verified behaviour (Phase 3 acceptance)

With Alice's agent working on the Checkout project and holding a claim on `src/payment.service.ts`, a headless
Claude Code session for Bob in a clone of the same repository, asked to add a refund function, called
`team_get_context` and `team_find_expert` on its own, reported Alice's claim and expertise, and recommended
coordinating with her before editing. Bob's session was registered on the right project from the Git remote
and closed by the `SessionEnd` hook.
