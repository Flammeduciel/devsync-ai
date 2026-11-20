---
name: keep
description: Save this session's result privately so the developer's future sessions can find it, without sharing it with the team. Use when the developer accepts your offer to keep a significant result for themselves, or asks to.
argument-hint: '[what to keep]'
allowed-tools:
  [mcp__plugin_dev_devsync__team_publish_knowledge, mcp__plugin_dev_devsync__team_search_knowledge]
---

# Keep for myself

Save `$ARGUMENTS` (if empty: the main result of the session so far) as a **private** note: only this developer and
their future sessions will find it (through the session-start context and `team_search_knowledge`).

Write a reusable synthesis (context, findings, key files, next steps, open questions), never a transcript. Show its
title and one-sentence summary to the developer and wait for their confirmation, then publish it with
`team_publish_knowledge` and `visibility: PRIVATE`. Mention it can be shared later with
`/dev:share`.
