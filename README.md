# DevSync AI

Collaboration and coordination platform for developers and their AI coding agents (Claude Code):
shared context, agent registry, agent-to-agent requests and deliverables, knowledge engine,
Git intelligence and real-time notifications.

> Status: **Phase 0 — architecture & initialization.** See [docs/architecture](docs/architecture/overview.md).

## Quick start

```bash
pnpm install
cp .env.example .env           # then set AUTH_SECRET / REALTIME_JWT_SECRET
pnpm infra:up                  # PostgreSQL (pgvector), Redis, MinIO, Mailpit
pnpm db:migrate                # apply Prisma migrations
pnpm --filter @devsync/database db:test:prepare
pnpm typecheck && pnpm test
```
