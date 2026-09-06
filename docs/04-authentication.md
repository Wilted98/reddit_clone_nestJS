# 04 — Authentication

## What exists today

**Registration only. No login, no sessions, no tokens.** `createUser`
(in [`users.service.ts`](../apps/backend/auth/src/app/users/users.service.ts))
does exactly one security-relevant thing: it hashes the password before
persisting it.

```ts
return this.prismaService.client.user.create({
  data: { ...data, password: await hash(data.password, 10) },
});
```

- **`bcryptjs`**, not native `bcrypt`. Pure-JS, no native compilation step —
  simpler to install and deploy consistently across environments, at some
  raw-speed cost versus the C++ binding. For hashing a password once per
  registration/login, that speed difference is irrelevant; it would matter for
  something hashing at high frequency, which this isn't.
- **Cost factor `10`** — bcrypt's work factor, meaning `2^10` hashing rounds.
  This is the commonly recommended floor (OWASP's current guidance is ≥10,
  ideally higher on hardware that can afford it) and bcryptjs's own default.
  Higher is more expensive to brute-force but slower per login — worth
  revisiting once there's a production server to benchmark it against.
- **The raw password is never stored, logged, or returned.** The GraphQL
  `User` type ([`user.model.ts`](../apps/backend/auth/src/app/users/models/user.model.ts))
  simply has no `password` field — see
  [`07-graphql-api-reference.md`](07-graphql-api-reference.md) for why that's
  a stronger guarantee than "the resolver doesn't return it."

That's the entire current surface. There is no `login` mutation, no JWT
issued, nothing checks a password against its hash anywhere in this codebase
yet.

## Login, logout, me, updateUser

Implemented. `login(email, password)`
([`auth.service.ts`](../apps/backend/auth/src/app/auth/auth.service.ts))
verifies the password with `bcryptjs.compare` against the stored hash and,
on success, signs a JWT (`{ userId }` only — never the email or password)
and sets it as the `Authentication` cookie:

```ts
response.cookie('Authentication', accessToken, {
  httpOnly: true,
  sameSite: 'lax',
  secure: this.configService.get('NODE_ENV') === 'production',
  maxAge: Number(this.configService.getOrThrow('JWT_EXPIRATION_MS')),
});
```

- **`httpOnly`** — inaccessible to JavaScript running on the page, mitigating
  XSS token theft; the client never sees the token value, only sends it back
  automatically.
- **`secure` only in production** — plain HTTP works in local dev; a real
  deployment must actually set `NODE_ENV=production` for this to take effect,
  same caveat as the stack-trace note below.
- A wrong password and an unknown email produce the **exact same message**
  (`"Credentials are not valid."`) — verified by comparing both directly, not
  just individually — so `login` cannot be used to enumerate which emails are
  registered.

`me` and `updateUser`
([`users.resolver.ts`](../apps/backend/auth/src/app/users/users.resolver.ts))
are guarded with `@UseGuards(GqlAuthGuard)` and read the caller's id from
`@CurrentUser()`, never from a client-supplied argument — there is no field
on either operation a client could set to act as a different user. The gRPC
face (`AuthController.authenticate`, called by _other_ services once one
exists — see [`02-architecture.md`](02-architecture.md)) is guarded the same
way, just with `JwtAuthGuard` instead of the GraphQL-context variant.

**Verified live**, the full round trip: register → login (cookie set) → `me`
with that cookie → `updateUser` → `me` without a cookie (rejected) → `logout`
→ wrong password / unknown email (identical rejection). All of it is also
now exercised end-to-end in
[`auth.spec.ts`](../apps/backend/auth-e2e/src/auth/auth.spec.ts) — see
[`08-testing-strategy.md`](08-testing-strategy.md).

One thing `logout` does **not** do, worth knowing before assuming otherwise:
it clears the cookie client-side; it does not revoke the JWT server-side.
There is no token blocklist. A captured copy of the cookie value (not the
cookie mechanism itself — an attacker would need to have obtained the raw
token some other way first) stays valid until it expires, logout or not.
Fine for now with zero real users; worth a revocation store the moment that
stops being true.

**Once a second service exists**, it never verifies the JWT itself — it
calls `auth`'s gRPC `Authenticate` endpoint to ask "whose token is this?"
using the `GqlAuthGuard` already sitting in `libs/backend/nestjs`, ready and
unused until then. Only `auth` ever holds `JWT_SECRET`. See
[`02-architecture.md`](02-architecture.md) for exactly what's built versus
what a second service still has to wire up.

## Bugs found while testing (fixed)

