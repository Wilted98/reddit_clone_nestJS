## What this repository actually contains, right now

One NestJS application, `auth`, backed by one Postgres database. It can:

- Register a user (`createUser` mutation) — validates the input shape,
  hashes the password, persists a row.
- Look a user up by username (`user` query) — returns the public profile
  fields.

That's it. No login, no JWT issuance, no sessions, no other services. See
[`07-graphql-api-reference.md`](07-graphql-api-reference.md) for the exact
schema and [`04-authentication.md`](04-authentication.md) for what
authentication does and does not do yet.

## Repository layout at a glance

```
roorin/
├── apps/
│   └── backend/
│       ├── auth/        the one service that exists — see 02-architecture.md
│       └── auth-e2e/    black-box tests against a running `auth`
├── libs/
│   └── nestjs/          shared cross-cutting code (currently: AbstractModel)
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

Login/JWT next, then the social
layer (communities, posts, comments, votes, feed) as a second service. Each
doc in this folder that touches a not-yet-built piece says so explicitly and
links to the design doc that specifies it — nothing here pretends the future
is already built.
