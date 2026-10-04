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
  and author-only editing and soft deletion.
- Authenticated comment creation, same-post parent validation, bounded public
  root/reply pages, bounded author activity, and author-only editing and soft deletion.
- Nullable post/comment `editedAt` timestamps independent of votes and counters.
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

| Operation                                                 | Access                   | Result                                   |
| --------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| `health`                                                  | Public                   | `"ok"`                                   |
| `community(slug)`                                         | Public                   | One community, or a not-found error      |
| `communities(cursor, limit)`                              | Public                   | `items`, `nextCursor`, `hasMore`         |
| `createCommunity(createCommunityInput)`                   | Authenticated            | Community with an owner membership       |
| `joinCommunity(slug)`                                     | Authenticated            | Community after joining                  |
| `leaveCommunity(slug)`                                    | Authenticated, non-owner | Community after leaving                  |
| `post(id)`                                                | Public                   | One post, or a not-found error           |
| `postsByAuthor(authorId, cursor, limit)`                  | Public                   | Live posts, `nextCursor`, `hasMore`      |
| `createPost(createPostInput)`                             | Authenticated member     | Text or link post                        |
| `updatePost(updatePostInput)`                             | Authenticated author     | Edited text or link post                 |
| `deletePost(id)`                                          | Authenticated author     | Soft-deleted post                        |
| `comments(postId, parentId, cursor, limit)`               | Public                   | Direct siblings, `nextCursor`, `hasMore` |
| `commentsByAuthor(authorId, cursor, limit)`               | Public                   | Live comments, `nextCursor`, `hasMore`   |
| `createComment(createCommentInput)`                       | Authenticated            | New comment or reply                     |
| `updateComment(updateCommentInput)`                       | Authenticated author     | Edited comment with reply availability   |
| `deleteComment(id)`                                       | Authenticated author     | Soft-deleted comment                     |
| `feed(sort, range, communitySlug, cursor, offset, limit)` | Public                   | Post page                                |
| `votePost(voteInput)`                                     | Authenticated            | Target ID, updated score, own vote       |
| `voteComment(voteInput)`                                  | Authenticated            | Target ID, updated score, own vote       |
| `myPostVotes(postIds)`                                    | Authenticated            | Caller's stored post votes               |
| `myCommentVotes(commentIds)`                              | Authenticated            | Caller's stored comment votes            |

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

### Bounded comment retrieval

`comments` returns a `CommentPage` with `items`, `nextCursor`, and `hasMore`.
Omit `parentId` (or pass null) for root comments. Supply a comment ID to page
only its direct replies. The default limit is 25; supported limits are 1-100.
Every page fetches at most `limit + 1` sibling rows, with one lookahead row
used for `hasMore`. Descendants are not loaded recursively or counted.

Each comment exposes `hasReplies`, computed with a parameterized SQL
`EXISTS` probe for visible rows only. It includes soft-deleted replies, and
does not fetch their bodies. Expand a comment by querying the same post with
that comment as `parentId`; each sibling group has its own cursor.
Clients can assemble an arbitrarily deep discussion incrementally, but no
single comment query returns an unbounded tree.

Siblings still sort by score descending, creation time ascending, then ID
ascending. The cursor is the last visible row's ID and is exclusive. A
supplied cursor must exist in the same post and sibling group; invalid,
cross-post, or cross-parent cursors produce a `400`-shaped error. A supplied
parent must exist on the post, even when soft-deleted; invalid parents also
produce `400`. Empty IDs and IDs longer than 128 characters are rejected.
A root query for a post without comments, including an unknown post ID,
returns `{ items: [], nextCursor: null, hasMore: false }`.

Pages are live, not a snapshot. Votes between requests can move siblings
across the cursor and cause skips or repeats. `hasReplies` is also a current
availability hint; re-query after creating a reply. The limits apply per
`comments` field, not to the total number of aliases/operations in a GraphQL
request. Request complexity limits and traffic controls remain separate
deployment concerns. Page limits bound materialized/returned rows, not a
hard PostgreSQL execution-time budget; the planner still chooses how to use
the supporting indexes.

```graphql
query Roots($postId: String!, $cursor: String) {
  comments(postId: $postId, cursor: $cursor, limit: 25) {
    items {
      id
      parentId
      authorUsername
      body
      score
      hasReplies
    }
    nextCursor
    hasMore
  }
}
```

