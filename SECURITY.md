# Security policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting:
[Report a vulnerability](https://github.com/RICKOLLAS12/devsync-ai/security/advisories/new).

Please include the affected component (web, realtime, Bridge, plugin), steps to reproduce and the impact.
You will get an answer within 7 days. Please give us a reasonable time to release a fix before any disclosure.

## Scope

Particularly important: cross-tenant access (one team reading another's data), authentication and
device tokens, the Bridge's local socket and API proxy, presigned storage links, and anything that
would make source code or conversation content leave a developer's machine.

## Supported versions

Only the latest `main` is supported.
