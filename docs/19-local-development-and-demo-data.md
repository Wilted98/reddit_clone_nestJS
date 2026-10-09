# Local Development and Demo Data

## Prerequisites and Startup

Use Node 24 LTS, npm, Docker Compose, and `protoc`. From the repository root:

```bash
npm ci
cp apps/backend/auth/.env.example apps/backend/auth/.env
cp apps/backend/social/.env.example apps/backend/social/.env
docker compose up -d postgres
docker compose ps
```

Set a private, stable `JWT_SECRET` in auth's `.env`. Wait for Postgres to be
healthy, then run:

```bash
npm run db:setup
npm start
```

Local environment paths are ignored, but auth's `.env` was already tracked in
this checkout. Ignore rules do not remove tracked files. Remove it from version
control while keeping the local file before publishing secrets. If a real secret
was exposed in repository history, rotate it separately; rotation invalidates
existing sessions.

`db:setup` regenerates the gRPC and Prisma clients, deploys committed migrations
to both databases, and explicitly seeds them. `npm start` runs development
services: web on 4200, auth HTTP on 3000, social HTTP on 3001, and auth gRPC on 5050.
Open `http://localhost:4200`. Web schema snapshots/codegen do not need live APIs.
An older Docker volume may need `roorin_social` created first; see the root README.

For migrations without sample records, run `npm run codegen:backend` and
`npm run db:migrate`. Neither install nor startup automatically seeds data.
These database helpers deliberately support local development only. Production
migrations use the service's Prisma deployment command and deployment secrets;
never run this demo seed in production. Web production setup is documented in
[web foundation](12-web-foundation.md#production-build-and-start).

## Stopping Services

```bash
npm run stop -- --dry-run
npm run stop
npm run stop:all
```

`stop` finds Node/npm/Nx development processes belonging to this checkout by
their exact repository path or working directory, includes their descendant
workers, sends SIGTERM, and force-stops survivors after three seconds. It
protects its own caller/ancestors, does not terminate the editor or terminal,
and excludes similarly named sibling checkouts. Web, backend watchers, and this
checkout's Nx daemon are included. The command supports macOS (`ps`, `lsof`) and
Linux (`ps`, `/proc`). It is not a general-purpose container/process supervisor.

Docker stays running with `stop`; `stop:all` also runs `docker compose stop
postgres` for this checkout. Both preserve the database volume. Dry-run works
with either command and changes nothing. `docker compose down` is also
non-destructive unless you explicitly add volume removal flags.

## Demo Dataset

`scripts/seed-data.mjs` defines fictional accounts and discussion content;
`scripts/seed.mjs` writes both databases through their generated Prisma clients.
It loads:

- 13 named users with bios and bcrypt-hashed passwords.
- Six communities: `romania`, `craft`, `webdev`, `books`, `cooking`, `outdoors`.
- 36 memberships, including one owner for each community.
- 24 text/link posts, 72 comments/replies, and 408 votes.

Discussion topics include Romanian cities, books, cooking, crafting, hiking,
and web development. Relative timestamps cover recent and older feed windows.
No chat/message feature is introduced; conversations use comments and replies.
Some profiles use deterministic, 96px DiceBear illustration URLs, while others
have no avatar to exercise the initials fallback. These external images are
subject to third-party availability; failing images fall back in the web UI.

All demo users have the password `RoorinDemo2026!`; for example:

```text
test@test.com
RoorinDemo2026!
```

The `.example` email domain is reserved for examples; these are not real accounts.
The password is intentionally public for a local demo, not suitable for a
public deployment. The seed hashes it with bcrypt cost 10 and never stores plaintext.

```bash
npm run db:seed
```

Stable `seed-*` IDs and `createMany(skipDuplicates)` make reruns additive and
non-duplicating. Existing seeded passwords/profile/content edits are preserved,
as are unrelated records. A matching username, email, or community slug owned
by a different record causes the seed to refuse the collision rather than
overwrite it. Reruns can restore missing seeded memberships/votes and records;
use a reset for a pristine dataset. Membership counts, comment counts, and
scores are recomputed from stored data, including non-seed activity on seeded
communities/posts. The seed is not a reconciliation tool for arbitrarily renamed
or corrupted demo identities.

## Resetting Local Data

**This deletes every account and social record in the configured local databases,
not just test/seed records. Back up anything you need before proceeding.**

```bash
npm run stop
npm run db:reset -- --confirm
npm run db:seed
npm start
```

Without `--confirm`, reset refuses to run. Helpers read the separate service
`.env` files and require PostgreSQL URLs pointing to `localhost`, `127.0.0.1`, or
`::1`, with exact database names `roorin_auth` / `roorin_social`. They refuse
production (`NODE_ENV=production` in the process or either service file), remote
targets, URL query overrides, and an inherited root `DATABASE_URL`. For an
intentional custom environment use Prisma directly instead of weakening these
development safeguards.

Reset connects to and checks both databases before deleting. Social records
are removed in one foreign-key-safe transaction, then auth users are removed.
These are independent databases, so the entire two-service operation cannot
be atomic; inspect failures before restarting services or retrying. Stop APIs
first to prevent concurrent writes. Schema and migration history remain intact,
and the unused legacy `roorin` database is not touched. Existing cookies no
longer resolve to accounts after reset; sign in to a seeded account again.

An optional backup with the default Docker setup:

```bash
mkdir -p .local-backups
docker compose exec -T postgres pg_dump -U roorin -Fc -d roorin_auth > .local-backups/auth.dump
docker compose exec -T postgres pg_dump -U roorin -Fc -d roorin_social > .local-backups/social.dump
```

`.local-backups/` is gitignored. Backups include account data and password
hashes; protect them and do not publish them. The reset command does not create
a backup automatically. Volume preservation alone does not undo deleted rows.

## Session Configuration and Verification

The auth template sets `JWT_EXPIRATION_MS=604800000`: seven days for both the
httpOnly cookie and JWT. The duration is validated as whole seconds between
one second and 30 days. It is an absolute expiry, with no automatic renewal or
refresh tokens. Restart auth and sign in again after changing it; keep
`JWT_SECRET` unchanged across ordinary restarts and browse with one hostname.
JWT revocation is not implemented: logout clears the browser cookie but does
not revoke a copied token. See [authentication](04-authentication.md).

A temporary transport/server error during a session refresh preserves the last
confirmed frontend account and reports a retryable error. A confirmed
unauthorized response still clears it. Full reloads restore from `me`, not a
persisted private account snapshot. Protected backend operations remain guarded.

```bash
npm run test:scripts
npm run test:auth
npm run test:web
```

Script tests cover path/process isolation (including a live fixture process),
local database guards, explicit reset confirmation and deletion order, seed
identity collision protection, consistent relations, hashed passwords, and
counter updates. They need installed dependencies but no generated Prisma
clients, running APIs, or databases. Auth/web tests cover matching token/cookie
durations and confirmed unauthorized versus transient session failures.
