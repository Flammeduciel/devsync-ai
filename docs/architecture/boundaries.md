# Service boundaries

## apps/web — the only writer of business data

- Owns authentication (sessions, password reset), teams, projects, requests, knowledge, deliverables, notifications.
- Every mutation goes through a service that: authenticates the actor, loads the actor's membership for
  the **team derived from the resource** (never from a client-supplied `teamId` alone), checks the
  permission, runs inside a transaction, writes `audit_logs` when sensitive, appends to `events`.
- Issues short-lived **realtime tokens** (JWT HS256, 5 min) for dashboard sockets, and **device tokens**
  (opaque, hashed in `agent_machines`) for Bridges.
- Never holds socket connections.

## apps/realtime — transport, not logic

- Verifies tokens, joins rooms decided server-side (`team:`, `project:`, `user:`, `agent:`).
- Keeps presence in Redis (`presence:agent:<id>` with TTL refreshed by heartbeats).
- Receives client-published events (`event:publish`), validates them with `@devsync/event-schemas`,
  and forwards **commands** to the web API; it does not write business tables itself, except
  presence-derived agent status through the same service code path (shared package, Phase 2).
- Fans out persisted events, replays by sequence on `session:resume`, acks every message.
- Horizontal scaling: Socket.IO Redis adapter.

## apps/bridge — the machine's single point of contact

- One daemon per machine, many Claude Code sessions. Exposes a local IPC endpoint
  (Unix socket / named pipe, user-only permissions) to the MCP server and to plugin hooks.
- Persists outgoing events in a local queue until acked; replays after reconnect; dedupes incoming by id.
- Watches Git repositories registered for the user's projects; computes changed hunks locally; sends
  snapshots — never source code contents unless explicitly published as a deliverable.
- Shows OS notifications and plays sounds according to `notification_preferences`.
- Provides the `devsync` CLI: `login`, `status`, `inbox`, `request show|accept|reject|comment`, `logout`.
- Cannot wake a closed Claude Code session: pending items are fetched on the next `SessionStart`.

## apps/mcp-server — tools for the agent

- Spawned per Claude Code session by the plugin (stdio). Stateless.
- Resolves identity through the Bridge (device + agent + session), calls the API with `@devsync/sdk`.
- Validates tool inputs with Zod; the API re-validates and authorizes everything.
- Returns concise, structured results sized for an LLM context.

## What is _not_ a separate service

Jobs (BullMQ workers) run in a worker entry of `apps/web`'s server code at first (same services,
same repositories); they are split only if load requires it. No microservice per module.
