#!/usr/bin/env sh
# Runs the worker's embeddings role in a Linux container from this checkout (for platforms without an
# ONNX runtime binary, e.g. Intel Macs). Services on the host are reached through host.docker.internal.
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MODELS="${DEVSYNC_MODELS_DIR:-$HOME/.cache/devsync-models}"
mkdir -p "$MODELS"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
sed -e 's#localhost#host.docker.internal#g' -e 's#127.0.0.1#host.docker.internal#g' "$ROOT/.env" > "$ENV_FILE"
exec docker run --rm --name devsync-embedder --platform linux/amd64 \
  --add-host=host.docker.internal:host-gateway \
  --env-file "$ENV_FILE" -e WORKER_ROLES=embeddings -e DEVSYNC_MODELS_DIR=/models \
  -v "$ROOT:$ROOT" -v "$MODELS:/models" -w "$ROOT/apps/web" \
  node:24-slim node_modules/.bin/tsx --conditions=react-server server/worker.ts
