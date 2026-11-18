## What and why

<!-- What does this change, and why? Link the issue: "Closes #123". -->

## How it was tested

<!-- Tests added/updated, manual checks (screenshots for UI changes). -->

## Checklist

- [ ] One topic, small atomic commits with Conventional Commit messages
- [ ] `pnpm exec prettier --write .`, `pnpm typecheck` and `pnpm test` pass locally
- [ ] Tests cover the behaviour change
- [ ] Migration added if the schema changed; compatible with Bridges/plugins one version behind
- [ ] No secret, prompt, conversation content or source code sent to the server
- [ ] Docs updated (`docs/`, README) if behaviour or setup changed
- [ ] Plugin bundle rebuilt if `apps/mcp-server` changed
