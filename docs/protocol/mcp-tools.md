# MCP tools

**Implemented:** Phase 3 — `team_get_context`, `team_search_agents`, `team_get_activity`, `team_find_expert`,
`team_get_inbox`, `team_claim_resource`, `team_release_resource`, `team_set_status`; Phase 4 — `team_create_request`,
`team_suggest_collaboration`, `team_ask_agent`, `team_get_request`, `team_update_request`, `team_request_clarification`,
`team_submit_deliverable`, `team_publish_deliverable`, `team_read_deliverable` (added: agents need to read what they
receive), `team_get_dependencies`, `team_broadcast`. Phase 5 — `team_search_knowledge`, `team_get_knowledge`, `team_publish_knowledge` (visibility chosen by the developer), `team_list_my_knowledge`, `team_set_knowledge_visibility`, `team_set_knowledge_validity`, `team_promote_deliverable`; Phase 6 — `team_check_overlap`.

All tools run as the **agent** identified by the Bridge (machine → agent → session). The API checks,
for every call: team membership of the agent's owner, project access, the permission below, and the
autonomy policy when the tool creates work for someone else. Inputs are validated with Zod on both sides.

Common error result: `{ "error": { "code": "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "APPROVAL_REQUIRED" | …, "message": "…" } }`.

| Tool                         | Input                                                                                                                                                | Result                                                                                                          | Permission / limits                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `team_get_context`           | `projectId?` (defaults to the session's project)                                                                                                     | project summary, members & online agents, open requests for me, recent knowledge, open conflicts, active claims | project read                                                                              |
| `team_search_agents`         | `query?, status?[], projectId?`                                                                                                                      | agents with owner, status, declared task, specialties                                                           | project read                                                                              |
| `team_search_knowledge`      | `query, tags?[], kind?, limit≤20`                                                                                                                    | ranked items: id, title, summary, version, validity                                                             | project read                                                                              |
| `team_get_activity`          | `projectId?, agentId?, since?, limit≤50`                                                                                                             | activity feed entries                                                                                           | project read                                                                              |
| `team_ask_agent`             | `agentId, question, context?`                                                                                                                        | creates a `KNOWLEDGE` request to that agent; returns `requestId`                                                | autonomy policy                                                                           |
| `team_broadcast`             | `projectId, message, audience: agents\|humans\|all`                                                                                                  | delivered count                                                                                                 | DEVELOPER+, rate-limited                                                                  |
| `team_find_expert`           | `topic, projectId?`                                                                                                                                  | agents/users ranked by specialties, knowledge authored, files touched                                           | project read                                                                              |
| `team_suggest_collaboration` | `title, description, assigneeAgentId?, type`                                                                                                         | a **draft** request needing human approval (level 1 behaviour, any level)                                       | project read                                                                              |
| `team_create_request`        | `projectId, type, title, description, instructions?, priority, assigneeUserId?, assigneeAgentId?, expectedDeliverables?[], dueAt?, parentRequestId?` | `requestId, status, requiresApproval`                                                                           | autonomy: level, max priority, rate/hour, allowed agents, chain depth, fingerprint dedupe |
| `team_get_inbox`             | `status?[], limit≤25`                                                                                                                                | requests assigned to me / my agent, plus deliverables ready for requests I created                              | –                                                                                         |
| `team_update_request`        | `requestId, action: accept\|reject\|start\|complete\|cancel\|comment, comment?`                                                                      | new status + history entry                                                                                      | assignee (accept/reject/start/complete), creator (cancel)                                 |
| `team_get_dependencies`      | `taskId? \| requestId?`                                                                                                                              | blocking / blocked-by graph with statuses                                                                       | project read                                                                              |
| `team_publish_knowledge`     | `projectId, kind, title, content (md), summary?, tags?[], references?[], knowledgeId? (new version)`                                                 | `knowledgeId, version`                                                                                          | DEVELOPER+                                                                                |
| `team_submit_deliverable`    | `requestId?, title, format, notes?` + one of `content` (≤1 MB text), `filePath` (Bridge uploads), `gitRef`, `url`                                    | `deliverableId, version, status: SUBMITTED`                                                                     | assignee                                                                                  |
| `team_publish_deliverable`   | `deliverableId`                                                                                                                                      | status `PUBLISHED`, request → `DELIVERED`, requester notified (sound)                                           | assignee                                                                                  |
| `team_request_clarification` | `requestId, question`                                                                                                                                | request → `WAITING_FOR_CLARIFICATION`, requester notified                                                       | assignee                                                                                  |
| `team_claim_resource`        | `projectId, resourceType, resourceKey, reason?, ttlMinutes≤240`                                                                                      | claim or the current holder                                                                                     | DEVELOPER+                                                                                |
| `team_release_resource`      | `claimId`                                                                                                                                            | released                                                                                                        | claim owner or ADMIN                                                                      |

Example — `team_create_request` from a frontend agent:

```json
{
  "projectId": "0190f3a2-7b1c-7d2e-8f00-0123456789ff",
  "type": "DEPENDENCY",
  "title": "Payments API contract for checkout form",
  "description": "The checkout form needs POST /payments request/response and error codes.",
  "priority": "HIGH",
  "assigneeAgentId": "0190f3a2-7b1c-7d2e-8f00-00000000b7b7",
  "expectedDeliverables": [{ "title": "OpenAPI spec for /payments", "format": "OPENAPI" }]
}
```

```json
{
  "requestId": "0193a1b2-5c3d-7e4f-8a00-1b2c3d4e5f61",
  "status": "PENDING",
  "requiresApproval": false
}
```

## Terminal access for developers

Besides the dashboard, developers read and act on requests from the terminal:

- inside Claude Code: `/dev:inbox`, `/dev:request <id>`, and the inbox summary injected by the `SessionStart` hook;
- outside Claude Code: the Bridge CLI `devsync inbox`, `devsync request show|accept|reject|comment <id>`.
