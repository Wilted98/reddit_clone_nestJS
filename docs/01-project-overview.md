## What this repository actually contains, right now

One NestJS application, `auth`, backed by one Postgres database. It can:

- Register a user (`createUser` mutation) — validates the input shape,
  hashes the password, persists a row.
- Look a user up by username (`user` query) — returns the public profile
  fields.
- Log in (`login` mutation) — verifies the password, sets an httpOnly JWT
  cookie.
- Log out (`logout` mutation) — clears the cookie.
- Return the authenticated caller's own profile (`me` query) and update it
  (`updateUser` mutation) — both guarded, both scoped to the token's own
  user id, never a client-supplied one.
- Answer an internal gRPC `Authenticate(token) -> User` call — the hook a
  future second service uses to resolve a cookie without ever holding
  `JWT_SECRET` itself.

Still no other services, no communities/posts/social layer. See
[`07-graphql-api-reference.md`](07-graphql-api-reference.md) for the exact
schema and [`04-authentication.md`](04-authentication.md) for how the auth
flow works and its history (including a bug that made every guarded
operation unreachable until it was found by testing).

## Repository layout at a glance

```
roorin/
├── apps/
│   └── backend/
│       ├── auth/        the one service that exists — see 02-architecture.md
│       └── auth-e2e/    black-box tests against a running `auth`
├── libs/
│   └── backend/
│       ├── nestjs/      shared cross-cutting code (AbstractModel, GqlContext,
│       │                 init(), and a gRPC-calling GqlAuthGuard for future
│       │                 services — see 02-architecture.md)
│       └── proto/       generated gRPC types from proto/*.proto
├── proto/               auth.proto — the gRPC contract, source of truth
├── docs/                you are here
├── scripts/             init-databases.sh — provisions extra Postgres DBs
└── docker-compose.yaml  local Postgres
```

`apps/frontend/` To be implemented. The GraphQL schema is queryable from
the Apollo Sandbox at `http://localhost:3000/graphql` the moment the service
is running, with no client required.

## Running it

```bash
docker compose up -d postgres
```

```bash
npx nx run auth:migrate-prisma --name init
```

```bash
npx nx serve auth
```

Then open `http://localhost:3000/graphql` — Apollo Sandbox lets you run
mutations and queries directly, no separate client needed. See
[`07-graphql-api-reference.md`](07-graphql-api-reference.md) for examples.

## What's next

The social layer (communities, posts, comments, votes, feed) as a second
service, using the gRPC `Authenticate` call and the `GqlAuthGuard` already
sitting in `libs/backend/nestjs` for exactly that purpose. Each doc in this
folder that touches a not-yet-built piece says so explicitly and links to the
design doc that specifies it — nothing here pretends the future is already
built.
