# DevSync AI application image: one image, one role per container (web | realtime | worker | migrate).
# Build from the repository root:  docker build -f infrastructure/docker/app.Dockerfile -t devsync-app .

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates git openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY . .
# prisma generate (postinstall) reads the config but never connects: a placeholder URL is enough.
# onnxruntime: CPU binaries ship with the package; skip the CUDA download (servers have no GPU).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build ONNXRUNTIME_NODE_INSTALL=skip
# Cached pnpm store between builds (BuildKit).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @devsync/database db:generate \
 && pnpm --filter @devsync/web build \
 && pnpm --filter @devsync/realtime build \
 && pnpm --filter @devsync/bridge build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node infrastructure/docker/entrypoint.sh /usr/local/bin/devsync
RUN chmod +x /usr/local/bin/devsync && mkdir -p /models && chown node:node /models
ENV DEVSYNC_MODELS_DIR=/models
USER node
EXPOSE 3000 4000
ENTRYPOINT ["devsync"]
CMD ["web"]
