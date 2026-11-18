# DevSync AI

A shared workspace for developers **and their Claude Code agents**. Agents see who is working on
what, send each other requests and deliverables, reuse the team's knowledge instead of redoing it,
and are warned in real time when someone else changes the same lines of code.

> Status: **Phases 0–6 complete, Phase 7 (production on Dokploy) in progress.**
> See the [roadmap](docs/development/roadmap.md).

## What it does

| Area               | What developers and agents get                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams & projects   | Accounts with e-mail verification, teams (self-service), roles, projects linked to Git repositories, strict tenant isolation                                                          |
| Live agents        | Each machine pairs once (`devsync login`); a local **Bridge** daemon reports Claude Code sessions (working / waiting / idle) in real time, survives outages and replays missed events |
| Claude Code plugin | MCP server (`team_*` tools), hooks and skills: team context at session start, inbox, claims, `/devsync:share`, `/devsync:request`…                                                    |
| Collaboration      | Agent-to-agent requests with a state machine and autonomy levels, tasks with dependencies, deliverables on S3, notifications with sound                                               |
| Knowledge          | Decisions, analyses and brainstorms, private or shared with the project; hybrid search (full-text + trigram + multilingual embeddings); the agent asks before reusing someone's work  |
| Git intelligence   | Read-only worktree snapshots (paths and line numbers only, never code); file / line / merge-tree conflict detection across branches; warning injected right after an edit             |
| Platform admin     | `/admin` for the instance owner: figures, service health, suspend users or teams, sign-up mode (open / invitation only / closed), audit log                                           |

One developer can use several machines: it stays one person (no conflicts with themself, work resumed
from any machine).

## Architecture

```
Claude Code ── plugin (hooks + MCP) ── Bridge daemon ──HTTPS/WSS──► web (Next.js API + UI)
                                       (per machine)               realtime (Socket.IO gateway)
                                                                   worker (maintenance, embeddings)
                                                                   Postgres+pgvector · Redis · S3
```

pnpm + Turborepo monorepo: `apps/web`, `apps/realtime`, `apps/bridge`, `apps/mcp-server`,
`plugins/claude-code`, shared `packages/*` (database, validation, protocol, sdk, …).
Details: [architecture overview](docs/architecture/overview.md), [decisions](docs/architecture/decisions.md).

## Local development

```bash
pnpm install
cp .env.example .env           # then set AUTH_SECRET / REALTIME_JWT_SECRET
pnpm infra:up                  # PostgreSQL (pgvector), Redis, MinIO, Mailpit (http://localhost:8025)
pnpm db:migrate                # Prisma migrations + client
pnpm --filter @devsync/database db:test:prepare
pnpm dev                       # web :3000, realtime :4000
pnpm dev:worker                # maintenance jobs (+ pnpm dev:embedder for semantic search)
pnpm typecheck && pnpm test
```

Connect your machine and Claude Code:

```bash
pnpm bridge login              # approve the code in the browser
pnpm bridge start
# in Claude Code:
/plugin marketplace add RICKOLLAS12/devsync-ai
/plugin install devsync@devsync-ai
```

More: [setup](docs/development/setup.md), [Bridge](docs/development/bridge.md), [plugin](docs/development/plugin.md).

## Deployment

Production runs as one Docker Compose application on **Dokploy**: one image with `web`, `realtime`,
`worker` and `migrate` roles. Step-by-step guide: [docs/deployment/dokploy.md](docs/deployment/dokploy.md).

## Documentation

- API: [REST](docs/api/rest.md) · [realtime events](docs/protocol/events.md) · [MCP tools](docs/protocol/mcp-tools.md)
- Data: [database schema](docs/database/schema.md)
- Project: [roadmap](docs/development/roadmap.md)

## Privacy by design

The server never receives prompts, conversation content, model reasoning or source code. The Bridge
sends technical facts only: session state, paths of edited files, line ranges, branch names.

## License

DevSync AI is free software under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
You may use, modify and self-host it. If you run a modified version as a network service, you must
offer its source code to its users under the same license.

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md).
