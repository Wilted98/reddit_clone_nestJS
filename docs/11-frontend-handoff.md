# 11 - Frontend Handoff

The core discussion APIs are implemented. The Next.js web app supports account
sessions, public feed/community browsing, post composition, bounded discussions,
and voting, public profiles/activity, and own bio/avatar settings. Content
editing/deletion screens remain frontend work. See
[web foundation](12-web-foundation.md) for setup and
[web social browsing](13-web-feeds-and-communities.md) for pagination and rendering,
and [web discussions](14-web-posts-discussions-and-voting.md) for write workflows.
See [web profiles/settings](15-web-profiles-and-settings.md) for public/private
profile ownership, activity pagination, and caller-scoped editing.
This is an API handoff, not a declaration
that membership/settings, moderation, recovery, or public-deployment work
is complete. Keep frontend branches to one or two workflows at a time.

## Local connections

Follow [the root setup](../README.md#local-setup), including Docker and both
databases' committed migrations. Run auth and social in separate terminals.

| Service | Browser endpoint                | Responsibility                                       |
| ------- | ------------------------------- | ---------------------------------------------------- |
| Auth    | `http://localhost:3000/graphql` | Accounts, public profiles, cookie sessions           |
| Social  | `http://localhost:3001/graphql` | Communities, posts, comments, activity, votes, feeds |

Auth's gRPC port 5050 is internal; a browser never calls it. Configure
`CORS_ORIGINS` in both backend `.env` files to allow the chosen frontend
origin. Keep local hosts consistent (for example, all `localhost`, not a
mixture of `localhost` and `127.0.0.1`). Production cookies require HTTPS;
cross-site hosting needs a deliberate cookie/CORS/security design.

Use credentials on requests to both services (`credentials: 'include'` for
fetch, or the client's equivalent). Auth login sets the `Authentication`
httpOnly cookie; social reads that same cookie and validates it through auth.
Do not put the JWT in localStorage or try to read the httpOnly cookie.
Use `me` to restore the caller's session, and clear private client state on
logout. Logout clears the browser cookie but does not revoke a copied token
server-side; see [authentication](04-authentication.md).

## Workflow contracts

| View or action                     | Operations                                                                 | Important behavior                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sign up / sign in / session        | Auth `createUser`, `login`, `me`, `logout`                                 | Account fields are private to the caller; login/registration can return 429                     |
| Global or community feed           | Social `feed`, `community`                                                 | HOT uses offsets; NEW/TOP use cursors; deleted posts are excluded                               |
| Community directory / join / leave | Social `communities`, `createCommunity`, `joinCommunity`, `leaveCommunity` | Creation makes the owner a member; owners cannot leave                                          |
| Post composition                   | Social `createPost`                                                        | Community membership required; text body or URL, never both                                     |
| Post and discussion                | Social `post`, `comments`, `createComment`                                 | Page roots and direct replies separately; commenting requires auth, not membership              |
| Public profile and activity        | Auth `user(username)`, then social `postsByAuthor`, `commentsByAuthor`     | Pass the public user ID to social; keep activity tabs' cursors independent                      |
| Own profile settings               | Auth `me`, `updateUser`                                                    | Caller-scoped bio (up to 300 characters) and avatar URL; email belongs to private account state |
| Content editing / deletion         | Social `updatePost`, `updateComment`, `deletePost`, `deleteComment`        | Author-only; soft deletion preserves discussions                                                |
| Voting and own vote state          | Social `votePost`, `voteComment`, `myPostVotes`, `myCommentVotes`          | Mutation returns updated score; private lookup score is a placeholder, not a displayed total    |

Use public `User` fields for profile routes, never cached private `Account`
objects containing email. See [the auth API reference](07-graphql-api-reference.md)
and [social operations](09-social-service.md#graphql-operations) for exact
inputs and examples. `myCommunities` provides the authenticated user's joined
community list for the sidebar. Arbitrary-community caller role context and
community settings updates are still unavailable. Do not infer joined state
from `memberCount` or recent visits; role-aware controls require that backend work.

## Pagination and edit state

Pages expose `items`, `nextCursor`, and `hasMore`. Use independent state per
feed mode/community, profile author/activity tab, and comment post/parent.
Reset it when scope changes. Most limits default to 25 and accept 1-100;
HOT uses an offset capped at 500 rather than an ID cursor. Comments are
incremental sibling pages, not recursive trees: expand using `parentId` when
`hasReplies` is true. Votes can reorder thread/feed pages between requests;
these are not snapshots. See [bounded comments](09-social-service.md#bounded-comment-retrieval).

Profile activity uses creation-time/ID ordering, so edits/votes do not reorder
it. Deleted posts/comments disappear from their respective activity lists;
live comments on a deleted post remain readable/editable. Soft-deleted
activity cursors still resume correctly. Follow comments via `postId` and
`parentId`; there is no separate public single-comment query yet.

Show an edit marker only when `editedAt` is non-null, never from `updatedAt`.
Post patches omit unchanged fields and reject nulls/empty patches; preserve
the original text/link type. Comment editing requires a new body. Show edit
and delete actions for live content when `me.id === authorId`; the server
still enforces this permission. Leaving a community does not remove an
author's right to edit existing content. Concurrent edits are last-writer-wins
for supplied fields, not versioned history. Refresh affected lists after a
mutation; don't optimistically restore content deleted by another request.

## Errors and session state

Inspect GraphQL `errors` even when HTTP status is 200; a successful transport
does not mean the mutation succeeded. Resolver exceptions expose structured
details such as `extensions.originalError.statusCode`. Input/schema errors
may be HTTP 400 and have a different shape, so keep a generic fallback.

- Auth `UNAUTHENTICATED` or social `FORBIDDEN` can mean a missing/expired
  session; permission failures also use `FORBIDDEN`. Recheck `me` before
  assuming every forbidden response requires a login.
- Validation errors (400) should preserve drafts and report the rejected input.
- Missing targets (404) and deleted edit targets (400) should refresh state
  without losing the draft silently.
- Conflicts (409), such as a taken username/slug, should keep user input.
- Login/registration throttling (429) should stop immediate retry loops.
  `Retry-After` exists in the backend response, but the current CORS setup
  does not expose it to cross-origin browser JavaScript. A browser countdown
  based on that header needs an explicit backend exposed-header change.

## Suggested frontend batches

1. Foundation + auth/session screens (implemented).
2. Feed + community browsing (implemented).
3. Post composition/discussions + voting (implemented).
4. Public profile/activity + own bio/avatar settings (implemented).
5. Author-only post/comment editing and deletion (frontend work remaining).

Membership context + community settings are the next backend batch and can
be built alongside the community UI. Moderation + bounded search follow when
needed. Password recovery and deployment security/traffic controls remain
important before accounts become relied upon. See [the MVP roadmap](10-mvp-roadmap.md).
Notifications, chat, awards, uploads, and recommendation systems can wait.
