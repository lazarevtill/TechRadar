# syntax=docker/dockerfile:1

# The app is a TanStack Start SSR build served by server.ts on Bun, so it needs
# a runtime — there is no static-hosting shortcut. Pinned to the same Bun the
# CI workflow uses, so a container build and a CI build agree.
FROM oven/bun:1.4.2 AS build
WORKDIR /app

# Dependencies first: this layer only rebuilds when the manifests change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Default server address baked into the downloadable Chrome extension; users
# can change it in the extension's Settings. Default: local Docker.
ARG EXTENSION_BACKEND_URL=http://localhost:3000
RUN EXTENSION_BACKEND_URL=$EXTENSION_BACKEND_URL bun run build

FROM oven/bun:1.4.2-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The SSR bundle externalizes runtime dependencies (react-dom, @tanstack/*),
# so the image needs real node_modules — dist alone boots to
# "Cannot find package 'react-dom'". Production-only keeps devDependencies out.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# server.ts reads ./dist/client and ./dist/server/server.js by hard-coded path.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts

# Paid Jev verdicts persist here (src/server/utils/verdict-store.ts) so a
# restart or redeploy doesn't re-send the whole feed. Mount a volume on it.
RUN mkdir -p /app/.cache && chown bun:bun /app/.cache
VOLUME /app/.cache

# Runs as the image's non-root `bun` user.
USER bun
EXPOSE 3000
ENV PORT=3000

# The server preloads static assets into memory on boot, so readiness is not
# instantaneous on a cold start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "server.ts"]
