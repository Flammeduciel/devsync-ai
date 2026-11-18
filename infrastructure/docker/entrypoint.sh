#!/bin/sh
# Role selector for the DevSync image. Secrets come from the environment only.
set -eu
cd /app
case "${1:-web}" in
  migrate)
    # Versioned migrations only (never `db push`): safe on an existing production database.
    cd packages/database
    exec node_modules/.bin/prisma migrate deploy
    ;;
  web)
    cd apps/web
    exec node_modules/.bin/next start --port "${PORT:-3000}" --hostname 0.0.0.0
    ;;
  realtime)
    exec node apps/realtime/dist/main.js
    ;;
  worker)
    # WORKER_ROLES=maintenance,embeddings (default both)
    cd apps/web
    exec node_modules/.bin/tsx --conditions=react-server server/worker.ts
    ;;
  *)
    exec "$@"
    ;;
esac
