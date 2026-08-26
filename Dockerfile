# better-sqlite3 is a native module: it must be built against the same Node
# version that runs it (see CLAUDE.md, SQLite specifics). Every stage here
# pins the same base image for that reason.
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
# Build toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @studia/web run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Single Railway service: the API serves apps/web/dist and answers /api/*,
# and apps/worker drains the jobs table (M2). One container, one PID 1, two
# processes: scripts/docker-start.mjs starts both and forwards SIGTERM to
# each so a redeploy stops them cleanly instead of orphaning the worker.
CMD ["node", "scripts/docker-start.mjs"]
