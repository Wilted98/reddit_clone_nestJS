# 08 — Testing Strategy

## The pyramid used here

Five layers, each with a different responsibility. Some workflows appear at
multiple layers, but each layer verifies a different contract:

| Layer                            | Tests                                                                         | Real dependencies?                                                   | Run with                                |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| **Unit — service**               | Business logic: hashing, permissions, validation, counters, pagination        | No — Prisma is mocked                                                | `nx test auth` / `nx test social`       |
| **Unit — DTO validation**        | The `class-validator` rules and selected whitelist behavior                   | No                                                                   | `nx test auth` / `nx test social`       |
| **Unit — resolver / controller** | The adapter forwards arguments and authenticated identity                     | No — service and guard are mocked                                    | `nx test auth` / `nx test social`       |
| **Integration — module wiring**  | Nest constructs real module providers and resolves imported/exported services | Auth: real Passport/JWT, mocked DB; social: mocked DB/services/guard | `nx test auth` / `nx test social`       |
| **E2E**                          | The running API, Postgres, HTTP, and social's gRPC authentication handoff     | Yes                                                                  | `nx e2e auth-e2e` / `nx e2e social-e2e` |

The rule that keeps these from becoming redundant: **unit tests prove the
logic is correct in isolation; the integration test proves a specific piece
of module wiring is actually connected; the e2e test proves the whole system
is wired together correctly end to end.** None substitutes for the others —
a unit test with everything mocked can't catch a wiring mistake (the
`JwtStrategy` registration bug below is exactly that: every unit test around
it passed while the feature was completely broken), and an e2e test alone
would make every edge case slow and DB-dependent to verify.

## Unit tests

### Profile privacy and authentication rate limits

- [`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts)
  verifies public lookups select only public fields. Resolver specs verify
  that `user` takes the public path while `me` remains caller-scoped.
- [`rate-limit.module.spec.ts`](../apps/backend/auth/src/app/rate-limit/rate-limit.module.spec.ts)
  uses the real module, guard, and storage with fake timers. It covers
  independent IP/operation budgets, concurrent attempts, block recovery,
  per-client expiry isolation, idle-record cleanup, defaults, and invalid
  startup configuration.
- [`auth-api.spec.ts`](../apps/backend/auth/src/app/rate-limit/auth-api.spec.ts)
  is HTTP integration coverage: the real app, schema, guards, JWT cookies,
  and validation pipe, with only persistence mocked. Low budgets verify
  structured `429` errors and `Retry-After`, alias accounting, spoofed
  forwarding headers, rejection before database writes, and public/private
  schema access including aliases and fragments.
- [`profile-privacy.spec.ts`](../apps/backend/auth-e2e/src/users/profile-privacy.spec.ts)
  verifies the contract against real Postgres for anonymous and signed-in
  callers, and proves each account sees only its own private fields.

Functional E2E runs start `auth:serve-e2e` instead of ordinary `auth:serve`.
That target raises both auth budgets to 1000 for fixture setup; it does not
disable throttling. Normal development/production limits are unchanged.
When running functional E2E manually against an existing server, use a
dedicated test instance with sufficient fixture budgets. Never deploy that
test target. Low-limit integration tests still run with `nx test auth`.

### Social specs and E2E ownership

Keeping colocated `*.service.spec.ts` and `*.resolver.spec.ts` alongside
`auth-e2e` and `social-e2e` is intentional. Services test business rules with
mocked database calls; resolvers test argument and identity forwarding with
mocked services. DTO specs cover input boundaries, including inherited
comment pagination defaults/limits. `ranking.spec.ts` checks HOT SQL
parameterization and tie-breaking. Posts, comments, feed, and votes service specs
import their real modules and override boundary providers, which also catches
missing module exports without requiring a database or running auth service.

`auth-e2e` owns registration, login, sessions, and profile workflows.
`social-e2e` owns communities, posts, comments, feeds, and votes, but starts both services
because social validates auth cookies over gRPC. Its shared
[`support/gql.ts`](../apps/backend/social-e2e/src/support/gql.ts) helper registers
unique users and captures login cookies; the E2E suites verify the real guard,
validation pipe, permissions, paginated replies, feed pagination, private vote
lookups, and concurrent vote/comment counters. Database migrations must be
applied before E2E; the target does not deploy them. A mocked resolver guard cannot establish any of those
cross-service guarantees. See [the social service guide](09-social-service.md)
for API behavior and local setup.

```bash
npx nx test social
npx nx e2e social-e2e
```

### Bounded comment retrieval

[`comments.service.spec.ts`](../apps/backend/social/src/app/comments/comments.service.spec.ts)
asserts bounded `take`, exclusive cursors, post/parent scoping, parameterized
reply existence probes for visible rows only, empty pages, and retained
soft-deleted parents. Direct service calls also reject invalid limits.
[`comments.args.spec.ts`](../apps/backend/social/src/app/comments/dto/comments.args.spec.ts)
checks inherited pagination validation, ID limits, optional nulls, and global
whitelist behavior. Resolver specs check argument forwarding with no guard
on public reads.

[`comment-pagination.spec.ts`](../apps/backend/social-e2e/src/social/comment-pagination.spec.ts)
uses the real APIs and Postgres to cover 105 roots, independent reply pages,
score ordering, missing/cross-thread cursors, invalid inputs, deleted parents,
and incremental traversal of a 40-level thread. Existing post/comment E2E
tests now query sibling pages instead of recursive payloads, retaining
creation, deletion, counter, and authentication coverage.

Apply committed social migrations before E2E (`nx run social:deploy-prisma`).
The new migration adds the sibling-order index; Nx E2E does not migrate the
database automatically. The removed whole-tree builder is no longer part of
the retrieval path.

### [`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts)

