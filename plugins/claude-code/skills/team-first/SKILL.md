---
name: team-first
description: Use before starting a significant task, researching a topic, designing an API or editing a shared/core file in a repository connected to DevSync. Checks whether a teammate or their agent is already working on it or knows it, and claims the files you are about to change.
---

# Check the team before working alone

DevSync connects you to the other developers and AI agents of the team. Duplicated research, parallel
edits of the same file and re-designing an existing contract waste time and tokens. Before a significant
piece of work:

0. **Knowledge first, with the developer's consent** — before exploring the codebase from scratch,
   researching a topic or designing something, call `team_search_knowledge`. When something relevant exists,
   **present it to the developer and ask before relying on it**: title, author, kind, version, age, validity —
   e.g. "Alice published 'Checkout architecture' (v2, 3 days ago, valid). Shall I use it, or start fresh?".
   Point out drafts, brainstorms and outdated items explicitly. Only once they agree, read it with
   `team_get_knowledge` (you will be warned if it changes) and build on it, citing the source. If the
   developer said to use team knowledge freely in this session, do not ask again.
1. **Context** — call `team_get_context` once per task (the session start already injected a snapshot;
   refresh it if the task changes or the snapshot is old).
2. **Expertise** — before researching a topic or designing something (API contract, data model,
   integration), call `team_find_expert` with the topic. If someone matches, tell the developer who and
   why, and suggest asking them rather than starting from scratch.
3. **Overlap** — if a teammate's declared task or claimed resources overlap with yours, point it out to
   the developer before editing.
4. **Claim** — before substantial edits to a shared file or directory, call `team_claim_resource`
   (repository-relative path, short reason). If it is already claimed, do not overwrite: report who holds
   it and coordinate. Release it with `team_release_resource` when done.
5. **Declare** — publish a one-line factual task with `team_set_status` when you start, and clear it
   when you finish.
6. **Ask instead of guessing** — when you need something a teammate owns (an API contract, a decision,
   a review), create a request with `team_create_request` (or `team_suggest_collaboration` if the
   developer should decide first), with clear expected deliverables. Tell the developer you did it.
7. **Deliver what you are asked** — at session start and in `team_get_inbox`, check requests assigned to
   you. With the developer's agreement: accept, ask questions with `team_request_clarification`,
   produce the result, store it with `team_submit_deliverable` and deliver it with
   `team_publish_deliverable`. Read deliverables you received with `team_read_deliverable`.

8. **Leave something reusable** — after a significant piece of understanding, a decision or a solution, end your
   answer by offering in one sentence to save a synthesis: shared with the project or private for their future
   sessions. If they accept, run the `dev:share` or `dev:keep` skill yourself; they do not need to type
   the command. Never publish without their choice, and do not offer it for small or routine changes.

Never publish secrets, credentials, file contents or your private reasoning through DevSync: only short,
factual summaries. If DevSync is unreachable, continue the task normally and mention it once.
