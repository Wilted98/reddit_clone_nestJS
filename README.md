# Roorin - Reddit-inspired full-stack application built primarily to learn and explore NestJS

Nx monorepo with two NestJS backends: `auth` owns users, JWT sessions, and
internal gRPC authentication; `social` owns communities, memberships, posts,
paginated comment threads, profile activity, author-only content editing,
voting, and HOT/NEW/TOP feeds. Each service has its own
PostgreSQL database and Prisma client. A Next.js web app now implements the
cookie-based account sessions, public feeds with sorting/pagination,
community browsing, text/link posting, bounded discussions/replies, and voting.
Feed cards include community labels and voting; the sidebar separates recent
community visits from authenticated subscriptions.
Public profiles include paginated activity and own-account bio/avatar settings.
Authors can edit/delete their own posts and comments from discussions and profile activity.
Moderation workflows are not implemented yet.

## Local setup

Use Node.js 24 LTS (see `.nvmrc`), or 22.15+ within 22.x, npm, Docker with
Compose, and the Protocol Buffers compiler (`protoc`) on your `PATH`.
The frontend codegen tools require the newer Node patch. From the repository root:

```bash
npm ci
cp apps/backend/auth/.env.example apps/backend/auth/.env
cp apps/backend/social/.env.example apps/backend/social/.env
npm run codegen
docker compose up -d postgres
docker compose ps
```

Set a private `JWT_SECRET` in auth's `.env`. The templates configure auth HTTP
on port 3000, social HTTP on 3001, and auth gRPC on 5050. Social's
`AUTH_GRPC_URL` must match auth's `GRPC_URL`; social does not need `JWT_SECRET`.
Both local `.env` paths are listed in `.gitignore`. Auth's `.env` was already
tracked in this checkout: ignore rules do not untrack it, so remove it from
version control before publishing secrets (keep the local file). Wait for Postgres to be healthy, then generate
the backend clients, apply both services' migrations, and load fictional demo data:

```bash
npm run db:setup
```

Docker initializes `roorin_auth` and `roorin_social` on the first startup of
the volume. If you already have an older volume without the social database,
create it once before migrating:

```bash
docker compose exec postgres createdb -U roorin roorin_social
```

Start both backend services together:

```bash
npm run dev:backend
```

Or run `npm run dev:auth` and `npm run dev:social` in separate terminals.
Once environment files and migrated databases are ready, start both backends
and the web app together with:

```bash
npm start
```

`npm start` is an alias for `npm run dev`, not a production deployment command.
Run `npm run stop` before switching startup commands to avoid port conflicts.
It stops this checkout's Node/Nx processes, including web and backend watchers,
without stopping other projects or Docker. `npm run stop -- --dry-run` previews
the targets; `npm run stop:all` also stops this project's Compose Postgres service
without deleting its volume. These stop commands support macOS and Linux.
Generation runs before startup; `npm ci` does not run
project codegen because fresh installs may not have environment files or `protoc` yet.
`npm run codegen` generates gRPC contracts, both Prisma clients, and web GraphQL
documents. Prisma generation bypasses Nx's cache so clients inside
`node_modules` are recreated after a clean install. Generation does not migrate
databases or require running APIs; web generation uses committed schema snapshots.

GraphQL endpoints are `http://localhost:3000/graphql` (auth) and
`http://localhost:3001/graphql` (social). Public social queries do not require
auth to run. Guarded social mutations and private vote queries require auth's gRPC endpoint and the
`Authentication` cookie returned by login.

Demo login: `alex@roorin.example` / `RoorinDemo2026!` (all 12 seeded accounts
share this development-only password). `npm run db:seed` adds the demo dataset
without duplicating its records. To replace **all local auth/social records**:

```bash
npm run stop
npm run db:reset -- --confirm
npm run db:seed
npm start
```

Back up data you need first. Database scripts refuse production, remote hosts,
unexpected database names, query overrides, and an inherited root `DATABASE_URL`.
Seeding is explicit, not part of installation or startup. Never deploy demo accounts.
Use `npm run db:migrate` for migrations without seeding.
See [local development and demo data](docs/19-local-development-and-demo-data.md)
for dataset contents, reset safety, and repeat-run behavior.

Stop Postgres with `docker compose down`; this preserves its volume.

## Web app

With social running for public browsing and auth running for account operations,
start the web app from the repository root:

```bash
npm run dev:web
```

Open `http://localhost:4200`; both backend CORS templates already allow this
origin. Home is the public feed; `/communities` lists communities,
`/r/[slug]` opens a community feed, `/posts/[id]` opens its discussion,
`/submit` creates posts, and `/account` handles account sessions.
`/u/[username]` shows public profiles and activity; `/account#profile-settings`
opens the caller's bio/avatar editor. Public profiles never display account email.
The frontend uses the existing httpOnly auth cookie, not a separate
auth system or localStorage tokens. Endpoint overrides are documented in
`apps/frontend/web/.env.example`; put local values in `.env.local`.
Auth's template sets a seven-day absolute JWT/cookie lifetime. Keep `JWT_SECRET`
stable across restarts; changing it invalidates sessions. Temporary API failures
preserve an already confirmed frontend account, but confirmed unauthorized
responses clear it. No refresh tokens or sliding expiration are implemented.