Mocks `PrismaService` entirely — the test never touches a real database.
Covers `createUser` (hashes before persisting, translates `P2002` into a
`ConflictException` naming the field(s), rethrows anything else unchanged),
`getUser` (passes the `where` clause through unchanged, translates `P2025`
into a `NotFoundException`), `getPublicUser` (selects only public profile
columns and maps missing users), and `updateUser` (updates only the given user
with the given fields — and its **not-found path is deliberately left
uncaught**, documented in a comment: it's the same shape bug `getUser` used
to have, not fixed here, tracked in
[`04-authentication.md`](04-authentication.md) "Residual").

Three of the `createUser`/`getUser` tests **initially failed** against the
implementation at the time they were written — not because the tests were
wrong, but because they caught real bugs (a missing `await` defeating a
`try/catch`, and a missing not-found mapping). Both have since been fixed;
see [`04-authentication.md`](04-authentication.md) "Bugs found while
testing" for the full history.

### [`create-user.input.spec.ts`](../apps/backend/auth/src/app/users/dto/create-user.input.spec.ts), [`login.input.spec.ts`](../apps/backend/auth/src/app/auth/dto/login.input.spec.ts), [`update-user.input.spec.ts`](../apps/backend/auth/src/app/users/dto/update-user.input.spec.ts)

Call `class-validator`'s `validate()` directly on DTO instances — no NestJS,
no HTTP, no `ValidationPipe`. These prove the decorators declared on each DTO
are individually correct, independent of whatever enforces them at the
request layer. `main.ts` registers a global `ValidationPipe`, so these rules
are enforced end-to-end today — see
[`04-authentication.md`](04-authentication.md) §3 for that history.
`login.input.spec.ts` also asserts the deliberate asymmetry with
registration: login does **not** enforce password strength, because a login
attempt has to accept whatever the user's password already is, policy
changes notwithstanding.

### [`users.resolver.spec.ts`](../apps/backend/auth/src/app/users/users.resolver.spec.ts), [`auth.resolver.spec.ts`](../apps/backend/auth/src/app/auth/auth.resolver.spec.ts)

Mock the service each resolver depends on. These exist specifically to catch
the resolver forwarding the _wrong shape_ of argument — e.g. passing the raw
GraphQL args object instead of `{ username }`, or a client-suppliable id
instead of the token's own — which a service-level test can't see, since the
service test never goes through the resolver at all. `users.resolver.spec.ts`
in particular proves `getMe`/`updateUser` use the id from `@CurrentUser()`,
never anything a client could pass in — that guarantee only exists because
the resolver never _accepts_ an id argument on those two operations at all,
and this test is what makes that observable.

### [`auth.service.spec.ts`](../apps/backend/auth/src/app/auth/auth.service.spec.ts)

