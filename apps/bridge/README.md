# @devsync/bridge

Background daemon + `devsync` CLI installed on each developer machine. **Phase 2** (not implemented yet).

Responsibilities (see `docs/architecture/boundaries.md`):

- Authenticate the machine with a revocable device token, keep a Socket.IO connection alive.
- Multiplex the local Claude Code sessions (`sessions/`), forward their events.
- Persistent offline queue (`queue/`) with event ids, acks, retries and replay after reconnect.
- Watch associated Git repositories and worktrees (`git/`).
- OS notifications and configurable sounds (`notifications/`), even when Claude Code is closed.
- Local IPC endpoint used by the MCP server and the plugin hooks (`daemon/`).
- Terminal access to the team inbox: `devsync inbox`, `devsync request show|accept|reject|comment`.
