# 03 — Database Design

## The schema, today

[`apps/backend/auth/prisma/schema.prisma`](../apps/backend/auth/prisma/schema.prisma)
defines exactly one model:

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String   @unique
  password  String
  avatarUrl String?
  bio       String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Field-by-field, with the reasoning:

| Field                                | Why it's shaped this way                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id String @default(cuid())`         | See "Why `cuid`, not auto-increment" below.                                                                                                                                                                                                  |
| `username String @unique`            | The public handle. Unique so `user(username)` lookups are unambiguous.                                                                                                                                                                       |
| `email String @unique`               | Login identifier (once login exists). Unique so a person can't register twice with the same email.                                                                                                                                           |
| `password String`                    | **The hash, never the plaintext.** See [`04-authentication.md`](04-authentication.md). The field is named `password`, not `passwordHash` — worth knowing if you go looking for it, though `passwordHash` would arguably be the clearer name. |
| `bio String?`                        | Nullable, freeform. No update mutation exists yet to set it — the column exists ahead of the feature.                                                                                                                                        |
| `createdAt DateTime @default(now())` | Set once, by Postgres, at insert time.                                                                                                                                                                                                       |
| `updatedAt DateTime @updatedAt`      | Prisma sets this automatically on every `update()` call. Note: `createUser` only ever `create()`s, so today this is always equal to `createdAt` — it will start diverging the moment an update path (e.g. editing `bio`) exists.             |

Two columns exist for functionality that isn't built yet (`avatarUrl`,
`bio`'s update path). That's a deliberate, cheap bet: adding a nullable
column to an empty table later is a trivial migration; the cost of having it
one migration early is zero.

## Why `cuid`, not auto-increment integers

`@default(cuid())` generates a globally unique, non-sequential, sortable
string ID (e.g. `cmt8mt4k800004au4q0cb4553`) instead of Postgres's default
auto-incrementing integer. Two reasons this matters more than it might look:

1. **IDs are not enumerable.** With integer IDs, `/u/1`, `/u/2`, `/u/3`
   trivially exist and can be scraped. A `cuid` reveals nothing about how many
   users exist or in what order — it's not a security boundary on its own,
   but it removes a free enumeration vector for zero cost.
2. **They survive a database split.** [`02-architecture.md`](02-architecture.md)
   describes services eventually owning separate databases. If two services
   each had integer primary keys starting at 1, merging or cross-referencing
   data between them later would collide. `cuid`s generated independently
   never collide, so an ID minted by `auth` today stays valid and unique
   forever, no matter how many databases the system grows into.

## Migrations

The workflow, using the NX targets already defined in
[`apps/backend/auth/project.json`](../apps/backend/auth/project.json):

```bash
# after changing schema.prisma:
npx nx run auth:migrate-prisma --name <describe-the-change>
```

This runs `prisma migrate dev` from `apps/backend/auth`, which:

1. Diffs `schema.prisma` against the migration history.
2. Writes a new folder under `prisma/migrations/<timestamp>_<name>/` containing
   the raw SQL.
3. Applies it to the database at `DATABASE_URL`.
4. Regenerates the Prisma Client.

The one migration that exists today,
[`20260825170838_init`](../apps/backend/auth/prisma/migrations/20260825170838/migration.sql),
is exactly the `CREATE TABLE` + two `CREATE UNIQUE INDEX` statements you'd
expect from the schema above — worth opening once so "a migration" stops
being an abstract idea and is just SQL you can read.

**Migrations are checked into git.** They are the source of truth for how the
schema evolved; never edit an already-applied migration file by hand, and
never delete one that's been applied anywhere other than your own untouched
local database.

## The Prisma Client and the adapter-pg pattern

[`prisma.service.ts`](../apps/backend/auth/src/app/prisma/prisma.service.ts)
does this:

```ts
const adapter = new PrismaPg({ connectionString: url });
this.prisma = new PrismaClient({ adapter });
```

Prisma 7 uses **driver adapters** rather than bundling its own connection
engine — `@prisma/adapter-pg` wraps the standard `pg` driver. Practically,
this means: Prisma Client talks to Postgres exactly the way any other
Node `pg`-based tool would, which matters for connection pooling behavior and
for eventually running on platforms that need a specific driver (e.g.
serverless environments with connection limits). For this project today, the
main implication is simpler: `DATABASE_URL` is read directly from
`process.env` in the service's constructor, so the environment variable must
be set before the process starts (see the `.env` note below).

The generated client is written to
`node_modules/@prisma-clients/roorin-auth/` (configured via schema.prisma's
`generator client { output = ... }` block), not the default
`node_modules/@prisma/client`. This is **not** cosmetic: once a second
service with its own schema exists, each service's generated client needs
its own home, or the second `prisma generate` would overwrite the first.
`@prisma-clients/<service-name>` is the namespace that keeps them apart —
already anticipating the multi-service future described in
[`02-architecture.md`](02-architecture.md), even though there's only one
consumer of it today.

## Environment and local setup

`DATABASE_URL` lives in `apps/backend/auth/.env` (gitignored;
`.env.example` in the same folder is the committed template). Locally, it
points at the `roorin_auth` Postgres database started by
`docker-compose.yaml`, provisioned by
[`scripts/init-databases.sh`](../scripts/init-databases.sh) on the
container's first boot.

## Database-per-service (the plan, not yet exercised)

There is only one database today, so "database-per-service" is currently a
statement of intent rather than something you can observe. The intent: when
a second service is added, it gets its **own** Postgres database (not a
second schema in the same one, not shared tables), and the two services never
run a SQL query against each other's tables — only ever talk over the network
(see [`02-architecture.md`](02-architecture.md) "Where this is heading"). The
`cuid` choice above and the per-service generated-client namespace both exist
specifically so that boundary is cheap to hold once it's real.
