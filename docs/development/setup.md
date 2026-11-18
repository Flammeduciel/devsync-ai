# Local development

## Prerequisites

Node 24, pnpm 10, Docker Desktop.

## First run

```bash
pnpm install
cp .env.example .env
# generate secrets
sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" .env
sed -i '' "s|^REALTIME_JWT_SECRET=.*|REALTIME_JWT_SECRET=$(openssl rand -hex 32)|" .env

# MinIO no longer publishes images: build it once (or retag a cached quay.io/minio/minio image)
docker build -t devsync/minio:RELEASE.2025-09-07T16-13-09Z infrastructure/docker/minio

pnpm infra:up
pnpm db:migrate
pnpm --filter @devsync/database db:test:prepare
pnpm typecheck && pnpm test
pnpm dev            # web on :3000, realtime on :4000
pnpm dev:worker     # background jobs: session sweeps + local embeddings (knowledge search)
pnpm dev:embedder   # Intel Macs only: run the embeddings role in a Linux container
                    # (then start the host worker with WORKER_ROLES=maintenance)
curl localhost:3000/api/v1/health
```

Optional demo data (development only): sign up in the app, then
`SEED_EMAILS=you@example.com,teammate@example.com pnpm db:seed` → team at `/t/demo`.
Emails (invitations, password reset) are visible in Mailpit at http://localhost:8025.

| Service             | URL                                                                      |
| ------------------- | ------------------------------------------------------------------------ |
| Web                 | http://localhost:3000                                                    |
| Realtime            | http://localhost:4000/health                                             |
| PostgreSQL          | `localhost:5433` (devsync/devsync)                                       |
| Redis               | `localhost:6380`                                                         |
| MinIO API / console | http://localhost:9000 · http://localhost:9001 (devsync / devsync-secret) |
| Mailpit             | http://localhost:8025                                                    |

Ports are shifted from defaults to coexist with locally installed services; override them with
`POSTGRES_PORT`, `REDIS_PORT`, … when running `docker compose`.

## Environment variables

Every service validates its own variables at startup and exits with the list of invalid ones.

| Variable                                                                                                   | Used by       | Notes                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------- |
| `NODE_ENV`, `LOG_LEVEL`                                                                                    | all           | defaults `development`, `info`                      |
| `APP_URL`                                                                                                  | web, realtime | public URL of the web app (CORS origin for sockets) |
| `AUTH_SECRET`                                                                                              | web           | ≥ 32 chars                                          |
| `DATABASE_URL` / `DATABASE_URL_TEST`                                                                       | web, database | PostgreSQL                                          |
| `REDIS_URL`                                                                                                | web, realtime |                                                     |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | web           | any S3-compatible store                             |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`                                                                     | web           | Mailpit locally                                     |
| `REALTIME_PORT`, `REALTIME_URL`, `REALTIME_JWT_SECRET`                                                     | web, realtime |                                                     |

## Database workflow

```bash
# edit packages/database/prisma/schema.prisma, then
pnpm db:migrate --name <change>     # creates + applies a migration
```

Constraints Prisma can't express go at the end of the generated `migration.sql` (see `docs/database/schema.md`).
Note: Prisma refuses `migrate reset` when run by an AI agent; a human must run it.

## Conventions

- Small, atomic commits (Conventional Commits: `feat(scope):`, `fix:`, `docs:`, `test:`, `chore:`).
- No business rule in React components or Route Handlers — put it in `apps/web/server/{domain,services}`.
- Every repository query is scoped by `teamId`.

## Troubleshooting

- **The dev server reloads in a loop**: a `.next` folder produced by `pnpm build` was reused by `next dev`.
  Stop the server, `rm -rf apps/web/.next`, start again.
- **`devsync` says the daemon is not running**: `pnpm bridge start`, logs in `~/.devsync/bridge.log`.

## Semantic search model

The first start of the embeddings role downloads `Xenova/multilingual-e5-small` (~120 MB) into
`~/.cache/devsync-models` (override with `DEVSYNC_MODELS_DIR`, model with `EMBEDDING_MODEL`). Without a running
embeddings worker, knowledge search transparently uses full-text only. Smoke test on supported platforms:
`pnpm --filter @devsync/web exec tsx tests/manual/embeddings-smoke.ts`.
