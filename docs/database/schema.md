# Database schema

Source: [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma) ·
Migrations: `packages/database/prisma/migrations` · 36 tables.

## Structuring decisions

1. **Tenant = Team.** Every tenant-owned row has `teamId` (indexed). Project-scoped rows reference
   their project through `(projectId, teamId) → projects(id, teamId)`, so a row can never point to a
   project of another team, even through a bug. Same pattern for agents, sessions, tasks, requests,
   knowledge and deliverables (`@@unique([id, teamId])` on each target).
   Optional relations with `ON DELETE SET NULL` use a single-column FK (a composite one would also
   null `teamId`); their tenant consistency is checked by services.
2. **Soft delete** (`deletedAt`) on users, teams, projects, repositories, requests, comments,
   deliverables, knowledge, attachments. Histories and versions are immutable and never deleted
   independently.
3. **Versions are rows** (`deliverable_versions`, `knowledge_versions`) with `@@unique([parent, version])`
   and `CHECK (version >= 1)`; the parent keeps `currentVersion` for fast reads.
4. **Outbox** `events(sequence bigserial, id uuid unique)` drives realtime fan-out and replay.
5. **Hashes, not secrets**: invitation tokens, device tokens and API keys are stored as SHA-256 hashes;
   webhook signing secrets are encrypted (AES-256-GCM).
6. **Auth tables** (`users`, `sessions`, `accounts`, `verifications`) follow the Better Auth shape; the
   password hash lives in `accounts.password`.

## Constraints added in SQL (not expressible in Prisma)

| Constraint                                                                                                    | Purpose                                |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `autonomy_policies_team_default_key` partial unique `(teamId) WHERE projectId IS NULL`                        | One team-default autonomy policy       |
| `resource_claims_active_key` partial unique `(projectId, resourceType, resourceKey) WHERE releasedAt IS NULL` | One active claim per resource          |
| `git_conflicts_distinct_agents_check` `agentAId < agentBId`                                                   | Canonical pair order, no self-conflict |
| `dependencies_not_self_check`                                                                                 | A task cannot block itself             |
| `request_comments_author_check`, `collaboration_requests_origin_check`                                        | Actor columns match actor type         |
| `users_email_lower_key`                                                                                       | Case-insensitive unique email          |
| extensions `vector`, `pg_trgm`                                                                                | Semantic and fuzzy search (Phase 5)    |

These are covered by `packages/database/tests/tenant-isolation.test.ts`.

## Entities by module

| Module         | Tables                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth           | `users`, `sessions`, `accounts`, `verifications`, `api_keys`                                                                                                             |
| Teams          | `teams`, `team_members`, `team_invitations`                                                                                                                              |
| Projects       | `projects`, `project_members`, `repositories`                                                                                                                            |
| Agent registry | `agent_machines` (device token, revocation), `agents`, `agent_sessions`, `agent_activities`                                                                              |
| Autonomy       | `autonomy_policies` (team default + per-project override)                                                                                                                |
| Collaboration  | `collaboration_requests`, `request_history`, `request_comments`, `agent_tasks`, `dependencies`, `deliverables`, `deliverable_versions`, `attachments`, `resource_claims` |
| Knowledge      | `knowledge`, `knowledge_versions`, `knowledge_tags`                                                                                                                      |
| Git            | `git_activities` (snapshots), `git_conflicts` (pairwise)                                                                                                                 |
| Notifications  | `notifications` (dedupe key), `notification_preferences` (in-app/desktop/sound/email)                                                                                    |
| Platform       | `events` (outbox), `audit_logs`, `webhook_endpoints`                                                                                                                     |

Tables beyond the initial list, and why: `request_history` (required "Historique"), `autonomy_policies`
(section 6 limits), `resource_claims` (`team_claim_resource`), `events` (reconnection replay).
No `Tag` table: tags are normalized strings scoped by team.

## Main access paths and their indexes

| Query                         | Index                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Inbox of a user / agent       | `collaboration_requests (assigneeUserId, status)`, `(assigneeAgentId, status)` |
| Project board                 | `collaboration_requests (teamId, projectId, status)`                           |
| Repetitive request detection  | `collaboration_requests (teamId, fingerprint, createdAt desc)`                 |
| Live agents                   | `agents (teamId, status)`                                                      |
| Activity feed                 | `agent_activities (teamId, occurredAt desc)`                                   |
| Latest Git state per worktree | `git_activities (repositoryId, machineId, worktreePath, capturedAt desc)`      |
| Unread notifications          | `notifications (userId, readAt, createdAt desc)`                               |
| Replay                        | `events (teamId, sequence)`                                                    |