Three bugs were found in code that existed at the time, while writing the
test suite in [`08-testing-strategy.md`](08-testing-strategy.md), and
confirmed by actually running the server rather than just reading the code.
**All three have since been fixed** — kept here, rather than deleted, because
the _shape_ of each bug (an unawaited promise defeating a `try/catch`; a
non-nullable GraphQL field nulling the whole response on error; a validation
pipe that was never wired up) is exactly the kind of mistake that's cheap to
reintroduce by accident later, and a live example of each is worth more than
a rule reminding you not to.

### 1. A duplicate email/username used to leak an internal error and a stack trace — fixed

**File:** [`users.service.ts`](../apps/backend/auth/src/app/users/users.service.ts), `createUser`.

The method translates Prisma's unique-constraint violation (`P2002`) into a
friendly `ConflictException`. The bug: `return this.prismaService.client.user.create({ ... })`
was missing `await`. In an `async` function, returning a promise without
awaiting it means a rejection from that promise is never observed _inside_
the surrounding `try` block — the `catch` clause was dead code. Fixed by
awaiting the call before returning it.

**Verified after the fix**, registering two users with the same email:

```json
{ "errors": [{ "message": "field already taken", "extensions": { "code": "INTERNAL_SERVER_ERROR", "originalError": { "message": "field already taken", "error": "Conflict", "statusCode": 409 } } }], "data": null }
```

The conflict is now caught correctly (`statusCode: 409`, inside
`originalError`). Two smaller things worth knowing about this exact shape,
both residual rather than bugs in the fix itself:

- **The message says `"field already taken"`, not `"email already taken"`.**
  `error.meta.target` (the array of colliding column names the code reads to
  build that message) comes back `undefined` here under
  `@prisma/adapter-pg` — verified against both a duplicate email and a
  duplicate username; both produced the generic fallback. The conflict is
  still reported correctly, just less specifically than the code intends.
- **`extensions.code` is `INTERNAL_SERVER_ERROR` even for this 409.**
  This is NestJS's default GraphQL exception formatting, not a bug: it
  doesn't remap `HttpException` subclasses to Apollo-style error codes
  (`CONFLICT`, `NOT_FOUND`, ...) unless you add a custom exception filter
  that does so. The real status lives in `extensions.originalError.statusCode`.
  Worth fixing later (a shared `GqlExceptionFilter` mapping common
  `HttpException`s to matching Apollo codes) if/when clients need to branch
  on error type — not urgent today with zero clients.

### 2. Looking up a nonexistent user used to be an unhandled error, not a 404 — fixed

**File:** [`users.service.ts`](../apps/backend/auth/src/app/users/users.service.ts), `getUser`.

`findUniqueOrThrow` throws when nothing matches; nothing caught it. Fixed by
wrapping it in the same `try/catch` pattern `createUser` already used for
`P2002`, mapping Prisma's not-found code (`P2025`) to a `NotFoundException`.

**Verified after the fix:**

```json
{ "errors": [{ "message": "User not found", "extensions": { "code": "INTERNAL_SERVER_ERROR", "originalError": { "message": "User not found", "error": "Not Found", "statusCode": 404 } } }], "data": null }
```

Same `extensions.code` caveat as above applies (`404` lives under
`originalError`, not the top-level `code`). `data` is still `null` for the
whole response, not just the `user` field — that part is inherent to the
field being non-nullable in the schema, not something this fix changes;
see [`07-graphql-api-reference.md`](07-graphql-api-reference.md).

### 3. DTO validation was declared but not enforced — fixed

**File:** [`main.ts`](../apps/backend/auth/src/main.ts).

`CreateUserInput`'s validators (`@Length`, `@Matches`, `@IsEmail`,
`@IsStrongPassword`) only run if something registers a `ValidationPipe`;
nothing did. Fixed with
`app.useGlobalPipes(new ValidationPipe({ whitelist: true }))` in `main.ts`.

**Verified after the fix** — `password: "123"` and `username: "a"` are now
both rejected:

```json
{ "errors": [{ "message": "Bad Request Exception", "extensions": { "code": "BAD_REQUEST", "originalError": { "message": ["password is not strong enough"], "error": "Bad Request", "statusCode": 400 } } }] }
```

`whitelist: true` is worth remembering going forward, independent of this
fix: it silently strips any incoming field that has _no_ validation
decorator at all, rather than erroring — relevant the next time a field is
added to a DTO without a decorator.

### 4. Every guarded operation (`me`, `updateUser`, the gRPC `authenticate`) was unreachable — fixed

**Files:**
[`jwt.strategy.ts`](../apps/backend/auth/src/app/auth/strategies/jwt.strategy.ts),
[`auth.module.ts`](../apps/backend/auth/src/app/auth/auth.module.ts).

