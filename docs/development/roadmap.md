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

## Phase 3 — Claude Code plugin & MCP ✅

- [x] Plugin (manifest, `.mcp.json`, hooks, skills/commands) + repository marketplace; `claude plugin validate` passes
- [x] MCP server (stdio): `team_get_context`, `team_search_agents`, `team_get_activity`, `team_find_expert`, `team_get_inbox`, `team_claim_resource`, `team_release_resource`, `team_set_status`
- [x] Hooks: session registration + team context injection at start, declared state, edited file paths, session end — privacy-preserving
- [x] Server: team context, agent search, activity feed, explainable expert finding, advisory resource claims (race-safe)
- [x] Bridge: allow-listed API proxy over IPC (device token never leaves the daemon), API errors forwarded with status/details
- [x] Verified in a real Claude Code session: the agent discovered a teammate's claim and expertise and proposed to coordinate
- **Planned with their modules:** `team_ask_agent`, `team_broadcast`, `team_suggest_collaboration`, `team_create_request`, `team_update_request`, `team_get_dependencies`, `team_submit_deliverable`, `team_publish_deliverable`, `team_request_clarification` (Phase 4), `team_search_knowledge`, `team_publish_knowledge` (Phase 5).

## Phase 4 — Collaboration ✅

- [x] Requests: 5 types, 8 statuses, state machine (creator / assignee / manager), immutable history, comments, attachments (pre-signed upload, MIME + 25 MB limits, no SVG/HTML)
- [x] Tasks created on acceptance; dependencies between tasks resolved when the blocking task is done (dependent assignee notified)
- [x] Deliverables on object storage: inline text, uploaded files (size verified before publish), Git refs, PR links; immutable versions; publish → request DELIVERED
- [x] Autonomy levels 1–3: approval flow, rate per agent/hour, max priority, allowed agents, chain depth, loop (A→B→A) refusal, duplicate detection (24 h fingerprint); agent requests audited
- [x] Notifications: persistent, deduplicated, per-event preferences (in-app / desktop / sound), realtime badge, Bridge desktop notification + sound
- [x] MCP: `team_create_request`, `team_suggest_collaboration`, `team_ask_agent`, `team_get_request`, `team_update_request`, `team_request_clarification`, `team_submit_deliverable`, `team_publish_deliverable`, `team_read_deliverable`, `team_get_dependencies`, `team_broadcast`
- [x] CLI: `devsync inbox` (with deliverables received), `devsync request show|accept|reject|start|complete|cancel|approve|comment|clarify|answer`
- [x] UI: Collaboration Center, request page (conversation, deliverables, history, actions), notifications, autonomy and notification settings
- [x] Session continuity: agents stay IDLE 60 s between conversations; "Resume your work" section at session start
- [x] **Acceptance verified with two real Claude Code sessions on two Bridges:** Bob's agent found Alice as payments expert and sent a DEPENDENCY request; Alice's Bridge showed a desktop notification with sound; Alice's agent accepted, wrote the OpenAPI file, uploaded it to MinIO and published it; Bob's Bridge played the "deliverable ready" sound; in a new conversation Bob's agent read the contract and summarized what the checkout form needs.

## Phase 5 — Knowledge engine ✅

- [x] Knowledge items with immutable versions, kinds, tags, references (files, commits, URLs, deliverables, requests), validity (draft/valid/outdated/deprecated)
- [x] Visibility: **PRIVATE** (only the author and their future sessions) or **PROJECT**; nothing is ever shared without an explicit choice; share/unshare later
- [x] Hybrid search: weighted PostgreSQL full-text (`simple` config, FR/EN), trigram titles, pgvector semantic (multilingual-e5-small, local, no third-party API); each result says why it matched
- [x] Embeddings computed by the worker's `embeddings` role (BullMQ); search falls back to full-text when it is not running; Linux container for platforms without an ONNX binary (`pnpm dev:embedder`)
- [x] Reader tracking: agents reading an item are warned when a new version is published or it becomes outdated/deprecated
- [x] Promote a published text deliverable (e.g. an OpenAPI contract) to shared knowledge
- [x] Agents: recent knowledge in the session-start context; `team_search_knowledge`, `team_get_knowledge`, `team_publish_knowledge`, `team_list_my_knowledge`, `team_set_knowledge_visibility`, `team_set_knowledge_validity`, `team_promote_deliverable`; `/devsync:share`, `/devsync:keep`
- [x] Knowledge Center UI: search, mine/private filters, versions, share and validity controls
- [x] **Acceptance verified with real Claude Code sessions:** Alice's agent shared a decision and kept a refunds brainstorm private; Bob, asking in French without any shared keyword, got the English decision by meaning and never saw the private brainstorm; Alice found her private note with a French query.

## Phase 6 — Git intelligence ✅

- [x] Bridge Git watcher: read-only snapshots of session worktrees every 20 s (branch, HEAD, last commit, staged/modified/untracked/unmerged files, ahead/behind, linked worktrees) — paths and line numbers only, never contents
- [x] Changed lines expressed in merge-base coordinates (committed + uncommitted), so different branches are comparable
- [x] Overlap detection: FILE_OVERLAP, LINE_OVERLAP (adjacent lines count, like git), POTENTIAL_CONFLICT (Bridge runs `git merge-tree --write-tree` in memory against the other branch when available), CONFIRMED_CONFLICT (unmerged paths during a merge)
- [x] Both developers notified once per severity; dismiss/acknowledge/resolve; alerts close themselves when the overlap disappears
- [x] Real-time warning inside Claude Code: the PostToolUse hook returns the overlap to the agent right after an edit (once per conflict and session)
- [x] Agents: `team_check_overlap` before editing, open overlaps in the session-start context
- [x] UI: Git intelligence page (repositories, worktrees per agent, alerts), Git alerts on the dashboard
- [x] **Acceptance verified:** Alice's agent on `feat/idempotency` changed lines 11 and 13; a real Claude Code session for Bob on `feat/refund` edited line 13 and was told immediately that Alice changes the same lines; both Bridges showed a desktop notification; the alert appeared in the UI.
- **Provider integrations (design, not implemented):** GitHub/GitLab/Bitbucket webhooks for pushes and PRs would let the server run merge-tree checks centrally and link PRs to requests; DevSync stays read-only on repositories.

## Phase 7 — Production readiness

- Rate limiting, security headers/CSP, webhook signatures, secret rotation, backups
- OpenTelemetry traces + metrics, dashboards; Dockerfiles; CI/CD to VPS/Kubernetes; load tests
- **Accept:** security review checklist passed; deploy guide reproduced on a clean VPS.
