# 02 — Architecture

## The workspace shape

This is an [NX](https://nx.dev) monorepo. NX's job here is narrow and
specific: let this repo hold many independently-deployable Node
applications, each with its own build/test/lint pipeline, while sharing code
through explicit, dependency-checked libraries rather than copy-paste or
loose relative imports across app boundaries. Why NX specifically (versus a
plain multi-package repo, Turborepo, or separate repos) is covered in
[`05-tech-stack-rationale.md`](05-tech-stack-rationale.md) — this doc is about
_how_ the workspace is organized, not _why NX_.

```
apps/
└── backend/
    ├── auth/        the auth service (GraphQL API + Postgres)
    └── auth-e2e/    black-box tests that boot `auth` and hit it over HTTP

libs/
└── nestjs/          @roorin/nestjs — cross-cutting code every backend
                       service will import (currently: AbstractModel)
```

Two things about this layout are deliberate and will matter more as the
project grows:

### `apps/backend/` is a real, load-bearing prefix

Every backend service lives under `apps/backend/<name>`. When a frontend
client is added, it goes under `apps/frontend/<name>` — a sibling, not a
peer scattered flatly into `apps/`. This means the moment you look at
`apps/`, you know which side of the network boundary any given folder is on,
without opening it. That distinction gets more valuable, not less, as more
services and clients are added — a flat `apps/auth`, `apps/social`,
`apps/web`, `apps/mobile` list stops reading clearly the moment there are more
than two or three entries.

**Folder path is not the same thing as project name.** `apps/backend/auth`'s
NX project is named `auth` — that's what you type: `nx serve auth`,
`nx test auth`. The nesting organizes the filesystem; it does not change how
you address the project in commands or in `nx graph`.

### `libs/nestjs` is where cross-service code will live — not app-specific code

Right now it exports exactly one thing:
[`AbstractModel`](../libs/nestjs/src/lib/graphql/abstract.model.ts) — the base
GraphQL `@ObjectType` every persisted model extends, contributing `id` and
`createdAt`. `User` (in `auth`) extends it; every future model in every future
service will too.

The rule for what belongs in this library: **if it would be identical
boilerplate copy-pasted into a second service, it belongs here instead.**
`AbstractModel` already meets that bar (a second service's model would need
the exact same two fields). A guard that calls another service over gRPC to
authenticate a request would meet that bar too, the day a second service
exists — see "Where this is heading" below.

## Why one service today, and what happens when there's a second

`auth` currently does two things a growing system would eventually split:
owning user identity, and (later) owning credentials/session issuance. That's
fine _now_, because there's only one service and nothing to split it from.
The moment a second service (say, a `social` service for posts and
communities) needs to know "who is this request from?", a real architectural
decision shows up: that second service cannot query `auth`'s database
directly (see [`03-database-design.md`](03-database-design.md) on
database-per-service), so it has to ask `auth` over the network.

The plan for that — already reflected in the dependencies sitting unused in
`package.json` (`@nestjs/microservices`, `@grpc/grpc-js`, `@nestjs/jwt`,
`passport-jwt`) — is:

1. `auth` issues a JWT on login, set as an httpOnly cookie.
2. `auth` also exposes a small internal gRPC service:
   `Authenticate(token) -> User`. Only other backend services call this,
   never a client.
3. Every other service registers a gRPC client for that one call, wrapped in
   a guard, so a resolver can require an authenticated user without knowing
   anything about JWTs — it just asks `auth`.
4. That guard-plus-client-registration is exactly the kind of "identical
   boilerplate in every service" `libs/nestjs` exists for — it gets written
   once there and imported everywhere, never copy-pasted per service.

None of this exists yet. It's documented here so the _reason_ those
dependencies are already installed is on record, and so the first person to
add a second service isn't guessing at the intended shape.

## Module boundaries

Within `auth`, code is organized by feature, not by technical layer:

```
apps/backend/auth/src/app/
├── users/            feature module: model, DTO, service, resolver
│   ├── dto/
│   ├── models/
│   ├── users.module.ts
│   ├── users.resolver.ts
│   └── users.service.ts
├── prisma/           infrastructure module: the database connection
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── app.module.ts      wires the feature modules + GraphQL together
```

`users.module.ts` imports `PrismaModule` and exports `UsersService` — so
anything that needs "look up a user" imports `UsersModule`, not
`PrismaService` directly. This is the seam a future service split would cut
along: `users/` is a candidate to become its own thing (or stay), independent
of how `prisma/` evolves.

See [`06-nestjs-concepts.md`](06-nestjs-concepts.md) for what a "module" is
doing here mechanically (dependency injection, providers, exports) using
these exact files as the example.
