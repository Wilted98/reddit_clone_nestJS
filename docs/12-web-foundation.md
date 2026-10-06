# 12 - Web Foundation and Authentication

The `web` Nx application lives in `apps/frontend/web`. It connects to the
separate NestJS auth and social GraphQL APIs. Authentication uses the backend's
httpOnly cookie; the frontend does not issue or persist access tokens.

Home (`/`), the community directory (`/communities`), and community feeds
(`/r/[slug]`) are public browsing routes. Registration, login, and the private
account view live at `/account`. See
[feeds and communities](13-web-feeds-and-communities.md) for their query and
pagination contracts. Public discussions live at `/posts/[id]`; authenticated
post composition lives at `/submit`. Their write, comment, and voting contracts
are in [web discussions](14-web-posts-discussions-and-voting.md).
Public profiles live at `/u/[username]`; own bio/avatar settings live in
`/account#profile-settings`. Their privacy, activity, and image contracts are
in [web profiles/settings](15-web-profiles-and-settings.md).

## Stack

- Next.js App Router + React + strict TypeScript.
- Apollo Client, with `@apollo/client-integration-nextjs` for the social
  provider and an isolated auth client. See
  [Apollo's Next.js integration](https://www.apollographql.com/docs/react/integrations/nextjs).
- GraphQL Code Generator with `typescript-operations` + `typed-document-node`
  for typed operation documents, not generated React hooks. See
  [Apollo's Codegen configuration](https://www.apollographql.com/docs/react/development-testing/graphql-codegen).
- React Hook Form + Zod for form state and input validation. Login requires
  a nonempty password; registration validates password strength and username
  rules. The backend remains authoritative.
- Plain CSS, Lucide icons, and locally bundled Nunito fonts.
- Jest + Testing Library for unit tests and Playwright for browser tests.

Dependency ranges are defined in the root `package.json`; `package-lock.json`
records the resolved versions used by `npm ci`.

## Run locally

Use Node 24 LTS (the root `.nvmrc`), or Node 22.15+ within 22.x, as required
by the root `engines` field and Codegen dependencies. Run commands from the
repository root:

```bash
npm ci
```

Follow [backend setup](../README.md#local-setup) to configure environment files,
start Docker/Postgres, apply migrations, and run the APIs. Account operations
require auth; social operations require social, with auth's internal gRPC
endpoint available for guarded requests.

```bash
npm run dev:web
```

Open `http://localhost:4200`. Development output goes to
`apps/frontend/web/.next-dev`, separate from production build output.
The web-only shortcut regenerates GraphQL documents from committed snapshots
without requiring backend environment files, Prisma generation, or `protoc`.
After completing backend setup, `npm start` (or `npm run dev`) generates all
contracts/clients and starts auth, social, and web together. Use
`npm run dev:backend` to start only the two APIs. Do not run these alongside
existing servers on the same ports. Project generation is explicit rather
than a `postinstall` hook, so dependency installation works before local
environment files and `protoc` are configured.

## Configuration

| Variable                         | Default                         | Purpose                   |
| -------------------------------- | ------------------------------- | ------------------------- |
| `NEXT_PUBLIC_AUTH_GRAPHQL_URL`   | `http://localhost:3000/graphql` | Browser-facing auth API   |
| `NEXT_PUBLIC_SOCIAL_GRAPHQL_URL` | `http://localhost:3001/graphql` | Browser-facing social API |

Optional local overrides belong in the gitignored
`apps/frontend/web/.env.local`. To initialize it:

```bash
cp apps/frontend/web/.env.example apps/frontend/web/.env.local
```

`NEXT_PUBLIC_*` values are browser-visible and embedded in the production
bundle at build time. Never put secrets in them. Restart development after
changing these values; rebuild production when changing API endpoints.

Both backend `CORS_ORIGINS` settings must allow the web origin. Local templates
allow `http://localhost:4200`. Use consistent hostnames across the web app and
APIs; mixing `localhost` and `127.0.0.1` can break cookie-based authentication.

## Production build and start

Install dependencies with `npm ci` and set the browser-facing API URLs before
building. Stop a development server on port 4200 before starting production:

```bash
npm run build:web
npm run start:web
```

Build output goes to `apps/frontend/web/.next`; the start target serves it on
port 4200. Build does not require live APIs because Codegen uses committed
schema snapshots. The running app still needs reachable backend endpoints.
`start:web` invokes the Nx production start target, which also depends on a
build. The root `npm start` command is for development, not production.

Web build caching is disabled in Nx so ignored local endpoint overrides cannot
reuse a bundle built for a different API URL.

For deployment, use HTTPS and configure backend trusted origins and cookie
settings for the actual hosting topology. Cross-site hosting requires a
deliberate cookie/CORS/security configuration; local defaults are not a
production configuration. See [authentication](04-authentication.md) and
[frontend connection rules](11-frontend-handoff.md#local-connections).

## GraphQL contracts

Auth/social remain separate schemas, clients, and caches. The frontend does
not import Nest modules, Prisma, generated gRPC contracts, or backend secrets;
Nx enforces the web ownership boundary.

`graphql/auth.schema.graphql` and `graphql/social.schema.graphql` are
committed, sorted snapshots obtained from the development APIs' introspection.
Operations live in `src/graphql/auth.graphql` and `src/graphql/social.graphql`.
Generated documents/types under `src/graphql/generated` are committed and regenerated
before build, typecheck, and unit tests. These commands work offline without
running backend services.

After changing backend GraphQL fields, run both development services and:

```bash
npx nx run web:schema
npx nx run web:codegen
```

Review snapshots and generated changes together. Schema refresh uses public
introspection, not private account data; both responses must load before
either snapshot is replaced. Do not manually maintain generated types or
merge the services' unrelated root types into one schema.

## Session and privacy behavior

- All auth requests use `credentials: include` and `cache: no-store`. Auth
  queries/mutations use Apollo `no-cache`; email lives only in the private
  account view, never localStorage, a shared public profile cache, or initial
  server-rendered HTML. The httpOnly cookie remains owned by Nest.
- On mount, `me` restores the session in the browser. Unauthorized responses
  mean guest; a transport/server failure shows a retryable error instead of
  silently pretending restoration succeeded. Request generations prevent
  an older restore response from overwriting a later login/logout.
- Registration first calls `createUser`, then `login` because creation alone
  does not set a cookie. If login fails after account creation, retry only
  login; the form retains its draft and does not register the same account twice.
- Successful logout clears both clients' caches and the private account view.
  Failed logout preserves account state and reports failure; the UI never
  falsely claims the cookie was cleared. Existing backend logout does not
  revoke a copied JWT server-side; see [authentication](04-authentication.md).
- GraphQL errors may arrive with HTTP 200. Handle structured auth, validation,
  conflict, and rate-limit errors as well as transport failures. Throttled
  requests are not automatically retried. Input and passwords remain in the
  form only while needed, not in persisted application state.

Private account queries run only in the browser. Authenticated server rendering
requires request-scoped cookie forwarding and private-response cache handling,
not a server singleton client.

## Verification

```bash
npx nx run-many -t lint,typecheck,test,build -p web
npx nx lint web-e2e
npx playwright install chromium
npm run test:e2e:web
```

For unit tests alone, use `npm run test:web`. Root `npm test` includes both
backend applications too; `npm run test:coverage` includes all three unit/
integration suites with coverage. See [test shortcuts](08-testing-strategy.md#root-test-shortcuts)
for prerequisites and API E2E commands.

Unit tests cover validation parity, error mapping, private cache/transport
behavior, session restoration, stale requests, and successful/failed logout.
Default Playwright suites mock auth and social HTTP boundaries and require no database.
They verify desktop/mobile forms, validation, password visibility, login,
reload restoration, logout, invalid credentials, throttling, registration
retry safety, social browsing/pagination, viewport bounds, image loading,
and private HTML exclusion.
Screenshots/traces go to ignored `test-results/web`; no mock data ships in the app.

With both migrated databases and backend APIs running:

```bash
npm run test:e2e:web:live
```

The live auth test creates one unique local test account, verifies the real
httpOnly cookie through registration/login/reload/logout, and leaves that test
record in the database. The live social browsing test reads existing data
without changing social records. The live discussion test creates an isolated
account/community, publishes a post/comment, verifies votes and reload, and
soft-deletes its post/comment afterward. Its account, community, membership,
and soft-deleted rows remain as test fixtures. Stop unrelated servers on port 4200 in CI; local
Playwright runs reuse an existing development server there.
The live profile test saves a real caller-scoped bio, verifies public/anonymous
profiles and empty activity, and leaves its unique account as a test fixture.

When no server is running, Playwright starts Next directly and shuts it down
afterward. The ordinary development shortcut is `npm run dev:web`; its Nx
equivalent is `npx nx dev web`.

Run `npm audit` to inspect dependency advisories. Review and retest dependency
updates before deployment; do not assume a successful build implies a clean
security audit.

## Static assets

Fonts are bundled from `@fontsource/nunito`. The account screen and discovery rail use
`public/community-street.jpg`, a locally bundled
[Unsplash neighborhood image](https://images.unsplash.com/photo-1449824913935-59a10b8d2000).
It is illustrative welcome media, not a user-uploaded photograph.
