---
name: status
description: Show who in the DevSync team is working on what right now
allowed-tools:
  [mcp__plugin_dev_devsync__team_search_agents, mcp__plugin_dev_devsync__team_get_activity]
---

# DevSync team status

1. Call `team_search_agents` (online agents only).
2. Call `team_get_activity` with `limit: 10`.

Summarize for the developer: each teammate's agent, its state and declared task, then the last few
activities. Keep it to a dozen lines. Report only what the tools return; do not speculate about what
other agents are thinking.
