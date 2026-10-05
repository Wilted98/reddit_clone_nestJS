# Roorin

Nx monorepo with two NestJS backends: `auth` owns users, JWT sessions, and
internal gRPC authentication; `social` owns communities, memberships, posts,
paginated comment threads, profile activity, author-only content editing,
voting, and HOT/NEW/TOP feeds. Each service has its own
PostgreSQL database and Prisma client. A Next.js web app now implements the
cookie-based account sessions, public feeds with sorting/pagination, and
community browsing. Discussion, voting, profile/editing screens, and moderation
workflows are not implemented yet.

## Local setup

Use Node.js 24 LTS (see `.nvmrc`), or 22.15+ within 22.x, npm, and Docker with
Compose. The frontend codegen tools require the newer Node patch. From the repository root:

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
auth to run. Guarded social mutations and private vote queries require auth's gRPC endpoint and the
`Authentication` cookie returned by login.

Stop Postgres with `docker compose down`; this preserves its volume.

## Web app

With social running for public browsing and auth running for account operations,
start the web app from the repository root:

```bash
npx nx dev web
```

Open `http://localhost:4200`; both backend CORS templates already allow this
origin. Home is the public feed; `/communities` lists communities,
`/r/[slug]` opens a community feed, and `/account` handles account sessions.
The frontend uses the existing httpOnly auth cookie, not a separate
auth system or localStorage tokens. Endpoint overrides are documented in
`apps/frontend/web/.env.example`; put local values in `.env.local`.

```bash
npx nx run-many -t lint,typecheck,test,build -p web
npx playwright install chromium
npx nx e2e web-e2e
```

Codegen/build/unit tests use committed schema snapshots and do not need live
APIs. Refresh them after backend schema changes with `nx run web:schema`,
then `nx run web:codegen`. Default browser tests mock auth and social; optional
`nx run web-e2e:e2e-live` verifies real auth cookies and public social browsing
against the local APIs/databases. See [web setup](docs/12-web-foundation.md)
and [feed/community behavior](docs/13-web-feeds-and-communities.md).

## Verification

Apply new committed migrations after switching branches or pulling updates.
Social E2E starts the services but does not migrate its database:

```bash
npx nx run social:deploy-prisma
npx nx run-many -t lint -p auth,social,auth-e2e,social-e2e
npx nx run-many -t test,build -p auth,social
npx nx e2e auth-e2e
npx nx e2e social-e2e
```

Unit specs use mocks and do not require Postgres. E2E tests need both databases
migrated and create unique test records. Nx manages the required service
processes; both E2E targets use `auth:serve-e2e`, which raises auth budgets
to 1000 for test fixtures only. `social-e2e` also starts social. Normal
`nx serve auth` defaults remain 10 logins and 5 registrations per IP within
60 seconds; optional overrides are in auth's `.env.example`. Do not deploy
the E2E server target. Low-limit HTTP integration tests run with `nx test auth`.
Run E2E targets separately with normal development servers stopped to avoid
port conflicts.

## Documentation

Start with [the documentation index](docs/README.md). See
[the social service guide](docs/09-social-service.md) for operations, membership
rules, soft deletion, and test setup, and
[the testing strategy](docs/08-testing-strategy.md) for test responsibilities.
Public `user(username)` returns `User` without email; account operations
return `Account` with the caller's own email. See [the auth API reference](docs/07-graphql-api-reference.md)
for this breaking contract change and [the MVP roadmap](docs/10-mvp-roadmap.md)
for the next one-or-two-feature batches.

`comments` now returns `CommentPage` (`items`, `nextCursor`, `hasMore`), not
a whole tree. Use `parentId` to load direct replies and `hasReplies` to
identify expandable comments. The recursive `replies` field is removed;
see [the comment API migration notes](docs/09-social-service.md#bounded-comment-retrieval).

Profiles now have bounded `postsByAuthor` and `commentsByAuthor` activity.
`updatePost` and `updateComment` edit only the caller's own live content;
nullable `editedAt` tracks edits independently of votes and counters. Apply
the new social migration before serving/testing this branch. See
[the editing contract](docs/09-social-service.md#content-editing).

The core discussion API is ready for further frontend development, not a claim
that every backend or public-deployment task is finished. Start with
[the frontend handoff](docs/11-frontend-handoff.md); membership context/settings,
moderation/search, and password recovery remain on the roadmap.
