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

## Phase 1 — Application foundation

- Sign-up / sign-in / sign-out / password reset (email via Mailpit) with Better Auth
- Teams CRUD, members, roles (Owner/Admin/Developer/Viewer), invitations (send, accept, revoke, expire)
- Projects CRUD, project members, repositories
- Permission matrix in `server/domain` with exhaustive unit tests; multi-tenant integration tests
  (user of team A gets 404 on every team B resource)
- App shell (sidebar, team switcher) and initial dashboard with real counts from PostgreSQL
- **Accept:** two users in two teams cannot see each other's data through UI or API; invitation round-trip works.

## Phase 2 — Agent registry & realtime

- Device pairing (`devsync login` → browser approval → device token), revocation
- Agents, sessions, heartbeats, presence in Redis, status transitions
- Outbox → gateway fan-out, acks, `session:resume` replay, Redis adapter
- Bridge daemon: connection, reconnect with backoff, persistent queue, idempotent delivery, OS notifications + sound
- `devsync status`, `devsync inbox` (read-only) in the terminal
- **Accept:** kill the network for 2 min while emitting events → all delivered once after reconnect; Live Agents page updates < 1 s.

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
