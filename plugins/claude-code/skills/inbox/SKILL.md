---
name: inbox
description: Show DevSync collaboration requests waiting for you or your agents
allowed-tools: [mcp__plugin_devsync_devsync__team_get_inbox]
---

# DevSync inbox

Call `team_get_inbox` and present the open requests to the developer as a short list, most urgent first:
priority, title, type, project, who asked (human or which teammate's agent) and the request id.

If the inbox is empty, say so in one sentence. If DevSync is unreachable, relay the instruction returned by
the tool (usually `devsync start`). Do not start working on a request unless the developer asks you to.
