# Roorin

Nx monorepo with two NestJS backends: `auth` owns users, JWT sessions, and
internal gRPC authentication; `social` owns communities, memberships, posts,
and nested comments. Each service has its own PostgreSQL database and Prisma
client. Voting and feed APIs and the frontend are not implemented yet.

## Local setup

Install Node.js 22+, npm, and Docker with Compose. From the repository root:

```bash
npm ci
npm run generate-ts-proto
cp apps/backend/auth/.env.example apps/backend/auth/.env
cp apps/backend/social/.env.example apps/backend/social/.env
docker compose up -d postgres
docker compose ps
```

Set a private `JWT_SECRET` in auth's `.env`. The templates configure auth HTTP
on port 3000, social HTTP on 3001, and auth gRPC on 5050. Social's
`AUTH_GRPC_URL` must match auth's `GRPC_URL`; social does not need `JWT_SECRET`.
Both `.env` files are gitignored. Wait for Postgres to be healthy, then apply
the committed migrations:

```bash
cd apps/backend/auth
npx prisma migrate deploy
cd ../../..
npx nx run social:deploy-prisma
```

Docker initializes `roorin_auth` and `roorin_social` on the first startup of
the volume. If you already have an older volume without the social database,
create it once before migrating:

```bash
docker compose exec postgres createdb -U roorin roorin_social
```

Run each service in a separate terminal:

```bash
npx nx serve auth
```

```bash
npx nx serve social
```

GraphQL endpoints are `http://localhost:3000/graphql` (auth) and
`http://localhost:3001/graphql` (social). Public social queries do not require
auth to run. Guarded social mutations require auth's gRPC endpoint and the
`Authentication` cookie returned by login.

Stop Postgres with `docker compose down`; this preserves its volume.

## Verification

```bash
npx nx run-many -t lint -p auth,social,social-e2e
npx nx run-many -t test,build -p auth,social
npx nx e2e auth-e2e
npx nx e2e social-e2e
```

Unit specs use mocks and do not require Postgres. E2E tests need both databases
migrated and create unique test records. Nx manages the required service
processes; `social-e2e` starts both auth and social. Run E2E targets separately
with the normal development servers stopped to avoid port conflicts.

## Documentation

Start with [the documentation index](docs/README.md). See
[the social service guide](docs/09-social-service.md) for operations, membership
rules, soft deletion, and test setup, and
[the testing strategy](docs/08-testing-strategy.md) for test responsibilities.
