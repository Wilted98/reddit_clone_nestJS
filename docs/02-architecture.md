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
    ├── auth/        the auth service (GraphQL API + gRPC + Postgres)
    ├── auth-e2e/    black-box tests that boot `auth` and hit it over HTTP
    ├── social/      communities, posts, comments, votes, feeds, own Postgres DB
    └── social-e2e/  HTTP tests against both services and real gRPC auth

libs/
└── backend/
    ├── nestjs/      @roorin/nestjs — cross-cutting code every backend
    │                  service imports (AbstractModel, GqlContext, init(),
    │                  pagination, and social's gRPC-calling GqlAuthGuard)
    └── proto/       @roorin/proto — generated gRPC types from proto/*.proto

proto/               auth.proto — the gRPC contract itself, source of truth
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

### `libs/backend/nestjs` is where cross-service code lives — not app-specific code

It exports:

- [`AbstractModel`](../libs/backend/nestjs/src/lib/graphql/abstract.model.ts) —
  the base GraphQL `@ObjectType` every persisted model extends, contributing
  `id` and `createdAt`. Auth's `User` and social's `Community`, `Post`, and
  `Comment` extend it.
- [`GqlContext`](../libs/backend/nestjs/src/lib/graphql/gql-context.interface.ts) —
  the `{ req, res }` shape every service's `GraphQLModule.forRoot` context
  factory returns, so resolvers that need to set a cookie (`login`) or read
  one always see the same typed shape.
- [`init()`](../libs/backend/nestjs/src/lib/init.ts) — shared HTTP bootstrap
  (helmet, CORS, the global `ValidationPipe`, cookie parsing). Every service's
  `main.ts` calls this instead of repeating the same five lines.
- A **gRPC-calling `GqlAuthGuard`** — see "Two guards named the same thing"
  below. Social uses this guard; `auth` doesn't
  use it itself.

The rule for what belongs in this library: **if it would be identical
boilerplate copy-pasted into a second service, it belongs here instead.**
Everything above already meets that bar.

### Two guards named the same thing, on purpose

There are two `GqlAuthGuard` classes in this codebase, and the name
collision is intentional, not an oversight:

- `apps/backend/auth/src/app/auth/guards/gql-auth.guard.ts` — verifies a JWT
  **locally** with Passport. This is `auth`'s own guard, used because `auth`
  is the one service that actually holds `JWT_SECRET`.
- `libs/backend/nestjs/src/lib/guards/gql-auth.guards.ts` — resolves a cookie
  by calling `auth`'s gRPC `Authenticate` endpoint instead of verifying
  anything itself. Social imports this guard for its protected mutations.

Social's `AuthModule` registers the gRPC client for `AUTH_PACKAGE_NAME` and
exports `ClientsModule`, satisfying the shared guard's dependency.

## Authentication across services

Auth owns users, credentials, and session issuance. Social owns its own
database and cannot query auth's tables directly. The request path is:

1. Auth issues a JWT on login, set as an httpOnly `Authentication` cookie.
2. A client sends that cookie to a guarded social mutation or private vote query.
3. The shared `GqlAuthGuard` calls auth's internal `Authenticate(token) -> User`
   gRPC endpoint, then attaches the returned user to the GraphQL request.
4. Social's resolver passes that authenticated identity to its service.

Only auth holds `JWT_SECRET`. The default templates use HTTP ports 3000/3001
and gRPC port 5050. Auth's `GRPC_URL` and social's `AUTH_GRPC_URL` must point
at the same endpoint. Public social reads do not need auth to run; guarded
mutations do. Social E2E tests exercise this network handoff against both
running services.

Social follows the same feature-module layout as auth. `PostsModule` imports
`CommunitiesModule`, which exports `CommunitiesService` for membership checks.
`CommentsModule` imports `PostsModule`, which exports `PostsService` for post
validation. `FeedModule` imports `CommunitiesModule` for community scoping;
`VotesModule` uses `PrismaModule` for transactional vote and score writes.
Each feature that uses the database imports `PrismaModule`.

## Module boundaries

Within `auth`, code is organized by feature, not by technical layer:

```
apps/backend/auth/src/app/
├── users/            feature module: model, DTOs, service, resolver
│   ├── dto/
│   ├── models/
│   ├── users.module.ts
│   ├── users.resolver.ts
│   └── users.service.ts
├── auth/             feature module: login/logout, JWT, guards, the gRPC face
│   ├── dto/
│   ├── strategies/   jwt.strategy.ts — the Passport strategy (see 06)
│   ├── guards/       jwt-auth.guard.ts, gql-auth.guard.ts — auth's OWN
│   │                   local guards (contrast with the shared gRPC one)
│   ├── auth.module.ts
│   ├── auth.resolver.ts   login/logout GraphQL mutations
│   ├── auth.service.ts    password verification, JWT signing/cookie
│   └── auth.controller.ts the gRPC Authenticate handler
├── prisma/           infrastructure module: the database connection
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── app.module.ts      wires the feature modules + GraphQL together
```

`auth/` (the module) depends on `users/` (it calls `UsersService.getUser` to
verify a login and to resolve the gRPC `Authenticate` call) — never the
reverse. `users.resolver.ts`'s guarded fields (`me`, `updateUser`) import
`auth`'s guard and `@CurrentUser()` decorator, which is the one place this
directionality bends: `users` reaches into `auth` for the guard, not the
other way around. Worth knowing before "which module can import which"
becomes a real, enforced rule (see [`05-tech-stack-rationale.md`](05-tech-stack-rationale.md)
on `@nx/enforce-module-boundaries`) — today it's one app with two feature
folders, so nothing stops this, but a clean service split later would need to
either merge `auth`+`users` into one service (likely, since they're this
entangled) or introduce the same gRPC indirection between them that a real
social service already uses.

`users.module.ts` imports `PrismaModule` and exports `UsersService` — so
anything that needs "look up a user" imports `UsersModule`, not
`PrismaService` directly. This is the seam a future service split would cut
along: `users/` is a candidate to become its own thing (or stay), independent
of how `prisma/` evolves.

See [`06-nestjs-concepts.md`](06-nestjs-concepts.md) for what a "module" is
doing here mechanically (dependency injection, providers, exports) using
these exact files as the example.
