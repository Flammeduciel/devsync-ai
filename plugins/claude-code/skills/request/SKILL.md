---
name: request
description: Show or act on a DevSync collaboration request
argument-hint: '<requestId> [accept|reject|start|complete|cancel|approve]'
allowed-tools:
  [mcp__plugin_devsync_devsync__team_get_request, mcp__plugin_devsync_devsync__team_update_request]
---

# DevSync request

Arguments: `$ARGUMENTS`

1. Call `team_get_request` with the request id (first argument) and summarize it for the developer:
   who asks what, status, conversation, deliverables, and the actions available.
2. If an action was given as second argument and it is listed as available, confirm it with the
   developer in one sentence, then call `team_update_request`. Never accept or reject work without the
   developer's agreement.
