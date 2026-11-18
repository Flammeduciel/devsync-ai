---
disable-model-invocation: true
name: share
description: Share what was just worked out in this session (project understanding, decision, analysis, solution, brainstorm) with the project team as reusable knowledge
argument-hint: "[what to share, e.g. 'the architecture overview']"
allowed-tools:
  [
    mcp__plugin_devsync_devsync__team_publish_knowledge,
    mcp__plugin_devsync_devsync__team_search_knowledge,
    mcp__plugin_devsync_devsync__team_list_my_knowledge,
    mcp__plugin_devsync_devsync__team_set_knowledge_visibility,
  ]
---

# Share with the team

The developer wants teammates (and their agents) to benefit from this session's results: `$ARGUMENTS`
(if empty: the main result of the session so far).

1. If they refer to something already saved privately, find it with `team_list_my_knowledge` and share it with
   `team_set_knowledge_visibility` (PROJECT). Done.
2. Otherwise check with `team_search_knowledge` whether a similar item exists; if so, propose a new version of
   it (pass its knowledgeId) instead of a duplicate.
3. Write a **reusable synthesis**, not a transcript: context, what was found or decided, key files and how they fit
   together, conventions, pitfalls, open questions. Pick the kind (DOCUMENTATION for project understanding,
   DECISION, ANALYSIS, SOLUTION, API_CONTRACT, BRAINSTORM), a clear title, a one-sentence summary, a few tags and
   file references. Never include secrets, credentials or private reasoning.
4. Show the title and summary to the developer in a few lines and ask for confirmation.
5. Publish with `team_publish_knowledge` and `visibility: PROJECT`. Tell them it is now findable by the team.
