# Production image: Next.js standalone server, migrations and seed tooling.
# Build from the repository root:  docker build -f deploy/Dockerfile -t abcfinance .

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migration tooling runs from the full dependency tree, kept apart from the slim server.
COPY --from=build --chown=app:app /app/node_modules /opt/tools/node_modules
COPY --from=build --chown=app:app /app/db /opt/tools/db
COPY --from=build --chown=app:app /app/scripts /opt/tools/scripts
COPY --from=build --chown=app:app /app/src /opt/tools/src
COPY --from=build --chown=app:app /app/package.json /app/tsconfig.json /opt/tools/
USER app
EXPOSE 3000
CMD ["node", "server.js"]
