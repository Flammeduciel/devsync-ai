# Deploying DevSync AI on Dokploy

One Docker Compose application on Dokploy runs everything: Postgres (pgvector), Redis, MinIO and three
copies of the DevSync image (`web`, `realtime`, `worker`), plus a one-shot `migrate` container.
Traefik (managed by Dokploy) terminates HTTPS.

```
                 Traefik (Dokploy, HTTPS)
     ┌──────────────────┼──────────────────────────┐
devsync.example.com  realtime.devsync.example.com  files.devsync.example.com
  web :3000             realtime :4000               minio :9000
     └───────────┬──────────┘                          │
          postgres · redis (internal network only) ────┘   worker (maintenance + embeddings)
```

## 1. Requirements

- A server with Dokploy installed, **4 GB RAM minimum** (the embeddings model uses ~600 MB in the worker).
- Three DNS records (A/AAAA) pointing to the server: `devsync.`, `realtime.devsync.`, `files.devsync.`
  (any names work; they go into the variables below).
- An SMTP account for e-mails (verification, invitations, password reset).

## 2. Create the application

1. Dokploy → **Projects → Create project** → **Create service → Compose**.
2. Provider: **GitHub** (or Git) → repository `devsync-ai`, branch `main`.
3. **Compose path:** `./docker-compose.dokploy.yml`.

The image is built by Dokploy from `infrastructure/docker/app.Dockerfile` on each deployment
(5–10 min the first time, faster afterwards thanks to the pnpm cache).

## 3. Environment

Dokploy → the Compose service → **Environment**. Start from `.env.production.example`:

| Variable                                                             | Value                                            |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| `APP_URL`                                                            | `https://devsync.example.com`                    |
| `REALTIME_URL`                                                       | `https://realtime.devsync.example.com`           |
| `S3_PUBLIC_ENDPOINT`                                                 | `https://files.devsync.example.com`              |
| `AUTH_SECRET`, `REALTIME_JWT_SECRET`                                 | two different values from `openssl rand -hex 32` |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`                                | strong random values                             |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                           | MinIO root user / password (≥ 8 characters)      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | your mail provider                               |
| `PLATFORM_ADMIN_EMAILS`                                              | your e-mail (access to `/admin`)                 |
| `TRUSTED_PROXY_HOPS`                                                 | `1` (Traefik)                                    |

Never change `POSTGRES_PASSWORD` after the first deployment without changing it inside Postgres too.

**External S3 instead of MinIO** (Cloudflare R2, Scaleway, AWS…): remove the `minio` service and its
`depends_on`, then set `S3_ENDPOINT` (and `S3_PUBLIC_ENDPOINT` to the same value), `S3_REGION`,
`S3_BUCKET` and the keys. Allow `PUT`/`GET` CORS from `APP_URL` on the bucket.

## 4. Domains

Dokploy → the Compose service → **Domains** → add three domains, HTTPS on (Let's Encrypt):

| Service    | Port | Host                                                                   |
| ---------- | ---- | ---------------------------------------------------------------------- |
| `web`      | 3000 | `devsync.example.com`                                                  |
| `realtime` | 4000 | `realtime.devsync.example.com` (WebSockets work through Traefik as-is) |
| `minio`    | 9000 | `files.devsync.example.com`                                            |

## 5. Deploy

Click **Deploy**. Order: Postgres/Redis/MinIO healthy → `migrate` applies the Prisma migrations and
exits → `web`, `realtime`, `worker` start. Check:

- `https://devsync.example.com/api/v1/health` → `{"status":"ok",…}` (also creates the bucket on first call)
- `https://realtime.devsync.example.com/health` → `ok`

Redeploying is safe: migrations are versioned (`prisma migrate deploy`, never `db push`), and data
lives in the named volumes `postgres-data`, `redis-data`, `minio-data`, `models`.

## 6. First account and platform admin

1. Open `https://devsync.example.com/sign-up` with the address listed in `PLATFORM_ADMIN_EMAILS`.
2. Click the link in the verification e-mail. The user menu now shows **Platform admin** (`/admin`).
3. In `/admin`, choose who can sign up: **Open**, **Invitation only** or **Closed**.

Organizations then onboard themselves: sign up → create a team → invite members.

## 7. Developers

```bash
devsync login --server https://devsync.example.com   # pair the machine (approve in the browser)
devsync start                                        # background Bridge daemon
```

Inside Claude Code:

```
/plugin marketplace add RICKOLLAS12/devsync-ai
/plugin install dev@devsync-ai
```

The Bridge learns the realtime URL from the server; nothing else to configure.

## 8. Operations

- **Backups:** Dokploy → the Compose service → **Volume backups** for `postgres-data` and `minio-data`
  (S3 destination), or a scheduled `pg_dump`:
  `docker compose -p <name> exec -T postgres pg_dump -U devsync devsync | gzip > devsync-$(date +%F).sql.gz`
- **Logs:** Dokploy → Logs, per service (JSON lines; `LOG_LEVEL=info`).
- **Updates:** push to `main` → Deploy (or enable auto-deploy). The `migrate` step runs first.
- **Scaling:** `web` is stateless; `realtime` instances share events through Redis; run the
  embeddings role on a separate worker (`WORKER_ROLES=embeddings`) if the knowledge base grows.
- **Without embeddings** (small server): `WORKER_ROLES=maintenance`. Knowledge search falls back to
  text + trigram matching; `/admin` shows "embeddings worker: not running".

## Security notes

- Only `web`, `realtime` and `minio` are reachable through Traefik; Postgres and Redis are not published.
- Production responses carry CSP, HSTS, `X-Frame-Options`-equivalent `frame-ancestors 'none'`,
  `nosniff` and a strict referrer policy.
- Rate limits use the client IP seen by Traefik (`TRUSTED_PROXY_HOPS`), not a forgeable header.
- Repository contents never reach the server: Bridges send paths and line numbers only.
