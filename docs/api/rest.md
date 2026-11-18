# REST API v1

Base path `/api/v1`. JSON only. Auth: session cookie (dashboard) or `Authorization: Bearer <api key | device token>`.
Errors: `{ "error": { "code", "message", "details?" } }` with codes from `@devsync/shared` (`BAD_REQUEST` 400,
`UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413,
`UNSUPPORTED_MEDIA_TYPE` 415, `VALIDATION_FAILED` 422, `RATE_LIMITED` 429, `INTERNAL` 500).
Lists are cursor-paginated: `?cursor=&limit=` → `{ items, nextCursor }`.

| Resource      | Endpoints                                                                                                                                                                                                                         | Phase    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| health        | `GET /health` → `{ status, checks[] }` (200 / 503)                                                                                                                                                                                | **0 ✅** |
| auth          | `POST /auth/*` (Better Auth handler: sign-up, sign-in, sign-out, reset)                                                                                                                                                           | **1 ✅** |
| teams         | `GET/POST /teams`, `GET/PATCH/DELETE /teams/:id`, `GET/POST /teams/:id/members`, `PATCH/DELETE /teams/:id/members/:userId`, `GET/POST /teams/:id/invitations`, `DELETE /teams/:id/invitations/:invId`, `POST /invitations/accept` | **1 ✅** |
| projects      | `GET/POST /teams/:id/projects`, `GET/PATCH/DELETE /projects/:id`, `GET/POST/DELETE /projects/:id/members`                                                                                                                         | **1 ✅** |
| repositories  | `GET/POST /projects/:id/repositories`, `PATCH/DELETE /repositories/:id`                                                                                                                                                           | **1 ✅** |
| agents        | `POST /agents/machines` (device pairing), `DELETE /agents/machines/:id` (revoke), `GET /teams/:id/agents`, `PATCH /agents/:id`                                                                                                    | **2 ✅** |
| sessions      | `POST /sessions`, `PATCH /sessions/:id` (heartbeat/status), `POST /sessions/:id/end`                                                                                                                                              | **2 ✅** |
| activities    | `GET /projects/:id/activities`, `POST /activities`                                                                                                                                                                                | **2 ✅** |
| collaboration | `GET/POST /collaboration`, `GET/PATCH /collaboration/:id`, `POST /collaboration/:id/{approve,accept,reject,start,complete,cancel,clarify}`, `GET/POST /collaboration/:id/comments`                                                | **4 ✅** |
| tasks         | `GET/POST /tasks`, `PATCH /tasks/:id`, `GET/POST /tasks/:id/dependencies`                                                                                                                                                         | **4 ✅** |
| deliverables  | `POST /deliverables`, `POST /deliverables/:id/versions` (pre-signed upload), `POST /deliverables/:id/publish`, `GET /deliverables/:id/versions/:v/download`                                                                       | **4 ✅** |
| knowledge     | `GET /knowledge?query=&tags=`, `POST /knowledge`, `GET/PATCH /knowledge/:id`, `POST /knowledge/:id/versions`                                                                                                                      | **5 ✅** |
| git           | `POST /git/activities`, `GET /repositories/:id/state`, `GET /git/conflicts`, `PATCH /git/conflicts/:id`                                                                                                                           | 6        |
| notifications | `GET /notifications`, `POST /notifications/read`, `GET/PUT /notifications/preferences`                                                                                                                                            | **4 ✅** |

Every endpoint derives the team from the resource and checks the caller's role; a `teamId` sent by the
client is only a filter, never a proof of access.

## Phase 1 examples

```http
POST /api/v1/teams
{ "name": "Payments Squad" }
→ 201 { "id": "01a1…", "name": "Payments Squad", "slug": "payments-squad", "role": "OWNER", … }

POST /api/v1/teams/01a1…/invitations
{ "email": "bob@acme.dev", "role": "DEVELOPER" }
→ 201 { "id": "…", "email": "bob@acme.dev", "role": "DEVELOPER", "expiresAt": "…" }   (token only in the email)

POST /api/v1/projects/01a1…/repositories
{ "remoteUrl": "git@github.com:acme/checkout.git" }
→ 201 { "remoteUrl": "github.com/acme/checkout", "provider": "GITHUB", "name": "checkout", … }

GET /api/v1/projects/<id of another team>
→ 404 { "error": { "code": "NOT_FOUND", "message": "Project not found" } }
```

## Phase 2 endpoints

| Endpoint                                                           | Auth                 | Purpose                                                                                            |
| ------------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /devices/authorize`                                          | public, 10/min/IP    | start `devsync login`                                                                              |
| `POST /devices/token`                                              | public (device code) | poll: `202 {status:"pending"}`, `200 {status:"approved", deviceToken, …}`, `202 {status:"denied"}` |
| `GET /teams/:id/machines`, `DELETE /teams/:id/machines/:machineId` | session              | list (own / all for admins), revoke                                                                |
| `GET /me`                                                          | device               | identity of the token + `realtimeUrl`                                                              |
| `POST /sessions`                                                   | device               | register (upsert) a Claude Code session; project resolved from `projectId` or `repositoryRemote`   |
| `POST /sessions/:id/heartbeat`                                     | device               | `{ status?, currentTask? }`                                                                        |
| `POST /sessions/:id/end`                                           | device               | end a session                                                                                      |
| `POST /activities`                                                 | device               | `{ id?, sessionId, kind, summary, tool? }` — idempotent by `id`                                    |
| `GET /teams/:id/agents`                                            | session              | live agents                                                                                        |
| `GET /inbox`                                                       | device               | requests assigned to the device owner or their agents                                              |
| `GET /realtime/token`                                              | session              | 5-minute JWT + gateway URL for the dashboard socket                                                |

## Phase 4 endpoints

Developers authenticate with their session; agents with the device token (`X-DevSync-Agent` names the agent,
default `claude-code`; `X-DevSync-Actor: human` makes the device owner act as themselves, used by the CLI).

| Endpoint                                                                                                | Purpose                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /collaboration?teamId=&scope=all\|assigned\|created&status=`                                       | visible requests                                                                          |
| `POST /collaboration`                                                                                   | create (agents: autonomy policy; 409 `details.requestId` on duplicate)                    |
| `GET /collaboration/:id`                                                                                | detail: history, comments, deliverables, tasks, `availableActions`                        |
| `POST /collaboration/:id/actions`                                                                       | `{ action: approve\|accept\|reject\|start\|clarify\|answer\|complete\|cancel, comment? }` |
| `POST /collaboration/:id/comments`                                                                      | `{ body }`                                                                                |
| `POST /collaboration/:id/attachments`                                                                   | `{ fileName, contentType, sizeBytes, commentId? }` → pre-signed PUT                       |
| `GET /collaboration/:id/dependencies`                                                                   | dependency graph of the request's tasks                                                   |
| `GET /attachments/:id/download`                                                                         | 302 to a pre-signed URL                                                                   |
| `POST /deliverables`                                                                                    | `{ requestId? \| projectId, title, format }`                                              |
| `POST /deliverables/:id/versions`                                                                       | `{ kind: inline \| upload \| git_ref \| url, … }` (upload → `uploadUrl`)                  |
| `POST /deliverables/:id/publish`                                                                        | delivers the request, notifies the requester                                              |
| `GET /deliverables/:id?version=&inline=1`                                                               | metadata + text content (≤ 1 MB) or download URL                                          |
| `GET /deliverables/:id/download`                                                                        | 302 for browsers                                                                          |
| `POST /tasks`, `PATCH /tasks/:id`, `GET/POST /tasks/:id/dependencies`                                   | self-declared tasks and dependencies                                                      |
| `GET /notifications?teamId=&unread=1`, `POST /notifications/read`, `GET/PUT /notifications/preferences` | notifications                                                                             |
| `GET/PUT /teams/:id/autonomy`                                                                           | autonomy policy (owners/admins)                                                           |
| `POST /broadcast`                                                                                       | agent message to its project (10/hour)                                                    |
| `GET /inbox`                                                                                            | open requests + deliverables received in the last 7 days                                  |

## Phase 5 endpoints

| Endpoint                                                      | Purpose                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /knowledge/search?query=&tags=&kind=&includeOutdated=`   | hybrid search → `{ semantic, items[{ …, score, matchedBy }] }`                   |
| `GET /knowledge?teamId=&mine=1&visibility=PRIVATE&kind=&tag=` | list (private items only for their author)                                       |
| `POST /knowledge`                                             | publish an item or a new version (`knowledgeId`), `visibility: PRIVATE\|PROJECT` |
| `GET /knowledge/:id?version=`                                 | read; agents are recorded as relying on the version they read                    |
| `PATCH /knowledge/:id/visibility`                             | author only                                                                      |
| `PATCH /knowledge/:id/validity`                               | author or project maintainer; warns readers when outdated/deprecated             |
| `POST /knowledge/promote`                                     | `{ deliverableId, kind?, tags? }`                                                |
