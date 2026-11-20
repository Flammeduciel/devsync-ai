---
name: team-context
description: Load the DevSync team context for the current repository
argument-hint: '[projectId]'
allowed-tools: [mcp__plugin_dev_devsync__team_get_context]
---

# DevSync team context

Call `team_get_context` (pass `$ARGUMENTS` as `projectId` if the developer gave one) and give a brief
summary: project, teammates working now and on what, requests waiting, claimed resources that could
affect the current task.
