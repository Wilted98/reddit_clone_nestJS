# Social service: communities, posts, comments, votes, and feeds

The `social` Nx application implements communities, posts, comments, votes, and feeds. It runs on port
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
  separate Prisma client. Vote rows have value and single-target CHECK constraints.
- Shared HTTP bootstrap, cookie parsing, validation, CORS, and GraphQL setup.
- A public `health` GraphQL query returning `"ok"`.
- Community creation, public lookup and listing, and guarded join/leave operations.
- Member-only text/link post creation, public lookup and author pagination,
  and author-only soft deletion.
- Authenticated comment creation, same-post parent validation, public nested
  threads, and author-only soft deletion.
- Authenticated post/comment voting, vote removal, and private batch vote lookups.
- Public global or community-scoped HOT, NEW, and TOP feeds.

Community creation writes the owner membership and an initial member count of
one together. Join and leave update membership rows and the counter within a
transaction. Duplicate requests, including concurrent ones, only change the
counter when a row is inserted or deleted. Owners cannot leave their own
communities; leaving as a non-member is a no-op.

These feature APIs now cover the completed reference's social backend scope.
Voting additionally locks targets before reading previous votes, and HOT adds
an ID tie-breaker. The moderator role is stored but has no moderation operations yet.

## GraphQL operations

| Operation                                                 | Access                   | Result                              |
| --------------------------------------------------------- | ------------------------ | ----------------------------------- |
| `health`                                                  | Public                   | `"ok"`                              |
| `community(slug)`                                         | Public                   | One community, or a not-found error |
| `communities(cursor, limit)`                              | Public                   | `items`, `nextCursor`, `hasMore`    |
| `createCommunity(createCommunityInput)`                   | Authenticated            | Community with an owner membership  |
| `joinCommunity(slug)`                                     | Authenticated            | Community after joining             |
| `leaveCommunity(slug)`                                    | Authenticated, non-owner | Community after leaving             |
| `post(id)`                                                | Public                   | One post, or a not-found error      |
| `postsByAuthor(authorId, cursor, limit)`                  | Public                   | Live posts, `nextCursor`, `hasMore` |
| `createPost(createPostInput)`                             | Authenticated member     | Text or link post                   |
| `deletePost(id)`                                          | Authenticated author     | Soft-deleted post                   |
| `comments(postId)`                                        | Public                   | Nested comment tree                 |
| `createComment(createCommentInput)`                       | Authenticated            | New comment or reply                |
| `deleteComment(id)`                                       | Authenticated author     | Soft-deleted comment                |
| `feed(sort, range, communitySlug, cursor, offset, limit)` | Public                   | Post page                           |
| `votePost(voteInput)`                                     | Authenticated            | Target ID, updated score, own vote  |
| `voteComment(voteInput)`                                  | Authenticated            | Target ID, updated score, own vote  |
| `myPostVotes(postIds)`                                    | Authenticated            | Caller's stored post votes          |
| `myCommentVotes(commentIds)`                              | Authenticated            | Caller's stored comment votes       |

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

## Voting

`VoteInput` accepts a nonempty string `targetId` and integer `value`: 1 for an
upvote, -1 for a downvote, or 0 to remove the caller's vote. Any authenticated
user can vote; membership and authorship are not required. Target existence is
checked before writing, and missing targets produce a not-found error, including
when removing a vote. Identity always comes from auth.

Each transaction locks the target row before looking up the previous vote,
then changes its score by `newValue - previousValue`. Repeating a vote leaves
the score unchanged; flipping 1 to -1 changes it by -2. Vote removal deletes
the row. The lock serializes requests on the same target to prevent duplicate
inserts or stale deltas under concurrent retries. Database constraints enforce
one target and a stored value of -1 or 1, alongside per-user/target uniqueness.

`myPostVotes` and `myCommentVotes` return only the authenticated caller's stored
votes among the requested IDs; unvoted and unknown targets are omitted. Their
`VoteResult.score` is a placeholder 0, not the target's current score. Read the
score from the feed, post, or comment query; vote mutations return the updated
score. Soft-deleted targets remain votable, matching the reference behavior.
Blocking votes on deleted content would be a separate policy change.

## Feed

`feed` is public and excludes soft-deleted posts. Omitting `communitySlug`
returns a global feed; a supplied nonempty slug scopes it to that community,
and an unknown community returns a not-found error.

- `HOT` (default) orders by `score / (ageInHours + 2)^1.8`, then creation time
  descending and ID ascending. It uses `offset` (default 0, range 0-500), returns
  `nextCursor: null`, and overfetches one row to determine `hasMore`.
- `NEW` orders by creation time descending, then ID ascending.
- `TOP` orders by score descending, then ID ascending. Its `range` is `ALL`
  by default, or `DAY` (24 hours), `WEEK` (7 days), or `MONTH` (30 days), filtering
  the post's creation time rather than when votes were cast.

NEW/TOP use exclusive ID cursors. All modes use `limit` 25 by default, range
1-100. `range` is ignored by HOT/NEW; `cursor` is ignored by HOT; `offset` is
ignored by NEW/TOP. Feed pages are not snapshots: votes and new posts can
reorder results between requests. HOT's offset cap limits skipped rows, not
the cost of ranking all matching posts; a larger dataset needs materialized
ranking or another indexed strategy. Raw HOT SQL binds scope and pagination
values rather than interpolating them into SQL text.

```graphql
query {
  feed(sort: TOP, range: WEEK, communitySlug: "romania", limit: 10) {
    items {
      id
      title
      score
      commentCount
    }
    hasMore
    nextCursor
  }
}

mutation {
  votePost(voteInput: { targetId: "POST_ID", value: 1 }) {
    targetId
    score
    myVote
  }
}
```

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
Feed and vote specs cover score deltas, target locking, private lookup forwarding,
input bounds, SQL parameters, sorting, time windows, and both pagination modes.
E2E also exercises vote retries, flips, removal, concurrent mixed changes,
missing targets, private lookup isolation, and public feed scoping/pagination.
All social E2E feature suites share `src/support/gql.ts` for registration,
login cookies, and GraphQL requests.

Use `npx nx run social:migrate-prisma --name <migration>` to create a future
migration in development. Use `social:deploy-prisma` to apply committed
migrations without creating new ones.

The vote constraint migration fails if existing rows have invalid values or
zero/two targets. Audit and repair such rows deliberately before deploying;
the migration does not delete data or recompute existing scores automatically.