```graphql
query Replies($postId: String!, $parentId: String!, $cursor: String) {
  comments(postId: $postId, parentId: $parentId, cursor: $cursor, limit: 25) {
    items {
      id
      parentId
      authorUsername
      body
      score
      hasReplies
    }
    nextCursor
    hasMore
  }
}
```

**Breaking change:** `comments` previously returned `[Comment!]!` and
`Comment.replies` was recursive. It now returns `CommentPage!`, and
`Comment.replies` is removed from all query/mutation payloads. Select fields
under `items`, replace `replies` selections with `hasReplies`, and load reply
pages explicitly. Regenerate client schema types/fragments. The obsolete
whole-tree builder and its tests were replaced by page/DTO/E2E coverage.

The additive `20261004193844_paginate_comment_siblings` migration creates
an index on `(postId, parentId, score DESC, createdAt, id)` for sibling
filtering/order and reply availability checks. Apply it before running this
branch's E2E suite:

```bash
npx nx run social:deploy-prisma
```

The migration does not delete comments or change the auth database/gRPC
contract. Root/reply reads continue to include deleted comments so their
descendants remain reachable.

Only authors may delete their own posts or comments. Post deletion sets
`deletedAt` and clears `body`/`url`; its title and existing thread remain readable
through `post(id)`, but author listings exclude it and new comments are rejected.
Comment deletion replaces its body with `[deleted]` and sets `deletedAt` without
removing descendants. `commentCount` counts all stored comments, including
soft-deleted ones, and is not decremented on deletion. New-comment payloads
have `hasReplies: false`; delete payloads report existing reply availability.
Use `comments(postId, parentId)` to read descendants one level at a time.

### Profile activity

Public profiles combine two services: call auth's `user(username)` for the
public profile and its ID, then social's `postsByAuthor` and `commentsByAuthor`
with that `authorId`. Public profiles never include email; use auth's `me`
for the signed-in caller's private account. There is no cross-database join
or new auth/gRPC contract. A frontend profile page is not implemented yet.

Both activity queries return `items`, `nextCursor`, and `hasMore`, default to
25 items, and accept limits of 1-100. Each fetch materializes at most
`limit + 1` rows and excludes the lookahead from the response. Comments
include roots and replies across posts, with `postId`, `parentId`, and
`hasReplies` for navigation. Each query excludes its own soft-deleted rows;
live comments on a deleted post remain visible because the thread survives.
An unknown author ID returns an empty terminal page.

Activity sorts by creation time descending, then ID ascending. The cursor
is the last visible item's ID and must exist for the same author and content
type. Missing or foreign cursors produce a `400`-shaped error. Author and
cursor IDs must be nonempty and at most 128 characters. Omitted/null cursors
start at the beginning. A cursor that was soft-deleted between requests still
works: paging compares its stored creation time and ID instead of requiring
the anchor to remain in the live result set. Posts and comments have separate
cursors, and switching authors starts a new pagination session.

Edits and votes do not reorder activity. These are live pages, not snapshots:
new records and deletions can change what is visible between requests.
`hasReplies` remains a current availability hint, not a nested reply payload.

```graphql
query ProfileActivity($authorId: String!) {
  postsByAuthor(authorId: $authorId, limit: 25) {
    items {
      id
      title
      body
      url
      createdAt
      editedAt
      score
      commentCount
    }
    nextCursor
    hasMore
  }
  commentsByAuthor(authorId: $authorId, limit: 25) {
    items {
      id
      postId
      parentId
      body
      createdAt
      editedAt
      score
      hasReplies
    }
    nextCursor
    hasMore
  }
}
```

### Content editing

`UpdatePostInput` requires `id` and at least one of `title` (3-300 characters),
`body` (1-40,000 characters), or a valid `url`. Omit unchanged fields; explicit
nulls and an empty patch are invalid. Text posts can change title/body and
link posts can change title/url. Editing cannot convert between text and
link posts. `UpdateCommentInput` requires `id` and `body` (1-10,000 characters).
IDs must be nonempty and at most 128 characters.

Only the authenticated content author can edit, including after leaving the
community. Stored moderator/owner roles do not grant editing privileges over
another user's content. Missing targets produce `404`, other authors `403`,
and deleted targets `400`-shaped errors. Live comments on deleted posts remain
editable; new comments on those posts are still rejected.

