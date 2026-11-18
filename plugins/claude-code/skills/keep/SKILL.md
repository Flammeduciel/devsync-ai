---
disable-model-invocation: true
name: keep
description: Save this session's result privately so the developer's future sessions can find it, without sharing it with the team
argument-hint: '[what to keep]'
allowed-tools:
  [
    mcp__plugin_devsync_devsync__team_publish_knowledge,
    mcp__plugin_devsync_devsync__team_search_knowledge,
  ]
---

# Keep for myself

Save `$ARGUMENTS` (if empty: the main result of the session so far) as a **private** note: only this developer and
their future sessions will find it (through the session-start context and `team_search_knowledge`).

Write a reusable synthesis (context, findings, key files, next steps, open questions), never a transcript, and
publish it with `team_publish_knowledge` and `visibility: PRIVATE`. Mention it can be shared later with
`/devsync:share`.
