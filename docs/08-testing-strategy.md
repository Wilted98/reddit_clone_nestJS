# 08 — Testing Strategy

## The pyramid used here

Three layers, each testing a different thing, deliberately not overlapping:

| Layer                     | Tests                                                                                    | Real dependencies?     | Run with          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- | ----------------- |
| **Unit — service**        | Business logic: hashing, error translation, argument shape                               | No — Prisma is mocked  | `nx test auth`    |
| **Unit — DTO validation** | The `class-validator` rules themselves, in isolation                                     | No                     | `nx test auth`    |
| **Unit — resolver**       | The resolver forwards the right arguments and returns the service's result, nothing more | No — service is mocked | `nx test auth`    |
| **E2E**                   | The real server, real Postgres, over real HTTP                                           | Yes                    | `nx e2e auth-e2e` |

The rule that keeps these from becoming redundant: **unit tests prove the
logic is correct in isolation; the e2e test proves the pieces are actually
wired together correctly.** Neither substitutes for the other — a unit test
with everything mocked can't catch a wiring mistake (e.g. the missing
`await` bug below, which no mock-based test happened to exercise the right
way to catch), and an e2e test alone would make every edge case slow and
DB-dependent to verify.

## Unit tests

### [`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts)

Mocks `PrismaService` entirely — the test never touches a real database. This
tests the four things `UsersService` is actually responsible for deciding:

- The password is hashed before being handed to Prisma, and the plaintext
  never is.
- A duplicate-field (`P2002`) error becomes a `ConflictException` with the
  right message, for one field, multiple fields, and no field info at all.
- Any other error (a different Prisma code, a plain connection error) is
  rethrown unchanged, not swallowed or miscategorized.
- `getUser` passes its argument through to Prisma's `where` clause unchanged,
  for any unique field, and turns a not-found result into a `NotFoundException`
  rather than an unhandled error.

Three of these tests **initially failed** against the implementation at the
time — not because the tests were wrong, but because they caught real bugs
(a missing `await` defeating a `try/catch`, and a missing not-found mapping).
Both have since been fixed; see
[`04-authentication.md`](04-authentication.md) "Bugs found while testing" for
the full history. The suite is green now, which is the point of having
written the _intended_ behavior as the test rather than adjusting the test to
match whatever the implementation happened to do.

### [`create-user.input.spec.ts`](../apps/backend/auth/src/app/users/dto/create-user.input.spec.ts)

Calls `class-validator`'s `validate()` directly on `CreateUserInput`
instances — no NestJS, no HTTP, no `ValidationPipe`. This proves the
decorators declared on the DTO (username length/character rules, email
format, password strength) are individually correct, independent of whatever
enforces them at the request layer. `main.ts` now also registers a global
`ValidationPipe`, so these rules are enforced end-to-end today — see
[`04-authentication.md`](04-authentication.md) §3 for that history and the
e2e verification of it.

### [`users.resolver.spec.ts`](../apps/backend/auth/src/app/users/users.resolver.spec.ts)

Mocks `UsersService`. Exists specifically to catch the resolver forwarding
the _wrong shape_ of argument — e.g. passing the raw GraphQL args object to
`getUser` instead of `{ username }` — which a service-level test can't see,
since the service test never goes through the resolver at all.

### [`prisma.service.spec.ts`](../apps/backend/auth/src/app/prisma/prisma.service.spec.ts)

Pre-existing, not added as part of this pass — a minimal "the service
constructs" smoke test.

Run all of the above:

```bash
npx nx test auth
```

## End-to-end tests

### [`users.spec.ts`](../apps/backend/auth-e2e/src/users/users.spec.ts)

Boots the real `auth` build against the real Postgres instance
(`docker-compose.yaml`) and drives it over actual HTTP with `axios`, the same
way a real client would. This is where "does the whole thing actually work
when wired together" gets answered — mocks can't answer that question by
construction.

Covers: successful registration and its exact response shape, the schema
refusing to let a client even request the `password` field, looking a user
up by username, an unknown username returning a `404`-shaped error without
crashing the process, and a duplicate email/username returning a `409`-shaped
conflict — all asserting the exact response shapes documented in
[`07-graphql-api-reference.md`](07-graphql-api-reference.md), verified
against the real running server rather than inferred.

Every claim in that file about response shapes was checked against a real
running instance while writing it — not inferred from reading the source —
using the sequence:

```bash
docker compose up -d postgres
npx nx run auth:migrate-prisma --name init
npx nx build auth
node dist/apps/backend/auth/main.js
# then curl http://localhost:3000/graphql with the mutations/queries in question
```

### Known issue: the e2e harness currently cannot run via `nx e2e`

**This blocks `nx e2e auth-e2e` entirely, for every test in the project,
independent of anything in `users.spec.ts`.**

```
apps/backend/auth-e2e/src/support/global-setup.ts:15:14
error TS7017: Element implicitly has an 'any' type because type
'typeof globalThis' has no index signature.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
```

This file is NX's default generated e2e scaffold — nobody hand-wrote it as
part of this project's logic, and it hasn't been touched here. It compiles
under a default (non-strict) `tsconfig`, but this workspace's
[`tsconfig.base.json`](../tsconfig.base.json) sets `"strict": true`, which
this scaffold's pattern (writing an untyped key onto `globalThis`) doesn't
satisfy. The fix is small — type the global explicitly, e.g.
`declare global { var __TEARDOWN_MESSAGE__: string; }` — but changing it
wasn't done here per the constraint this pass was done under (make tests and
docs only, touch nothing else). Until it's fixed, verifying e2e behavior
means running the manual sequence above rather than `nx e2e`.

A second, smaller issue in the same untouched scaffold, worth knowing before
relying on it: `global-teardown.ts` calls `killPort(3000)` unconditionally.
If you happen to have a dev server already running on port 3000 when the e2e
task finishes, this kills it — it doesn't check that the port belongs to the
process this test run started.