Mocks `UsersService`, `ConfigService`, `JwtService`, and `bcryptjs.compare`.
Covers: the password is checked against the stored hash (not the plaintext);
the signed JWT payload contains only `userId`; the cookie is `httpOnly` with
the configured expiry and is `secure` only when `NODE_ENV=production`; a
wrong password and an unknown email produce **the exact same error message**
(checked by comparing both directly in one test, not just asserting each
independently — a message that happens to be identical by coincidence in two
separate assertions wouldn't catch a future change that breaks the symmetry).

### [`auth.controller.spec.ts`](../apps/backend/auth/src/app/auth/auth.controller.spec.ts)

Mocks `UsersService`. Covers the gRPC face's shaping of a Prisma user into
the proto `User` contract — notably, `avatarUrl: null` becomes `''`, since
proto3 has no concept of `null` for a string field.

### [`jwt.strategy.spec.ts`](../apps/backend/auth/src/app/auth/strategies/jwt.strategy.spec.ts)

The strategy's own logic is trivial (`validate()` just returns its input),
so this is a small test. The bigger question — "is this strategy ever
actually reachable" — is not something a unit test of the class in isolation
can answer, which is why the next test exists.

### [`auth.module.spec.ts`](../apps/backend/auth/src/app/auth/auth.module.spec.ts) — integration

Boots the **real** `AuthModule` via `Test.createTestingModule`, mocking only
`PrismaService`, then drives a validly-signed JWT through the real
`JwtAuthGuard`. This is the regression test for a bug where `JwtStrategy` was
defined but never added to any module's `providers` and had no
`@Injectable()` — meaning Passport never registered a `'jwt'` strategy at
all, and every guarded operation (`me`, `updateUser`, the gRPC
`authenticate`) failed outright with `Unknown authentication strategy "jwt"`,
regardless of whether the caller's token was valid.

This is the clearest example in this codebase of _why_ the integration layer
exists as its own thing, distinct from unit tests: every other test file
mocks the guard, the strategy, or both — by design, since that's what makes
them fast and focused. None of them touch the one thing this bug lived in
(whether Nest's DI container ever constructs the strategy at all), so none
of them could have caught it. Only a test that boots the real module and
drives a real request through the real guard can. See
[`04-authentication.md`](04-authentication.md) §4 and
[`06-nestjs-concepts.md`](06-nestjs-concepts.md) "Guards, Strategies, and the
bug that comes from confusing them" for the full mechanism.

### [`prisma.service.spec.ts`](../apps/backend/auth/src/app/prisma/prisma.service.spec.ts)

Pre-existing — a minimal "the service constructs" smoke test.

Run all of the above:

```bash
npx nx test auth
```

## End-to-end tests

The auth spec files share [`support/gql.ts`](../apps/backend/auth-e2e/src/support/gql.ts) —
a small `axios`-based GraphQL client (with `validateStatus` disabled so 4xx
responses resolve normally instead of throwing) plus `registerAndLogin()`,
which handles the register → login → capture-cookie sequence every
authenticated test needs.

### [`users.spec.ts`](../apps/backend/auth-e2e/src/users/users.spec.ts)

Boots the real `auth` build against the real Postgres instance and drives it
over actual HTTP, the same way a real client would. Covers registration and
its exact response shape, the schema refusing to let a client even request
the `password` field, username lookup, an unknown username's `404`-shaped
error, a duplicate email/username's `409`-shaped conflict, and the
`ValidationPipe` rejecting a weak password / short username end-to-end.

### [`auth.spec.ts`](../apps/backend/auth-e2e/src/auth/auth.spec.ts)

The login/session flow: `login` sets a cookie that a subsequent `me` accepts;
`me` and `updateUser` both reject a missing or garbage cookie with
`UNAUTHENTICATED`; a wrong password and an unknown email produce the
identical message; `updateUser` changes only the authenticated caller's own
profile; and `logout` clears the cookie for future requests while
documenting — not just asserting away — that it does **not** revoke the
underlying token server-side (replaying the exact old cookie value still
authenticates, since there is no revocation store).

Every claim in these files about response shapes was checked against a real
running instance while writing it, not inferred from reading the source.

Run the auth suites (deploy the database migrations first, as in the root README):

```bash
docker compose up -d postgres
npx nx e2e auth-e2e
```

### History: the e2e harness could not run via `nx e2e` at all

Worth keeping on record, since it explains why earlier verification in this
project's history used manual `curl` against a manually-started server
instead of `nx e2e`. NX's default generated e2e scaffold
(`global-setup.ts`) wrote an untyped key onto `globalThis`, which failed to
compile under this workspace's `tsconfig.base.json` (`"strict": true`) with:

```
error TS7017: Element implicitly has an 'any' type because type
'typeof globalThis' has no index signature.
```

This blocked `nx e2e auth-e2e` **entirely**, for every test in the project,
independent of anything in any individual spec file. Fixed by declaring the
global explicitly (`declare global { var __TEARDOWN_MESSAGE__: string; }`).
A second issue in the same scaffold was fixed alongside it:
`global-teardown.ts` called `killPort(3000)` unconditionally, which would
kill _any_ process on that port, including an unrelated dev server you
happened to already have running — replaced with a no-op, since NX already
owns the lifecycle of the auth server task this target depends on and stops
it itself.
