# Social service scaffold

The `social` Nx application prepares the communities backend. It runs on port
3001, owns the `roorin_social` database, and registers a gRPC client for the
existing auth service at `localhost:5050`. The auth service retains ownership of
users and JWT verification; social stores user IDs without cross-database
foreign keys.

## Current scope

- A `Community` Prisma model with a unique slug, name, optional description,
  owner ID, timestamps, and indexes on owner ID and member count.
- An initial migration and a separate generated Prisma client.
- Shared HTTP bootstrap, cookie parsing, validation, CORS, and GraphQL setup.
- A public `health` GraphQL query returning `"ok"`.
- An empty `CommunitiesModule` ready for the next implementation step.

Community creation, listing, membership, posts, comments, votes, and feeds are
not implemented in this workspace. The completed reference project contains
those features, but this commit only establishes the service scaffold. The
member counter starts at zero until membership behavior is implemented.

## Run locally

Create `apps/backend/social/.env` from the adjacent `.env.example` template and
adjust its database connection if needed. The local `.env` is gitignored.

```bash
npm install
npm run generate-ts-proto
docker compose up -d postgres
npx nx run social:deploy-prisma
npx nx serve social
```

The Docker initialization script creates `roorin_social` on the first startup
of a fresh volume. For an existing Postgres volume, ensure that database exists
before deploying migrations.

GraphQL is served at `http://localhost:3001/graphql`:

```graphql
query {
  health
}
```

The auth service does not need to run for this public health query. Future
guarded community resolvers will need the auth gRPC service.

## Checks

```bash
npx nx run-many -t lint -p social,social-e2e
npx nx test social
npx nx build social
npx nx e2e social-e2e
```

The E2E target starts and stops social through Nx. It needs a running Postgres
database with the social migration applied and checks the real GraphQL endpoint.
Unit tests use a mocked Prisma client and do not require Postgres.

Use `npx nx run social:migrate-prisma --name <migration>` to create a future
migration in development. Use `social:deploy-prisma` to apply committed
migrations without creating new ones.
