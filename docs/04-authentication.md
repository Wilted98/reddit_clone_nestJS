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

## Planned: JWT + httpOnly cookie login

Not built. Specified in
[`Roorin_design/01-BACKEND-ARCHITECTURE.md`](../../Roorin_design/01-BACKEND-ARCHITECTURE.md)
§10, and already visible in this repo as installed-but-unused dependencies:
`@nestjs/jwt`, `passport`, `passport-jwt`, and the `JWT_SECRET` /
`JWT_EXPIRATION_MS` variables already sitting in
[`.env.example`](../apps/backend/auth/.env.example). The intended shape,
for when it's built:

1. `login(email, password)` verifies the password with `bcryptjs.compare`
   against the stored hash, and on success signs a JWT.
2. The token is set as an **httpOnly, `SameSite` cookie** — not returned in
   the response body — so it's inaccessible to JavaScript running on the page
   (mitigating XSS token theft) and sent automatically on subsequent
   requests.
3. A `passport-jwt` strategy + guard reads that cookie on protected
   resolvers.
4. Once a second service exists, it never verifies the JWT itself — it calls
   `auth` over gRPC to ask "whose token is this?" (see
   [`02-architecture.md`](02-architecture.md) "Where this is heading"). Only
   `auth` ever holds `JWT_SECRET`.

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

## Residual: stack traces are present on every error response, not just these three

Independent of the three bugs above, and still true today: every error
response shown in this doc includes a `stacktrace` array with absolute
filesystem paths (omitted from the JSON above for readability). This is
Apollo Server's default (`includeStacktraceInErrorResponses` is `true`
unless `NODE_ENV=production`), not something specific to this codebase.
It's expected in local development; the thing to actually verify before any
real deployment is that the production environment sets `NODE_ENV=production`
(or explicitly configures Apollo's error formatting) so this turns off — it
isn't automatic just because the three bugs above are fixed.

## What's covered by tests

[`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts) and
[`create-user.input.spec.ts`](../apps/backend/auth/src/app/users/dto/create-user.input.spec.ts)
now pass against the fixed implementation; the e2e suite
([`users.spec.ts`](../apps/backend/auth-e2e/src/users/users.spec.ts)) asserts
the exact response shapes documented above. See
[`08-testing-strategy.md`](08-testing-strategy.md) for how to run them.
