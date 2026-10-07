FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends protobuf-compiler openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NX_DAEMON=false NX_NO_CLOUD=true HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Generation needs a syntactically valid URL, not a running database or secrets.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run codegen:backend
RUN npx nx run-many -t build -p auth,social --parallel=1
ARG DOMAIN
RUN test -n "$DOMAIN" || { echo 'Set the DOMAIN build argument.' >&2; exit 1; }
ENV NEXT_PUBLIC_AUTH_GRAPHQL_URL=https://${DOMAIN}/api/auth/graphql \
    NEXT_PUBLIC_SOCIAL_GRAPHQL_URL=https://${DOMAIN}/api/social/graphql
RUN npm run build:web

FROM build AS migrate
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=128
USER node
CMD ["bash", "deploy/migrate.sh"]

FROM node:24-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts

FROM node:24-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/@prisma-clients ./node_modules/@prisma-clients
COPY --from=build --chown=node:node /app/dist ./dist
USER node
CMD ["node", "dist/apps/backend/auth/main.js"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=4200
COPY --from=build --chown=node:node /app/apps/frontend/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/frontend/web/.next/static ./apps/frontend/web/.next/static
COPY --from=build --chown=node:node /app/apps/frontend/web/public ./apps/frontend/web/public
USER node
CMD ["node", "apps/frontend/web/server.js"]
