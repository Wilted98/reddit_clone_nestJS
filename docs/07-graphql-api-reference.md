# 07 — GraphQL API Reference

Everything the `auth` service exposes, today. This schema is **generated**,
not hand-written — see
[`06-nestjs-concepts.md`](06-nestjs-concepts.md) "Decorators as schema, not
just metadata" for how the classes below become this SDL. You can always get
the live, current schema by opening `http://localhost:3000/graphql` (Apollo
Sandbox) with the service running — this doc should match it, but the running
server is the actual source of truth.

## Endpoint

This page covers auth only. Social's endpoint, operations, and input constraints
are documented in [the social service guide](09-social-service.md).

```
POST http://localhost:3000/graphql
```

Note this is **not** under `/api` — the `api` prefix set in
[`main.ts`](../apps/backend/auth/src/main.ts) applies to REST-style routes
only; Apollo serves GraphQL at `/graphql` regardless of that prefix.

## Types

```graphql
type User {
  id: ID!
  createdAt: DateTime!
  username: String!
  email: String!
  avatarUrl: String
  bio: String
}

input CreateUserInput {
  username: String!
  email: String!
  password: String!
}

input LoginInput {
  email: String!
  password: String!
}

input UpdateUserInput {
  bio: String
  avatarUrl: String
}
```

`id` and `createdAt` come from `AbstractModel`
(see [`06-nestjs-concepts.md`](06-nestjs-concepts.md)), not from `User`
itself. There is deliberately **no `password` field on `User`** — see
[`04-authentication.md`](04-authentication.md) "What exists today": this
isn't a resolver choosing not to return it, it's the schema not having a way
to ask for it at all. Try it:

```graphql
mutation { createUser(createUserInput: { ... }) { id password } }
```

```json
{ "errors": [{ "message": "Cannot query field \"password\" on type \"User\"." }] }
```

That's a query-validation error, rejected before any resolver runs.

## Mutations

### `createUser`

Registers a new user. Hashes the password before storing it and validates
the input (username length/characters, email format, password strength) via
a global `ValidationPipe` — see [`04-authentication.md`](04-authentication.md)
for the exact rules and their history (this validation was missing until
recently; that doc explains what changed).

```graphql
mutation {
  createUser(createUserInput: { username: "vasi", email: "vasi@roorin.dev", password: "Str0ng!Passw0rd1" }) {
    id
    username
    email
    avatarUrl
    bio
    createdAt
  }
}
```

```json
{
  "data": {
    "createUser": {
      "id": "cmtg6g7ks0002oiu4x23p5xsh",
      "username": "vasi",
      "email": "vasi@roorin.dev",
      "avatarUrl": null,
      "bio": null,
      "createdAt": "2026-08-30T19:03:10.685Z"
    }
  }
}
```

**Duplicate `username` or `email`:** returns a `409` conflict.

```json
{ "errors": [{ "message": "field already taken", "extensions": { "code": "INTERNAL_SERVER_ERROR", "originalError": { "message": "field already taken", "error": "Conflict", "statusCode": 409 } } }] }
```

Two things worth knowing about this exact shape before writing client code
against it — both explained in
[`04-authentication.md`](04-authentication.md) §1: the real `409` lives
under `extensions.originalError.statusCode`, not the top-level
`extensions.code` (which NestJS's default GraphQL error formatting leaves as
`INTERNAL_SERVER_ERROR` here — `login` below is the one operation where the
top-level code is actually meaningful, since `UnauthorizedException` gets
special-cased to `UNAUTHENTICATED`); and the message is
currently always the generic `"field already taken"` rather than naming the
specific field, because `error.meta.target` isn't populated under the
Postgres driver adapter in use here.

### `login`

Verifies the password and, on success, sets an httpOnly `Authentication`
cookie — see [`04-authentication.md`](04-authentication.md) for exactly what
that cookie contains and its flags. Returns the same `User` shape as
`createUser`.

```graphql
mutation {
  login(loginInput: { email: "vasi@roorin.dev", password: "Str0ng!Passw0rd1" }) {
    id
    username
  }
}
```

**Wrong password or unknown email — identical response either way** (no
account-enumeration oracle):

```json
{ "errors": [{ "message": "Credentials are not valid.", "extensions": { "code": "UNAUTHENTICATED", "originalError": { "message": "Credentials are not valid.", "error": "Unauthorized", "statusCode": 401 } } }] }
```

Note `extensions.code` here really is `UNAUTHENTICATED` — unlike `createUser`
and `user` above, `UnauthorizedException` (401) is one NestJS's default
GraphQL error formatting does map to a real Apollo code.

### `logout`

Clears the `Authentication` cookie. Always returns `true`; does not require
being logged in.

```graphql
mutation {
  logout
}
```

Clears the cookie **client-side only** — it does not revoke the JWT
server-side (there is no token blocklist). See
[`04-authentication.md`](04-authentication.md) for what that means in
practice.

### `updateUser` _(requires the `Authentication` cookie)_

Updates the **caller's own** profile — there is no argument for which user
to update; the id comes from the cookie, never from client input.

```graphql
mutation {
  updateUser(updateUserInput: { bio: "building roorin", avatarUrl: "https://cdn.roorin.dev/a.png" }) {
    id
    bio
    avatarUrl
  }
}
```

**No cookie, or an invalid one:**

```json
{ "errors": [{ "message": "Unauthorized", "extensions": { "code": "UNAUTHENTICATED", "originalError": { "message": "Unauthorized", "statusCode": 401 } } }] }
```

## Queries

### `me` _(requires the `Authentication` cookie)_

Returns the **caller's own** profile — same non-argument-for-identity
pattern as `updateUser`, and the same `UNAUTHENTICATED` shape without a valid
cookie.

```graphql
{
  me {
    id
    username
    email
    bio
    avatarUrl
  }
}
```

### `user`

Public profile lookup by username.

```graphql
{
  user(username: "vasi") {
    id
    username
    avatarUrl
    bio
  }
}
```

```json
{ "data": { "user": { "id": "cmtg6g7ks0002oiu4x23p5xsh", "username": "vasi", "avatarUrl": null, "bio": null } } }
```

**Unknown username:** returns a `404`-shaped error (`"User not found"`,
`extensions.originalError.statusCode: 404` — same shape/caveat as the
conflict error above). Because the `user` field is non-nullable, the
**entire** `data` key in the response is `null`, not just `data.user` — that
part is inherent to the schema, not an error-handling gap.

```json
{ "errors": [{ "message": "User not found", "extensions": { "code": "INTERNAL_SERVER_ERROR", "originalError": { "message": "User not found", "error": "Not Found", "statusCode": 404 } } }], "data": null }
```

## What's not here yet

No password reset, no email verification, no refresh tokens (the access
token _is_ the session — see [`04-authentication.md`](04-authentication.md)
"Planned" territory beyond what's built), no account deletion. No second
service yet to actually call the internal gRPC `Authenticate` endpoint this
service already exposes — see [`02-architecture.md`](02-architecture.md).
