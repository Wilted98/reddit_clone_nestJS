# Social service: communities, posts, and comments

The `social` Nx application implements communities, posts, and comments. It runs on port
3001, owns the `roorin_social` database, and registers a gRPC client for the
existing auth service at `localhost:5050`. The auth service retains ownership of
users and JWT verification; social stores user IDs without cross-database
foreign keys.

## Current scope

- A `Community` Prisma model with a unique slug, name, optional description,
  owner ID, timestamps, and indexes on owner ID and member count.
- A `Membership` model keyed by user ID and community ID, with `MEMBER`,
  `MODERATOR`, and `OWNER` roles. Deleting a community cascades to its memberships.
- Committed Community, Membership, Post, Comment, and Vote migrations and a
  separate Prisma client. Vote storage is prepared; voting has no API yet.
- Shared HTTP bootstrap, cookie parsing, validation, CORS, and GraphQL setup.
- A public `health` GraphQL query returning `"ok"`.
- Community creation, public lookup and listing, and guarded join/leave operations.
- Member-only text/link post creation, public lookup and author pagination,
  and author-only soft deletion.
- Authenticated comment creation, same-post parent validation, public nested
  threads, and author-only soft deletion.

Community creation writes the owner membership and an initial member count of
one together. Join and leave update membership rows and the counter within a
transaction. Duplicate requests, including concurrent ones, only change the
counter when a row is inserted or deleted. Owners cannot leave their own
communities; leaving as a non-member is a no-op.

The completed reference project also implements voting and feeds. Those APIs
remain outside this workspace's current scope; scores currently default to zero.
The moderator role is stored but has no moderation operations yet.

## GraphQL operations

| Operation                                | Access                   | Result                              |
| ---------------------------------------- | ------------------------ | ----------------------------------- |
| `health`                                 | Public                   | `"ok"`                              |
| `community(slug)`                        | Public                   | One community, or a not-found error |
| `communities(cursor, limit)`             | Public                   | `items`, `nextCursor`, `hasMore`    |
| `createCommunity(createCommunityInput)`  | Authenticated            | Community with an owner membership  |
| `joinCommunity(slug)`                    | Authenticated            | Community after joining             |
| `leaveCommunity(slug)`                   | Authenticated, non-owner | Community after leaving             |
| `post(id)`                               | Public                   | One post, or a not-found error      |
| `postsByAuthor(authorId, cursor, limit)` | Public                   | Live posts, `nextCursor`, `hasMore` |
| `createPost(createPostInput)`            | Authenticated member     | Text or link post                   |
| `deletePost(id)`                         | Authenticated author     | Soft-deleted post                   |
| `comments(postId)`                       | Public                   | Nested comment tree                 |
| `createComment(createCommentInput)`      | Authenticated            | New comment or reply                |
| `deleteComment(id)`                      | Authenticated author     | Soft-deleted comment                |

Creation accepts a lowercase slug of 3-24 letters, digits, or underscores, a
name of 3-60 characters, and an optional description up to 500 characters.
The owner ID comes from the authenticated user, never from the mutation input.
Duplicate slugs produce a conflict error.

Lists sort by member count descending, then ID ascending to resolve ties.
The default page size is 25, with a supported range of 1-100. Subsequent pages
exclude the cursor row. Pages are not a snapshot: membership changes between
requests can change a community's ranking.

## Posts and comments

`CreatePostInput` accepts `communitySlug`, a title of 3-300 characters, and
exactly one of `body` (1-40,000 characters) or a valid `url`. The authenticated
user must be a community member. Author IDs and usernames come from auth,
not the client. Author pages sort by creation time descending, then ID ascending,
and use the same 25-default, 1-100 pagination limits as community pages.

`CreateCommentInput` accepts `postId`, `body` (1-10,000 characters), and an
optional nonempty `parentId`. Any authenticated user can comment; community
membership is not required, matching the completed reference. The post must
exist and not be deleted, and a supplied parent must belong to that post.
Creating a comment and incrementing `commentCount` happen in one transaction.
The transaction rechecks and locks the live post before insertion, so a
concurrent post deletion cannot accept a comment after deletion.

Threads include deleted comments so their replies remain reachable. Siblings
sort by score descending, creation time ascending, then ID ascending. Clients
select how many levels of `replies` to request; this endpoint fetches all rows
for a post and does not paginate. A post with no comments, including an unknown
post ID, returns an empty tree.

Only authors may delete their own posts or comments. Post deletion sets
`deletedAt` and clears `body`/`url`; its title and existing thread remain readable
through `post(id)`, but author listings exclude it and new comments are rejected.
Comment deletion replaces its body with `[deleted]` and sets `deletedAt` without
removing descendants. `commentCount` counts all stored comments, including
soft-deleted ones, and is not decremented on deletion. Mutation comment payloads
return an empty `replies` array; query `comments(postId)` to read descendants.

## Run locally

Configure both services from their adjacent `.env.example` templates and
adjust database connections and auth's `JWT_SECRET` as needed. Local `.env`
files are gitignored. Run the following from the repository root:

```bash
npm ci
npm run generate-ts-proto
cp apps/backend/auth/.env.example apps/backend/auth/.env
cp apps/backend/social/.env.example apps/backend/social/.env
docker compose up -d postgres
docker compose ps
```

Once Postgres is healthy, apply the committed migrations and start social:

```bash
cd apps/backend/auth
npx prisma migrate deploy
cd ../../..
npx nx run social:deploy-prisma
npx nx serve social
```

The Docker initialization script creates `roorin_social` on the first startup
of a fresh volume. For an existing Postgres volume, ensure that database exists
before deploying migrations.

GraphQL is served at `http://localhost:3001/graphql`:

```graphql
query {
  health
}
```

The auth service does not need to run for public queries. Start it in another
terminal with `npx nx serve auth` for guarded social mutations. Configure
its `.env` from `apps/backend/auth/.env.example` as well. Log in through auth
and include its `Authentication` cookie when sending mutations to social.

## Checks

```bash
npx nx run-many -t lint -p social,social-e2e
npx nx test social
npx nx build social
npx nx e2e social-e2e
```

The E2E target builds, starts, and stops both auth and social through Nx. It
needs a running Postgres instance with both services' migrations applied.
Tests register unique users and communities to avoid collisions on reruns.
`AUTH_HTTP_URL` can override the test client's auth address (default
`http://localhost:3000`); the social test address uses `HOST` and `PORT`
(defaults `localhost` and `3001`). The applications still use their own `.env`
configuration when started by Nx.

Unit tests cover creation, conflicts, missing communities, ownership,
membership counters, module wiring, pagination, resolver forwarding, and DTO
validation. They use a mocked Prisma client and do not require Postgres.
Posts and comments specs also cover module exports, membership/ownership,
text-versus-link input, cursor pagination, reply trees, invalid parents,
soft deletion, and a post deleted between the initial lookup and transaction.
Resolver specs mock services and guards to check authenticated argument forwarding;
they do not prove the real authentication path.
E2E tests cover the real cookie-to-gRPC authentication handoff, public reads,
rejected anonymous and forged-cookie mutations, duplicate slugs, input
validation, pagination, and repeated and concurrent joins/leaves.
They also exercise post/comment permissions, author pagination, nested replies,
deletion behavior, concurrent comment counters, and concurrent post deletion.
Both social E2E feature suites share `src/support/gql.ts` for registration,
login cookies, and GraphQL requests.

Use `npx nx run social:migrate-prisma --name <migration>` to create a future
migration in development. Use `social:deploy-prisma` to apply committed
migrations without creating new ones.
