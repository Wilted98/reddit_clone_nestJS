## What this repository actually contains, right now

Two NestJS applications, `auth` and `social`, each backed by its own Postgres
database. The auth service can:

- Register a user (`createUser` mutation) — validates the input shape,
  hashes the password, persists a row.
- Look a user up by username (`user` query) — returns the public profile
  fields on `User`, never email. New/own-account operations return a distinct
  `Account` type with the caller's email.
- Log in (`login` mutation) — verifies the password, sets an httpOnly JWT
  cookie.
- Log out (`logout` mutation) — clears the cookie.
- Rate-limit login and registration independently per client IP, with
  configurable budgets and an in-memory store per auth process.
- Return the authenticated caller's own profile (`me` query) and update it
  (`updateUser` mutation) — both guarded, both scoped to the token's own
  user id, never a client-supplied one.
- Answer an internal gRPC `Authenticate(token) -> User` call — the hook a
  social service uses to resolve a cookie without ever holding
  `JWT_SECRET` itself.

Social supports community creation/listing, memberships, member-only text/link
posts, bounded author post/comment activity, bounded root/reply comment pages,
author-only editing and soft deletion, voting,
and public HOT/NEW/TOP feeds. It authenticates guarded mutations and private
vote queries over auth's gRPC endpoint. The Next.js frontend implements an
account shell and cookie-based registration/login/logout; social screens and
moderation workflows remain unimplemented.
See [`09-social-service.md`](09-social-service.md) for social operations,
[`07-graphql-api-reference.md`](07-graphql-api-reference.md) for auth's
schema, and [`04-authentication.md`](04-authentication.md) for how the auth
flow works and its history (including a bug that made every guarded
operation unreachable until it was found by testing).

## Repository layout at a glance

```
roorin/
├── apps/
│   └── backend/
│       ├── auth/        users, JWT sessions, and gRPC authentication
│       ├── auth-e2e/    black-box tests against a running `auth`
│       ├── social/      communities, posts, comments, votes, and feeds
│       └── social-e2e/  black-box tests against running auth and social
├── libs/
│   └── backend/
│       ├── nestjs/      shared cross-cutting code (AbstractModel, GqlContext,
│       │                 init(), pagination, and social's gRPC GqlAuthGuard)
│       └── proto/       generated gRPC types from proto/*.proto
├── proto/               auth.proto — the gRPC contract, source of truth
├── docs/                you are here
├── scripts/             init-databases.sh — provisions extra Postgres DBs
└── docker-compose.yaml  local Postgres
```

`apps/frontend/web` is the Next.js App Router client; `apps/frontend/web-e2e`
contains desktop/mobile Playwright tests. The web app runs at
`http://localhost:4200`. GraphQL is available at
`http://localhost:3000/graphql` for auth and `http://localhost:3001/graphql`
for social when the respective services are running.

## Running it

Follow [the root README](../README.md) to install dependencies, configure both
`.env` files, start Docker, deploy migrations, and serve each app in a separate
terminal. See [`07-graphql-api-reference.md`](07-graphql-api-reference.md)
for auth examples and [`09-social-service.md`](09-social-service.md) for social.

## What's next

See [the MVP roadmap](10-mvp-roadmap.md) for small implementation batches.
Public/private profiles, auth rate limits, bounded comment retrieval, profile
activity, and post/comment editing are implemented. The web app supports
account sessions; see [the web technical reference](12-web-foundation.md).
Feed/community browsing, discussions/voting, and profile/editing screens remain
frontend work.
Membership context, community settings, moderation/search, password recovery,
and public-deployment hardening remain planned. Larger feeds
will need a materialized HOT ranking: the current offset cap limits pagination
depth but does not bound the database's computed sort.
