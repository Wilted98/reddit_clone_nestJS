# Social service and communities

The `social` Nx application implements the communities backend. It runs on port
3001, owns the `roorin_social` database, and registers a gRPC client for the
existing auth service at `localhost:5050`. The auth service retains ownership of
users and JWT verification; social stores user IDs without cross-database
foreign keys.

## Current scope

- A `Community` Prisma model with a unique slug, name, optional description,
  owner ID, timestamps, and indexes on owner ID and member count.
- A `Membership` model keyed by user ID and community ID, with `MEMBER`,
  `MODERATOR`, and `OWNER` roles. Deleting a community cascades to its memberships.
- Committed Community and Membership migrations and a separate Prisma client.
- Shared HTTP bootstrap, cookie parsing, validation, CORS, and GraphQL setup.
- A public `health` GraphQL query returning `"ok"`.
- Community creation, public lookup and listing, and guarded join/leave operations.

Community creation writes the owner membership and an initial member count of
one together. Join and leave update membership rows and the counter within a
transaction. Duplicate requests, including concurrent ones, only change the
counter when a row is inserted or deleted. Owners cannot leave their own
communities; leaving as a non-member is a no-op.

The completed reference project also implements posts, comments, votes, and
feeds. Those features are outside this workspace's current communities scope.
The moderator role is stored but has no moderation operations yet.

## GraphQL operations

| Operation                               | Access                   | Result                              |
| --------------------------------------- | ------------------------ | ----------------------------------- |
| `health`                                | Public                   | `"ok"`                              |
| `community(slug)`                       | Public                   | One community, or a not-found error |
| `communities(cursor, limit)`            | Public                   | `items`, `nextCursor`, `hasMore`    |
| `createCommunity(createCommunityInput)` | Authenticated            | Community with an owner membership  |
| `joinCommunity(slug)`                   | Authenticated            | Community after joining             |
| `leaveCommunity(slug)`                  | Authenticated, non-owner | Community after leaving             |

Creation accepts a lowercase slug of 3-24 letters, digits, or underscores, a
name of 3-60 characters, and an optional description up to 500 characters.
The owner ID comes from the authenticated user, never from the mutation input.
Duplicate slugs produce a conflict error.

Lists sort by member count descending, then ID ascending to resolve ties.
The default page size is 25, with a supported range of 1-100. Subsequent pages
exclude the cursor row. Pages are not a snapshot: membership changes between
requests can change a community's ranking.

## Run locally

Create `apps/backend/social/.env` from the adjacent `.env.example` template and
adjust its database connection if needed. The local `.env` is gitignored.

```bash
npm install
npm run generate-ts-proto
docker compose up -d postgres
npx nx run auth:migrate-prisma
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

The auth service does not need to run for public queries. Start it in another
terminal with `npx nx serve auth` for guarded community mutations. Configure
its `.env` from `apps/backend/auth/.env.example` as well. Log in through auth
and include its `Authentication` cookie when sending mutations to social.

## Checks

```bash
npx nx run-many -t lint -p social,social-e2e
npx nx test social
npx nx build social
npx nx e2e social-e2e
```

The E2E target builds, starts, and stops both auth and social through Nx. It
needs a running Postgres instance with both services' migrations applied.
Tests register unique users and communities to avoid collisions on reruns.
`AUTH_HTTP_URL` can override the test client's auth address (default
`http://localhost:3000`); the social test address uses `HOST` and `PORT`
(defaults `localhost` and `3001`). The applications still use their own `.env`
configuration when started by Nx.

Unit tests cover creation, conflicts, missing communities, ownership,
membership counters, module wiring, pagination, resolver forwarding, and DTO
validation. They use a mocked Prisma client and do not require Postgres.
E2E tests cover the real cookie-to-gRPC authentication handoff, public reads,
rejected anonymous and forged-cookie mutations, duplicate slugs, input
validation, pagination, and repeated and concurrent joins/leaves.

Use `npx nx run social:migrate-prisma --name <migration>` to create a future
migration in development. Use `social:deploy-prisma` to apply committed
migrations without creating new ones.