Each successful edit sets `editedAt`. It is null for new/previously unedited
records, including pre-migration data. Do not use `updatedAt` as an edit
indicator: votes and comment counters also update rows. Edits preserve IDs,
authorship, location, creation time, scores, counters, and descendants.
Conditional writes require the target to remain live, so an overlapping
deletion cannot restore cleared post content or a deleted comment body.
Overlapping edits use last-writer-wins for supplied fields; there is no edit
history or optimistic version check. Even a same-content edit records a new
edit timestamp.

```graphql
mutation EditPost($input: UpdatePostInput!) {
  updatePost(updatePostInput: $input) {
    id
    title
    body
    url
    createdAt
    editedAt
  }
}

mutation EditComment($input: UpdateCommentInput!) {
  updateComment(updateCommentInput: $input) {
    id
    postId
    parentId
    body
    editedAt
    hasReplies
  }
}
```

The additive `20261004195514_add_profile_activity_content_edits` migration
adds nullable `editedAt` columns to Post/Comment and an author-comment index
on `(authorId, createdAt DESC, id)`. Apply it before starting the updated
social service or E2E:

```bash
npx nx run social:deploy-prisma
```

Existing edit timestamps stay null; no inferred backfill is performed.
Build/test targets regenerate the social Prisma client. Regenerate frontend
schema types to use the new queries, inputs, and fields. Existing valid
GraphQL selections remain compatible; malformed/foreign author cursors are
now rejected explicitly. No auth migration or proto regeneration is required
for this batch. See [the frontend handoff](11-frontend-handoff.md) for client
integration and remaining backend work.

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

The E2E target builds, starts, and stops both auth and social through Nx.
Auth uses `auth:serve-e2e`, which raises login/registration budgets to 1000
for fixture creation only; ordinary development limits are unchanged.
The target needs a running Postgres instance with both services' migrations applied.
Tests register unique users and communities to avoid collisions on reruns.
`AUTH_HTTP_URL` can override the test client's auth address (default
`http://localhost:3000`); the social test address uses `HOST` and `PORT`
(defaults `localhost` and `3001`). The applications still use their own `.env`
configuration when started by Nx.

Unit tests cover creation, conflicts, missing communities, ownership,
membership counters, module wiring, pagination, resolver forwarding, and DTO
validation. They use a mocked Prisma client and do not require Postgres.
Posts and comments specs also cover module exports, membership/ownership,
text-versus-link input, bounded sibling pagination, invalid parents/cursors,
soft deletion, and a post deleted between the initial lookup and transaction.
Resolver specs mock services and guards to check authenticated argument forwarding;
they do not prove the real authentication path.
E2E tests cover the real cookie-to-gRPC authentication handoff, public reads,
rejected anonymous and forged-cookie mutations, duplicate slugs, input
validation, pagination, and repeated and concurrent joins/leaves.
They also exercise post/comment permissions, author pagination, paginated replies,
deletion behavior, concurrent comment counters, and concurrent post deletion.
Feed and vote specs cover score deltas, target locking, private lookup forwarding,
input bounds, SQL parameters, sorting, time windows, and both pagination modes.
E2E also exercises vote retries, flips, removal, concurrent mixed changes,
missing targets, private lookup isolation, and public feed scoping/pagination.
All social E2E feature suites share `src/support/gql.ts` for registration,
login cookies, and GraphQL requests.

[`comment-pagination.spec.ts`](../apps/backend/social-e2e/src/social/comment-pagination.spec.ts)
adds 105-root pagination, independent reply pages, score ordering, empty leaf
pages, DTO bounds, cursor/parent isolation, soft-deleted parent reachability,
a 40-level thread traversed one page at a time, and schema checks that remove
the recursive field.

[`profile-activity-editing.spec.ts`](../apps/backend/social-e2e/src/social/profile-activity-editing.spec.ts)
adds cross-service public profile activity, independent bounded pages,
deleted-cursor continuation, validation, author-only text/link/comment edits,
immutable fields, edit timestamps unaffected by votes/counters, retained
replies, edits after leaving, and concurrent edit/delete safety. Colocated
service/resolver/DTO specs cover the corresponding rules and conditional writes.

Use `npx nx run social:migrate-prisma --name <migration>` to create a future
migration in development. Use `social:deploy-prisma` to apply committed
migrations without creating new ones.

The vote constraint migration fails if existing rows have invalid values or
zero/two targets. Audit and repair such rows deliberately before deploying;
the migration does not delete data or recompute existing scores automatically.
