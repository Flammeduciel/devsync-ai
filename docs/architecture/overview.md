# Architecture overview

DevSync AI connects developers **and** their Claude Code agents so they reuse each other's
context, knowledge and deliverables instead of solving the same problem twice.

## Components

```text
 Developer machine (× N)                                  DevSync cloud
┌──────────────────────────────────────┐        ┌───────────────────────────────────────────┐
│ Claude Code session(s)               │        │  apps/web  (Next.js 16)                   │
│  ├─ plugin hooks ──────┐             │        │   ├─ UI (RSC + client islands)            │
│  └─ MCP server (stdio) ┤ local IPC   │  HTTPS │   ├─ /api/v1/* Route Handlers ─┐          │
│                        ▼             │ ─────► │   └─ Server Actions            │          │
│  apps/bridge (daemon + `devsync` CLI)│        │        server/services ◄───────┘          │
│   ├─ offline queue (SQLite file)     │        │        server/domain · repositories       │
│   ├─ git watcher (repos/worktrees)   │        │               │            │              │
│   ├─ OS notifications + sounds       │   WSS  │      PostgreSQL ◄──┐   BullMQ jobs        │
│   └─ Socket.IO client ───────────────┼──────► │  apps/realtime (Socket.IO gateway)        │
└──────────────────────────────────────┘        │   presence · fan-out · replay  ◄── Redis  │
                                                │  MinIO / S3: attachments & deliverables   │
 Browser dashboard ── HTTPS + WSS ─────────────►└───────────────────────────────────────────┘
```

| Unit                  | Runtime                       | Owns                                                                                                                            |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`            | Next.js (Node)                | UI, REST API, auth, **all business rules** (services/domain), writes to PostgreSQL, enqueues jobs, appends events to the outbox |
| `apps/realtime`       | Node + Socket.IO              | Authenticated sockets, rooms, presence (Redis), fan-out of persisted events, replay by sequence, acks                           |
| `apps/bridge`         | Node daemon on dev machine    | Device identity, local session multiplexing, offline queue, Git watching, OS notifications, `devsync` CLI                       |
| `apps/mcp-server`     | stdio, spawned by Claude Code | `team_*` tools; translates tool calls into Bridge/API calls                                                                     |
| `plugins/claude-code` | Claude Code plugin            | Hooks, skills, commands, MCP registration                                                                                       |
| `packages/*`          | libraries                     | Contracts shared by all of the above (see below)                                                                                |

## Shared packages

| Package                  | Content                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `@devsync/config`        | tsconfig presets, Zod env loader, structured logger (pino, secret redaction) |
| `@devsync/shared`        | `AppError` + codes, `Result`, UUIDv7 ids                                     |
| `@devsync/validation`    | Zod primitives and enums mirrored from the Prisma schema                     |
| `@devsync/protocol`      | Wire envelope, ack, handshake, rooms, protocol/API versions                  |
| `@devsync/event-schemas` | Catalog `event type → payload schema` + `parseEvent`                         |
| `@devsync/database`      | Prisma schema, migrations, client factory (driver adapter `pg`)              |
| `@devsync/sdk`           | Typed REST client used by the Bridge and the MCP server                      |

Packages ship TypeScript sources (no build step). Next.js transpiles them; Node services bundle them with tsup.

## Layering inside `apps/web`

```text
app/ (routes, pages, Route Handlers, Server Actions)   ← transport only: parse, authenticate, call a service
  └─ server/services   use cases, transactions, authorization checks, event emission
       ├─ server/domain        pure rules (state machines, permission matrix, autonomy limits)
       ├─ server/repositories  Prisma queries, always scoped by teamId
       └─ server/infrastructure db, redis, S3, mail, queues, logger
features/<module>/   client components + TanStack Query hooks per module
components/ui        shadcn/ui primitives
```

Rule: React components and Route Handlers never contain business rules; services never import `next/*`.

## Key flows

**Event delivery (at-least-once, idempotent).** A service commits the business change **and**
an `events` row in the same transaction (outbox). A BullMQ job (or `LISTEN/NOTIFY`) hands it to the
realtime gateway, which emits to the authorized rooms. Each event carries a producer-generated `id`
(idempotency) and a server `sequence`; clients store the last sequence and call `session:resume`
after reconnecting to receive what they missed.

**Agent → agent request.** MCP `team_create_request` → Bridge → `POST /api/v1/collaboration` →
service checks membership, project access, autonomy policy (rate, priority, chain depth, fingerprint
dedupe, allowed agents) → creates request + history + notification + event → assignee's Bridge plays
the sound / OS notification → the assignee's agent sees it on next `SessionStart` or `team_get_inbox`,
and the developer can see it from the terminal (`devsync inbox`) or the dashboard.

**Deliverable.** Upload via pre-signed S3 URL (size/type validated first) → `DeliverableVersion`
(immutable) → request moves to `DELIVERED` → `collaboration.deliverable.ready` to the requester.

**Git overlap.** Bridge sends `GitActivity` snapshots (files + changed hunks vs merge-base) → a job
compares the latest snapshots of other agents on the same repository → `FILE_OVERLAP` /
`LINE_OVERLAP` / `POTENTIAL_CONFLICT` (via `git merge-tree` on the Bridge) → `git.conflict.detected`.
Nothing is ever pushed or merged automatically.

See also: [boundaries](boundaries.md), [decisions](decisions.md), [database](../database/schema.md),
[protocol](../protocol/events.md), [MCP tools](../protocol/mcp-tools.md), [roadmap](../development/roadmap.md).
