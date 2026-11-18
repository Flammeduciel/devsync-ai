---
name: team-first
description: Use before starting a significant task, researching a topic, designing an API or editing a shared/core file in a repository connected to DevSync. Checks whether a teammate or their agent is already working on it or knows it, and claims the files you are about to change.
---

# Check the team before working alone

DevSync connects you to the other developers and AI agents of the team. Duplicated research, parallel
edits of the same file and re-designing an existing contract waste time and tokens. Before a significant
piece of work:

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

Never publish secrets, credentials, file contents or your private reasoning through DevSync: only short,
factual summaries. If DevSync is unreachable, continue the task normally and mention it once.