For a production web build/start (with appropriately configured backend APIs):

```bash
npm run build:web
npm run start:web
```

`start:web` serves the production app on port 4200 and runs its Nx build
dependency first. `npm run build` builds all three applications; it does not
start services or apply migrations. See [production web setup](docs/12-web-foundation.md#production-build-and-start)
for endpoint, HTTPS, CORS, and cookie configuration.

```bash
npx nx run-many -t lint,typecheck,test,build -p web
npx playwright install chromium
npm run test:e2e:web
```

Codegen/build/unit tests use committed schema snapshots and do not need live
APIs. Refresh them after backend schema changes with `nx run web:schema`,
then `nx run web:codegen`. Default browser tests mock auth and social; optional
`nx run web-e2e:e2e-live` verifies real auth cookies, public social browsing,
and an isolated post/comment/vote workflow
against the local APIs/databases. See [web setup](docs/12-web-foundation.md)
and [feed/community behavior](docs/13-web-feeds-and-communities.md).
Posting, bounded replies, and vote-state handling are documented in
[web discussions](docs/14-web-posts-discussions-and-voting.md).
Public profile, activity pagination, and account editing contracts are in
[web profiles and settings](docs/15-web-profiles-and-settings.md).
Author controls, confirmation, and mutation failure handling are documented in
[web content editing and deletion](docs/16-web-content-editing-and-deletion.md).
Authenticated community creation is available from the directory; see
[web community creation](docs/17-web-community-creation.md).

`/communities/joined` lists your memberships with owner protection and confirmed
Leave actions; see [web memberships](docs/18-web-community-memberships.md).

## VPS deployment

The production Docker stack runs the web app, both APIs, Postgres, and an HTTPS
reverse proxy. It is separate from local Compose and never seeds or resets data.
See [VPS deployment](docs/20-vps-deployment.md) for DNS/firewall configuration,
private configuration, laptop-built images for small servers, startup, backups,
and automatic `main` deployments using GitHub Actions. The workflow builds on
GitHub and deploys over verified SSH after tests pass; see its
[one-time setup](docs/20-vps-deployment.md#automatic-deployment-with-github-actions).
`npm start` remains a development command.

## Verification

Run commands from the repository root:

| Command                                          | Scope                                        | Runtime requirements                                  |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| `npm test`                                       | Auth, social, and web unit/integration tests | No running APIs or database                           |
| `npm run test:backend`                           | Auth and social unit/integration tests       | No running APIs or database                           |
| `npm run test:auth` / `test:social` / `test:web` | One application's unit/integration tests     | No running APIs or database                           |
| `npm run test:coverage`                          | Unit/integration suites with coverage        | No running APIs or database                           |
| `npm run test:scripts`                           | Stop, database guards/reset, and seed tests  | No APIs or database; macOS/Linux process tools        |
| `npm run test:e2e:backend`                       | Auth then social API E2E                     | Migrated Postgres databases; Nx starts APIs           |
| `npm run test:e2e:auth` / `test:e2e:social`      | One API E2E suite                            | Migrated database(s); Nx starts APIs                  |
| `npm run test:e2e:web`                           | Mocked desktop/mobile browser tests          | Playwright Chromium; no APIs or database              |
| `npm run test:e2e:web:live`                      | Live browser smoke tests                     | Playwright Chromium, running APIs, migrated databases |
| `npm run test:e2e`                               | API E2E, then mocked browser tests           | Migrated databases and Playwright Chromium            |

Backend test shortcuts regenerate gRPC contracts and Prisma clients; configure
backend `.env` files and `protoc` first, even for database-free unit tests.
Web-only shortcuts use committed GraphQL snapshots and need neither.
Install browser binaries once with `npx playwright install chromium`.
Coverage reports are written under `coverage/`. `npm test` deliberately does
not include E2E; `test:e2e` deliberately excludes the live browser suite,
which requires manually running APIs instead of Nx-managed E2E servers.

Apply new committed migrations after switching branches or pulling updates.
Social E2E starts the services but does not migrate its database:

```bash
npx nx run social:deploy-prisma
npx nx run-many -t lint -p auth,social,auth-e2e,social-e2e
npm run test:backend
npm run test:e2e:backend
```

Unit specs use mocks and do not require Postgres. E2E tests need both databases
migrated and create unique test records. Nx manages the required service
processes; both E2E targets use `auth:serve-e2e`, which raises auth budgets
to 1000 for test fixtures only. `social-e2e` also starts social. Normal
`nx serve auth` defaults remain 10 logins and 5 registrations per IP within
60 seconds; optional overrides are in auth's `.env.example`. Do not deploy
the E2E server target. Low-limit HTTP integration tests run with `nx test auth`.
Run E2E targets separately with normal development servers stopped to avoid
port conflicts. The combined API shortcut runs the two suites sequentially
to avoid sharing server ports between concurrent Nx invocations.

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
nullable `editedAt` tracks edits independently of votes and counters. Ensure
the committed social migrations are deployed before serving/testing. See
[the editing contract](docs/09-social-service.md#content-editing).

The core discussion API is ready for further frontend development, not a claim
that every backend or public-deployment task is finished. Start with
[the frontend handoff](docs/11-frontend-handoff.md); membership context/settings,
moderation/search, and password recovery remain on the roadmap.