`JwtAuthGuard` and the local `GqlAuthGuard` both do `AuthGuard('jwt')` —
Passport's mechanism for "use whichever strategy is registered under the name
`'jwt'`". A strategy only becomes registered when Nest actually constructs
an instance of it (the `PassportStrategy` mixin calls `passport.use(...)` in
its own constructor). `JwtStrategy` had no `@Injectable()`, and — the part
that actually breaks it — was never listed in any module's `providers`, so
Nest never constructed one. No code path ever registered `'jwt'` with
Passport at all.

**Verified before the fix**, with an integration test that boots the real
`AuthModule` (only `PrismaService` mocked — this bug lives entirely in module
wiring, not in anything database-related) and drives a validly-signed token
through the real guard:

```
Rejected to value: [Error: Unknown authentication strategy "jwt"]
```

Every guarded operation failed this way regardless of whether the caller's
token was valid — `me`, `updateUser`, and the gRPC `authenticate` endpoint
other services will eventually call were all completely unreachable.

**Fix:** add `@Injectable()` to `JwtStrategy`, list it in `AuthModule`'s
`providers`, and import `PassportModule`. Three lines, verified live
afterward with the full register → login → `me` → `updateUser` → `logout`
flow (see "Login, logout, me, updateUser" above) and permanently guarded by
[`auth.module.spec.ts`](../apps/backend/auth/src/app/auth/auth.module.spec.ts),
which is the regression test built from the exact repro above — a test
mocking `JwtStrategy` or the guard away, the way every other test in this
file's siblings does, cannot catch this class of bug by construction.

## Residual: known gaps that aren't bugs

- **`UnauthorizedException` (401) is the one `HttpException` NestJS's default
  GraphQL error formatting _does_ map to a real Apollo code**
  (`extensions.code: "UNAUTHENTICATED"`) — unlike `ConflictException` (409)
  and `NotFoundException` (404) above, which both fall back to
  `INTERNAL_SERVER_ERROR`. Verified directly: an unauthenticated `me` call
  and a wrong-password `login` both come back `UNAUTHENTICATED`; a duplicate
  registration does not come back `CONFLICT`. There is no single rule here —
  check the actual response shape for a given exception type rather than
  assuming consistency across them.
- **`updateUser` has no not-found handling**, the same shape bug #2 above
  used to be. If the id in a token ever refers to a deleted user, the
  `prisma.user.update()` call throws unmapped rather than producing a clean 404. Lower severity than the others — it requires a token surviving its
  owner's deletion — but the same fix pattern (a `try/catch` mapping
  Prisma's not-found code) would close it. Not fixed here; recorded by
  [`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts)'s
  `updateUser` tests, which say so directly in a comment.

- **Stack traces are present on every error response**, not just the ones
  documented above — every JSON example in this doc had its `stacktrace`
  array omitted for readability, but it's really there, with absolute
  filesystem paths. This is Apollo Server's default
  (`includeStacktraceInErrorResponses` is `true` unless
  `NODE_ENV=production`), not something specific to this codebase. Expected
  in local dev; the thing to actually verify before any real deployment is
  that the production environment sets `NODE_ENV=production` (or explicitly
  configures Apollo's error formatting) — it isn't automatic just because the
  bugs above are fixed.

## What's covered by tests

Unit: [`auth.service.spec.ts`](../apps/backend/auth/src/app/auth/auth.service.spec.ts)
(login/logout logic), [`auth.resolver.spec.ts`](../apps/backend/auth/src/app/auth/auth.resolver.spec.ts),
[`auth.controller.spec.ts`](../apps/backend/auth/src/app/auth/auth.controller.spec.ts)
(the gRPC face), [`jwt.strategy.spec.ts`](../apps/backend/auth/src/app/auth/strategies/jwt.strategy.spec.ts),
[`auth.module.spec.ts`](../apps/backend/auth/src/app/auth/auth.module.spec.ts)
(the strategy-registration regression test), plus
[`login.input.spec.ts`](../apps/backend/auth/src/app/auth/dto/login.input.spec.ts) and
[`update-user.input.spec.ts`](../apps/backend/auth/src/app/users/dto/update-user.input.spec.ts)
for DTO validation. `users.service.spec.ts` and `users.resolver.spec.ts` were
both extended with `updateUser`/`getMe` coverage rather than gaining new
files.

E2E: [`auth.spec.ts`](../apps/backend/auth-e2e/src/auth/auth.spec.ts) drives
the full login/me/updateUser/logout flow against a real running server and
real Postgres. See [`08-testing-strategy.md`](08-testing-strategy.md) for how
to run all of it, including how `nx e2e` itself was fixed in the same pass —
it could not run at all before this.
