# 05 — Tech Stack Rationale

Every non-obvious choice below, with what else was on the table and why it
lost. Choices that are really about _this project's data model_ rather than
_the stack_ (cuid, database-per-service, bcrypt cost factor) live in
[`03-database-design.md`](03-database-design.md) and
[`04-authentication.md`](04-authentication.md) instead — this doc is
specifically about the frameworks and libraries.

## NX — the monorepo tool

**Alternatives considered:** a plain npm/pnpm workspace with no task
orchestration, Turborepo, or simply separate repositories per service.

NX earns its place here for three concrete things, none of which are "just
nice to have" once there's more than one service:

1. **Affected-based tasks.** `nx affected -t test` runs tests only for
   projects a change actually touches. Irrelevant with one app; decisive once
   there are five and a change to one shouldn't re-run the other four's
   suites on every commit.
2. **Enforced module boundaries.** The `@nx/enforce-module-boundaries` ESLint
   rule (configured in [`eslint.base.config.mjs`](../eslint.base.config.mjs))
   can make "service A must never import service B's internals" a build
   failure, not a code-review hope. Not yet configured with real constraints
   (there's only one app to constrain), but the mechanism is there and will
   matter the moment a second service exists.
3. **Generators.** `nx g @nx/nest:app <name>` scaffolds a new service with a
   consistent project.json/tsconfig/webpack setup in one command — the same
   scaffold `auth` itself came from, so every future service starts from
   the same known-good shape.

Separate repos per service would give up shared tooling config and make
cross-service refactors (like the future auth-client library every service
will need) require publishing a package instead of just importing a lib.
That trade only makes sense at an org size this project isn't at.

## NestJS — the application framework

**Alternatives considered:** raw Express/Fastify, or a lighter framework
like Koa.

NestJS's opinions are exactly the ones this project wants enforced
structurally rather than by convention:

- **Modules force explicit dependencies.** `UsersModule` importing
  `PrismaModule` (see [`06-nestjs-concepts.md`](06-nestjs-concepts.md)) means
  the dependency graph is declared, not implicit in whatever files happen to
  `require()` each other. That matters a lot more once "which module can
  reach which" is a real architectural rule instead of a suggestion.
- **First-class GraphQL and gRPC support**, from the same framework, using
  the same DI system. The plan in
  [`02-architecture.md`](02-architecture.md) has every service exposing
  GraphQL to clients and gRPC to other services — NestJS supports both without
  reaching for a different framework per protocol.
- **Decorators as the validation/DI/GraphQL-schema mechanism** are more
  verbose up front than plain functions, but they're what make
  [`06-nestjs-concepts.md`](06-nestjs-concepts.md)'s "the code IS the
  documentation" argument (e.g. `@IsStrongPassword()` on a DTO field) actually
  true — the constraint lives exactly where the field is declared.

Raw Express would mean rebuilding dependency injection, module boundaries,
and request validation wiring by hand, or picking three separate libraries
and gluing them together — for what this project needs, that's work NestJS
already did, tested, and documented.

## GraphQL (code-first) over REST

**Alternatives considered:** REST, or GraphQL in **schema-first** mode
(hand-written `.graphql` SDL files, with resolvers implementing them).

**Why GraphQL over REST at all:** the eventual clients (web, mobile) fetch
composite views — a profile, its posts, its comments — in one request rather
than chaining several REST calls. That's the entire point of GraphQL's
existence, and it's exactly this project's shape per
[`Roorin_design/02-FRONTEND-WEB.md`](../../Roorin_design/02-FRONTEND-WEB.md).
For a single flat `User` today it doesn't show its value yet — it will the
moment a query needs a user _and_ their posts _and_ their communities in one
round-trip.

**Why code-first, not schema-first:** in this codebase, the schema is
_generated from_ TypeScript classes —
[`user.model.ts`](../apps/backend/auth/src/app/users/models/user.model.ts)'s
`@ObjectType()` / `@Field()` decorators, wired up via
`GraphQLModule.forRoot({ autoSchemaFile: true })` in
[`app.module.ts`](../apps/backend/auth/src/app/app.module.ts) — rather than
the schema being a separate `.graphql` file that resolvers must be kept in
sync with by hand. One source of truth: change a field on the class, the
schema changes with it, and TypeScript catches a mismatched resolver at
compile time. Schema-first's advantage — a schema reviewable by non-Node
teammates, independent of implementation — doesn't apply to a
single-developer/single-language backend the way it would to a larger,
polyglot team.

**Apollo Server 5**, via `@nestjs/apollo` and `@as-integrations/express5`,
is the GraphQL execution layer underneath — the current de facto standard for
Node GraphQL servers, with first-party NestJS integration.

## Prisma — the ORM

**Alternatives considered:** TypeORM, Drizzle, or raw SQL with a query
builder like Kysely.

- **Type-safe queries generated from the schema**, not hand-maintained
  entity classes. `schema.prisma` is the single source of truth for both the
  database shape and the TypeScript types `PrismaClient` exposes — see
  [`03-database-design.md`](03-database-design.md).
- **Migrations as a first-class, reviewable artifact.** `prisma migrate dev`
  produces plain SQL files checked into git (see the one that exists today),
  not an ORM-internal format you have to trust blindly.
- **Driver adapters (Prisma 7)** — `@prisma/adapter-pg`, covered in
  [`03-database-design.md`](03-database-design.md) — decouple the client from
  a bundled connection engine, which matters for deployment flexibility later.

Drizzle is the closest modern competitor and arguably has a lighter runtime
footprint; Prisma won here mainly for the maturity of its migration tooling
and the ecosystem around driver adapters specifically for a
Postgres-per-service setup. TypeORM's Active Record / Data Mapper patterns
tend to blur the "service owns its own data access" boundary this project
cares about (see database-per-service in
[`02-architecture.md`](02-architecture.md)) more than Prisma's generated
client does.

## PostgreSQL

Relational, with real foreign keys and unique constraints (`User.email`,
`User.username` — see the migration SQL in
[`03-database-design.md`](03-database-design.md)) doing actual integrity
enforcement at the database layer, not just in application code. The
product's data (users, and later posts/comments/votes/communities) is
inherently relational — a document store would mean reimplementing joins and
constraints that Postgres already does correctly. `docker-compose.yaml` runs
Postgres 16 locally; nothing here depends on a specific managed cloud
offering yet.

## class-validator + class-transformer

Validation rules live as decorators directly on the DTO class
(`CreateUserInput`) rather than in a separate schema (Joi, Zod) or hand-written
`if` statements in the resolver. The property being validated and its rule
are the same line of code — see
[`04-authentication.md`](04-authentication.md) for the current gap where this
declared validation isn't yet wired up to actually run.

## Jest + ts-jest

NX's default test runner for Node/NestJS projects, with first-class
`@nestjs/testing` support (`Test.createTestingModule`) for constructing a
real DI container in unit tests with specific providers mocked — see
[`08-testing-strategy.md`](08-testing-strategy.md) for how that's used here.

## bcryptjs and cuid

Covered where they're used, not here:
[`04-authentication.md`](04-authentication.md) for bcryptjs and the cost
factor, [`03-database-design.md`](03-database-design.md) for `cuid`. Splitting
those out from this doc is deliberate — they're decisions about _this
project's data and security model_, not about the framework/library stack in
the abstract.
