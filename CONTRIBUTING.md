# Contributing to DevSync AI

Thanks for helping. This document is the rulebook: a pull request that follows it gets reviewed quickly.

## Ground rules

1. **Everything goes through a pull request** — nobody pushes to `main`, maintainers included.
   `main` is deployed to production: it must always build and pass CI.
2. **One topic per pull request.** A bug fix does not come with an unrelated refactor.
3. **Small, atomic commits**, each one compiling, with a [Conventional Commit](https://www.conventionalcommits.org)
   message: `feat(web): …`, `fix(bridge): …`, `docs: …`, `test: …`, `refactor: …`, `build: …`, `chore: …`.
4. **Open an issue first** for anything larger than a small fix (new feature, schema change, new
   dependency) so the design is agreed before you write the code.
5. **Be kind.** See the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

See the [README](README.md#local-development) and [docs/development/setup.md](docs/development/setup.md).
Before pushing:

```bash
pnpm exec prettier --write .
pnpm typecheck && pnpm test
pnpm --filter @devsync/mcp-server build   # if you touched apps/mcp-server (the plugin bundle is committed)
```

## Code rules

- **Layers** (web): `app/` (routes, pages) → `server/services/` (use cases, authorization) →
  `server/repositories/` (Prisma) ; pure rules in `server/domain/`. No Prisma in pages or routes.
  See [docs/architecture/boundaries.md](docs/architecture/boundaries.md).
- **Validation** with Zod in `packages/validation`; never trust input from the browser, the Bridge or an agent.
- **Multi-tenancy:** every query is scoped by team; another tenant's resource answers **404**, never 403.
- **Privacy:** the server must never receive prompts, conversation content or source code. The Bridge
  sends technical facts only (states, paths, line ranges, branch names).
- **Tests are required** for behaviour changes: domain rules → unit tests; services → integration
  tests against the test database (`apps/web/tests/integration`).
- **Database:** schema changes come with a Prisma migration (`pnpm db:migrate`); never edit an
  applied migration. Changes must stay **backward compatible** with Bridges and plugins one version
  behind (the team uses DevSync to build DevSync).
- **No secrets in the repository**, not even in tests or examples (use `change-me`).
- **No new dependency** without explaining why in the pull request.
- TypeScript strict, no `any`, no `@ts-ignore` without a comment explaining it.

## Pull request checklist

The [template](.github/pull_request_template.md) is filled automatically. A pull request is merged when:

- CI is green (format, typecheck, tests, plugin bundle up to date);
- a maintainer approved it (code owners: [.github/CODEOWNERS](.github/CODEOWNERS));
- review conversations are resolved;
- the branch is up to date with `main`.

Merges use **squash** or **rebase**; the history of `main` stays linear.

## Reporting a vulnerability

Never in a public issue — see [SECURITY.md](SECURITY.md).
