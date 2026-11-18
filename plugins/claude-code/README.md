# DevSync — Claude Code plugin

**Phase 3** (manifest only for now). The plugin will bundle:

| Part | Purpose |
| --- | --- |
| `.mcp.json` | Starts `@devsync/mcp-server` (stdio) exposing the `team_*` tools |
| `hooks/` | `SessionStart` (register session, inject pending inbox + team context), `PreToolUse`/`PostToolUse` (activity, edited files), `Stop`/`SessionEnd` (status) — hooks see tool calls, never the model's internal reasoning |
| `skills/` | "check the team before solving alone", "publish a reusable summary", "deliver a request" |
| `agents/` | Optional coordinator subagent for autonomy level 3 |
| `commands` | `/devsync:inbox`, `/devsync:request`, `/devsync:status` — read and act on requests from the terminal |

All hooks talk to the local Bridge, never directly to the cloud, so they keep working offline (queued).
