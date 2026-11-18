# Roadmap and acceptance criteria

A phase is done only when `pnpm typecheck && pnpm test` pass and its criteria below are demonstrated.

## Phase 0 — Architecture & initialization ✅

- [x] pnpm + Turborepo monorepo, strict TS presets, Prettier
- [x] Docker Compose: PostgreSQL 17 + pgvector, Redis, MinIO, Mailpit — all healthy
- [x] Zod-validated env per service, structured logger with redaction
- [x] Contracts: envelope/ack/handshake, event catalog (13 types), error codes, UUIDv7
- [x] Full Prisma schema (36 tables) + init migration with SQL constraints; DB constraint tests
- [x] `GET /api/v1/health` checks DB, Redis, S3 (creates the versioned bucket)
- [x] Realtime gateway skeleton: handshake validation, refuses unauthenticated sockets
- [x] Architecture, boundaries, ADRs, database, protocol, MCP, REST docs; CI workflow

## Phase 1 — Application foundation ✅

- [x] Sign-up / sign-in / sign-out / password reset (Better Auth, emails through Mailpit), old sessions revoked on reset
- [x] Rate limits on auth endpoints (Redis), CSRF: Better Auth origin check + Origin check on our mutations
- [x] Teams CRUD (soft delete), members, roles (Owner/Admin/Developer/Viewer), last-owner protection (serializable tx)
- [x] Invitations: hashed tokens, 7-day expiry, re-invite replaces, revoke, accept only by the invited email
- [x] Projects CRUD, project members (maintainer/contributor/viewer), repositories with remote URL normalization
- [x] Permission matrix and project access in `server/domain` (unit tests); audit log on every mutation
- [x] Multi-tenant integration tests: every team B resource answers NOT_FOUND to team A users
- [x] REST endpoints + Server Actions over the same services; app shell, team switcher, dashboard with real counts
- [x] Verified end to end in a browser (sign-up → team → project → repo → invite → accept as second user), desktop and mobile
- **Not in Phase 1:** email verification (Better Auth supports it; enable with the production mailer), OAuth providers.

## Phase 2 — Agent registry & realtime ✅

- [x] Device pairing (`devsync login` → `/device` approval → one-time device token, hash only), revocation
- [x] Agents, machines, sessions, activities; status aggregated from session heartbeats and explicit declarations
- [x] Transactional outbox (`events`) → Redis pub/sub → gateway fan-out (team / member rooms, audience filtering)
- [x] Replay by sequence on reconnect and `session:resume`; client dedupe by id; acks
- [x] Gateway: device-token and dashboard-JWT auth, Bridge presence in Redis, Redis adapter, revoked machines disconnected
- [x] BullMQ worker closing sessions without heartbeat for 90 s
- [x] Bridge: daemon, CLI (`login`, `status`, `inbox`, `start`, `stop`), persistent outbox, reconnection, desktop notifications + sound, owner-only IPC
- [x] Live agents page updated in real time; machines with presence and revoke
- [x] Verified end to end: pairing in the browser, live status in the UI, gateway outage → replay, API outage → outbox replay, revocation → disconnection
- **Not in Phase 2:** client-published events over the socket (`event:publish`) — Bridges use REST, which is authenticated and idempotent; a self-service `devsync logout` revocation endpoint; launchd/systemd service files.

## Phase 3 — Claude Code plugin & MCP

- Plugin with `.mcp.json`, hooks (SessionStart/End, Pre/PostToolUse, Stop), skills, `/devsync:*` commands
- MCP server: context, search agents/knowledge, activity, inbox tools
- **Accept:** a new Claude Code session prints the team context and pending requests; tool calls are authorized and audited.

## Phase 4 — Collaboration

- Requests (5 types, 8 statuses, state machine), history, comments, attachments (size/MIME limits)
- Tasks, dependencies; deliverables with versions on S3; notifications (dedupe, preferences, sound)
- Autonomy levels 1–3 with limits (rate, priority, allowed agents, chain depth, fingerprint), approval flow, audit
- Collaboration Center UI; `devsync request accept|reject|comment` in the terminal
- **Accept:** the frontend → backend "payment API contract" scenario runs end to end across two machines.

## Phase 5 — Knowledge engine

- Publish/version/tag knowledge, FTS + trigram search, then pgvector embeddings (hybrid ranking)
- **Accept:** `team_search_knowledge` finds a published contract by paraphrase.

## Phase 6 — Git intelligence

- Bridge watcher (branch, HEAD, status, worktrees, hunks vs merge-base), snapshots throttled
- Overlap engine: file, line, potential (`git merge-tree`), confirmed; Git Intelligence UI
- GitHub/GitLab/Bitbucket integration design (webhooks, PR links) — read-only
- **Accept:** two agents editing `payment.service.ts` on different machines trigger a conflict alert to both.

## Phase 7 — Production readiness

- Rate limiting, security headers/CSP, webhook signatures, secret rotation, backups
- OpenTelemetry traces + metrics, dashboards; Dockerfiles; CI/CD to VPS/Kubernetes; load tests
- **Accept:** security review checklist passed; deploy guide reproduced on a clean VPS.
