# 14 - Web Posts, Discussions, and Voting

## Routes and operations

| Route                     | Access                               | Operations                                                            |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `/posts/[id]`             | Public reading; authenticated writes | `post`, `comments`, `createComment`, own-vote queries, vote mutations |
| `/submit`                 | Authenticated composer               | `communities`, `joinCommunity`, `createPost`                          |
| `/submit?community=craft` | Authenticated, preselected community | Same as `/submit`                                                     |

Feed titles and comment totals link to the discussion. The sidebar opens the
composer, and community headers preselect their slug. Unknown posts show a
missing-post state; API failures remain retryable. Social requests include
the existing httpOnly auth cookie. The current API includes public
`Post.communitySlug` and private `myCommunities` for feed labels and sidebar
subscriptions; these additions require no database migration. Setup,
endpoint configuration, and production commands are in
[web foundation](12-web-foundation.md).

## Posting

The composer uses React Hook Form and Zod. Titles are trimmed and bounded to
3-300 characters. Text posts require 1-40,000 trimmed characters. Link posts
accept absolute public HTTP/S URLs without credentials. The selected type
determines the mutation payload: a retained draft of the other type is never
sent. Server validation remains authoritative.

The community selector pages the public directory, 20 entries per request.
A URL-preselected slug remains selectable even if outside the first page;
the backend validates its existence. Joining requires an explicit button
click and does not publish a post automatically. The join mutation is
idempotent; its success notice confirms that action, not a persistent
membership lookup. There is still no authoritative joined/leave toggle or
community-role UI because arbitrary-community caller role context is unavailable.
Successful joins refresh the sidebar's authoritative subscription list.

Publishing requires membership. Validation, membership, and transport errors
preserve form values. Publishing and joining are serialized. A confirmed
publish replaces the form with a success link and navigates to its discussion,
preventing another submit while navigation finishes. Mutations are never
automatically retried. Network failures after a server write remain ambiguous
without backend idempotency keys.

## Comments and replies

Each sibling list requests `comments(postId, parentId, cursor, limit: 20)`.
Root comments and every expanded parent's direct replies own independent
cursor, loading, and retry state. No recursive tree query or eager descendant
fetch is used. Replies load only after expansion; collapsing an already-open
list keeps its paging state and drafts. Visual indentation stops increasing
after three levels so deep threads remain readable on small screens.

More-page failures retain existing comments and retry the same cursor only
after an explicit action. Overlapping rows merge by ID. Pages are live ranked
views rather than snapshots, so concurrent votes can change their ordering.

Writing requires authentication, not community membership. Bodies are trimmed
and bounded to 1-10,000 characters. Root comments omit `parentId`; replies send
their actual parent ID. A confirmed comment is inserted ahead of loaded
siblings and deduplicated with subsequent query results. The existing server
cursor remains available. Reopening the page reads its authoritative ranking.
Post totals refresh separately; a failed totals read is not a failed write
and does not resubmit the comment. Drafts remain after failed writes and clear
after confirmed writes or an account change.

Deleted posts display a tombstone and retain their readable discussion, but
offer no composer or reply action. Deleted comments display `[deleted]` while
their descendants remain reachable; live posts still permit replying beneath
a deleted parent. User content is plain text; external links use the same
HTTP/S validation as feed cards.

## Voting and privacy

Voting controls use compact direction/count pills in discussions and feeds.
Anonymous controls link to account sign-in and never issue private vote
queries. Signed-in post and sibling-list groups query `myPostVotes` or
`myCommentVotes` in batches, not once per comment. Buttons wait until the
caller lookup succeeds; lookup failures offer an explicit retry.

Own-vote queries select only `targetId` and `myVote`. Their backend score is a
placeholder and is never displayed. Totals come from public post/comment
responses or a successful vote mutation. Selecting the current direction
sends 0 to remove the vote; switching direction sends 1 or -1. Each target
permits one pending write. Failures retain its last confirmed score and vote,
with no optimistic count changes or automatic retry.

Private lookups and mutations use `no-cache`. Voting state and write forms
are scoped to the account ID and unmount on logout/account changes. Public
screens never select or render email. Unauthorized/forbidden private lookup or mutation failures
recheck the auth session before treating a permission failure as a logout.
This does not revoke copied JWTs or replace deployment security controls.

## Verification

```bash
npx nx run-many -t lint,typecheck,test,build -p web
npx nx lint web-e2e
npx nx e2e web-e2e
```

Run build/code generation before browser tests when reusing a dev server:
regenerated modules can trigger hot reload and reset an in-flight test.
Default desktop/mobile tests mock API boundaries and cover navigation,
independent root/reply pages, lazy expansion, collapsed drafts, write errors,
text/link payloads, membership failures, vote restoration/toggling, privacy,
tombstones, and responsive rendering. Fixtures are test-only.

With both migrated APIs running, `npx nx run web-e2e:e2e-live` also verifies
publishing, commenting, vote mutations, and vote restoration after reload
using a real cookie and isolated test account/community. It soft-deletes its
own post/comment afterward; its account, community, membership, and
soft-deleted rows remain in the local databases. Never point this smoke test
at a production service.
