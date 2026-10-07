## Reading order

| #   | Doc                                                          | Read this to understand...                                                                                     |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | [`01-project-overview.md`](01-project-overview.md)           | What this repo is, what phase it's in, what actually runs today                                                |
| 2   | [`02-architecture.md`](02-architecture.md)                   | The NX workspace shape, why `apps/backend` vs `apps/frontend`, module boundaries                               |
| 3   | [`03-database-design.md`](03-database-design.md)             | The `User` model, why `cuid`, migrations, the adapter-pg pattern                                               |
| 4   | [`04-authentication.md`](04-authentication.md)               | Password hashing, login/logout, JWT cookies, and internal gRPC authentication                                  |
| 5   | [`05-tech-stack-rationale.md`](05-tech-stack-rationale.md)   | Why NX, why NestJS, why GraphQL (code-first) over REST, why Prisma, why Postgres — the alternatives considered |
| 6   | [`06-nestjs-concepts.md`](06-nestjs-concepts.md)             | Modules, DI, decorators, resolvers vs. services — taught using this repo's own files                           |
| 7   | [`07-graphql-api-reference.md`](07-graphql-api-reference.md) | Auth queries and mutations, with example requests                                                              |
| 8   | [`08-testing-strategy.md`](08-testing-strategy.md)           | The testing pyramid used here, how to run each layer, what's covered                                           |

Communities, membership rules, posts, nested comments, votes, feeds, and their tests are documented in
[`09-social-service.md`](09-social-service.md).

[`10-mvp-roadmap.md`](10-mvp-roadmap.md) records the public/private profile
split, auth rate limits, bounded comment pages, profile activity/editing,
client migrations, deployment
limitations, and the next one-or-two-feature batches.

[`11-frontend-handoff.md`](11-frontend-handoff.md) maps the current backend
contracts to frontend workflows, including cookies, profile privacy, edit
state, pagination, error handling, and remaining backend work.

[`12-web-foundation.md`](12-web-foundation.md) documents the Next.js/Apollo/
Codegen stack, local and production setup, configuration, cookie sessions,
schema snapshots, and browser tests.

[`13-web-feeds-and-communities.md`](13-web-feeds-and-communities.md) documents
public web routes, feed filters, cursor/offset pagination, content rendering,
error states, API boundaries, and browser verification.

[`14-web-posts-discussions-and-voting.md`](14-web-posts-discussions-and-voting.md)
documents text/link posting, membership-gated publishing, incremental comment
threads, private vote restoration, mutation safety, and browser verification.

[`15-web-profiles-and-settings.md`](15-web-profiles-and-settings.md) documents
public profiles, independent activity pagination, caller-scoped bio/avatar
editing, avatar safety, privacy, and verification.

[`16-web-content-editing-and-deletion.md`](16-web-content-editing-and-deletion.md)
documents author controls, text/link edits, deletion confirmation, retained
threads, mutation/session safety, and verification.

[`17-web-community-creation.md`](17-web-community-creation.md) documents
authenticated community creation, validation, owner membership, confirmed
navigation, error/session handling, and verification.

[`18-web-community-memberships.md`](18-web-community-memberships.md) documents
the private joined-community directory, owner protection, confirmed departures,
subscription refresh, pagination, mutation/session safety, and verification.

[`19-local-development-and-demo-data.md`](19-local-development-and-demo-data.md)
documents checkout-scoped shutdown, local database migration/reset/seeding,
fictional demo accounts, repeat-run behavior, and session lifetime configuration.

[`20-vps-deployment.md`](20-vps-deployment.md) documents the production Docker
stack, HTTPS, Oracle/Hostinger networking, build-time public endpoints, private
configuration, migrations, backups, manual updates, and GitHub Actions deployment
with pinned SSH host keys and commit-specific releases.
