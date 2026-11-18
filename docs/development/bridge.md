# DevSync Bridge

The Bridge is the only DevSync component running on a developer machine. One daemon per machine
serves every local Claude Code session.

## Install and pair (development)

```bash
pnpm bridge login            # builds apps/bridge, prints a code and opens http://localhost:3000/device
pnpm bridge start            # background daemon (logs in ~/.devsync/bridge.log)
pnpm bridge status
pnpm bridge inbox            # requests waiting for you or your agents
pnpm bridge notify-test      # check desktop notifications and sound
pnpm bridge stop
```

Use `DEVSYNC_HOME=/some/dir` to run several isolated Bridges on one machine (tests, demos), and
`devsync login --server https://devsync.example.com` for a remote server.

## Pairing (device authorization flow)

1. `devsync login` → `POST /api/v1/devices/authorize` → `{ deviceCode, userCode, verificationUri }`.
   The device code (secret) stays in the terminal; only its SHA-256 is stored (Redis, 10 min).
2. The developer opens `/device`, signs in, checks the code shown in **their own** terminal,
   picks a team and approves (Viewers cannot pair agents).
3. The Bridge polls `POST /api/v1/devices/token` every 3 s; on approval it receives the device token
   (`dsd_…`) exactly once. The server stores `sha256(token)` in `agent_machines`.
4. Revocation (Live agents → Machines → Revoke): the token stops working at once, active sessions
   end (`agent.disconnected` reason `revoked`) and the gateway closes the machine's socket.

## Files (`~/.devsync`, directory 0700)

| File          | Content                                                 |
| ------------- | ------------------------------------------------------- |
| `config.json` | server URL, team, machine id                            |
| `credentials` | device token, mode 0600                                 |
| `state.json`  | last event sequence per team + recently seen event ids  |
| `outbox.json` | calls waiting for the server (activities, session ends) |
| `bridge.sock` | local IPC socket, mode 0600 (named pipe on Windows)     |

## Guarantees

| Concern                   | Mechanism                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server unreachable        | Activities and session ends are written to `outbox.json` and retried with exponential backoff (1 s → 60 s, jitter), in order. Items older than 24 h are dropped. |
| Duplicate sends           | Activities carry a producer id; the server ignores an id it already stored. Session registration and heartbeats are idempotent.                                  |
| Missed realtime events    | Every (re)connection sends `lastSequence` per team; the gateway replays from the outbox table (with a 50-event overlap).                                         |
| Duplicate deliveries      | The Bridge keeps the last 2000 event ids and acks duplicates without processing them.                                                                            |
| Gateway restart           | Socket.IO reconnects with backoff (1 s → 30 s).                                                                                                                  |
| Silent crash of a session | No heartbeat for 90 s ⇒ the worker closes the session (`reason: timeout`).                                                                                       |
| Closed Claude Code        | The daemon keeps receiving notifications; it cannot wake a closed session. Pending requests are fetched at the next `SessionStart` (Phase 3).                    |

## Local IPC (used by plugin hooks and the MCP server)

Newline-delimited JSON: request `{ "id": 1, "method": "...", "params": { } }`, response
`{ "id": 1, "result": … }` or `{ "id": 1, "error": { "message": "…" } }`.

| Method             | Params                                                                           | Effect                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `status`           | –                                                                                | daemon, realtime link, team, sessions, queued items                                                                                     |
| `session.start`    | `externalSessionId, workingDirectory?, agentName?, pluginVersion?, specialties?` | registers the session; branch and origin remote are detected from `workingDirectory` and mapped to the project that owns the repository |
| `session.update`   | `externalSessionId, status?, currentTask?`                                       | declared state, sent immediately and with every heartbeat (30 s)                                                                        |
| `activity.publish` | `externalSessionId, kind, summary, tool?`                                        | queued then sent                                                                                                                        |
| `session.end`      | `externalSessionId`                                                              | queued then sent                                                                                                                        |
| `inbox.list`       | –                                                                                | requests assigned to the developer or their agents                                                                                      |
| `notify.test`      | –                                                                                | desktop notification with sound                                                                                                         |
