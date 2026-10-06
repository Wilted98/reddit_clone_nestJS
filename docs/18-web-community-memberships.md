# 18 - Web Community Memberships

## Route and API contracts

`/communities/joined` lists the signed-in account's joined communities. It is
linked from the public directory and the sidebar's Manage communities action.
The shared shell, discovery rail, sidebar disclosure preferences, and mobile
layout are unchanged. Guests see a sign-in link and do not issue membership
queries. Session restoration precedes the private list. The list remounts on
account changes and disappears on logout; membership data is not persisted
in browser storage or server-rendered HTML. Membership queries disable Apollo's
in-flight request deduplication so a new account cannot reuse a prior account's
pending request with the same variables.

The typed `JoinedCommunities` query calls `myCommunities(cursor, limit)` with
pages of 20. `JoinedCommunity` extends the existing summary fragment with
the already-exposed `ownerId` field. Ownership is displayed only when that
ID matches the current account. Other returned memberships are labeled
Joined, not assigned a guessed MEMBER/MODERATOR role. Counts and recent
visits never establish membership; an absent item on a partial page does
not establish non-membership.

The typed `LeaveCommunity` mutation calls `leaveCommunity(slug)` with the
existing httpOnly cookie. The backend derives the caller identity and remains
the permission authority. Owners have no Leave control, and the API also
rejects an owner departure. No backend schema changes, migrations, or new
environment variables are needed.

## Pagination and departures

Next pages load automatically near the end, with the shared minimum 700ms
loader. A manual Load more communities fallback focuses and scrolls to the
first new community. Items deduplicate by ID; failures, repeated cursors, and
pages without new visible items pause automatic requests. Failed pages retain
the existing rows and retry the same cursor only on explicit action. Removing
all loaded rows keeps the cursor available and shows a page-empty state while
more memberships remain. Paging
and departures are serialized within the view. Initial outages have a retry
control, while an empty membership list has its own state.

Leaving opens a native confirmation dialog. Cancel is initially focused,
Escape cancels when idle, and focus remains trapped by the modal. The body
is scroll-locked with the existing stable root scrollbar gutter. Pending
writes disable confirmation/cancellation and are never automatically retried.
Transport and permission errors stay inside the dialog without removing the
row. Unauthorized/forbidden failures recheck the session without replaying the
write; permission errors do not automatically imply logout.

Only a successful, matching community response removes a membership. The
view remembers confirmed departures until it unmounts, so stale overlapping
pages cannot restore them. Active sidebar subscription queries are refreshed;
a sidebar refresh failure does not undo the confirmed departure. Cancel
returns focus to the opener; success returns focus to the Joined communities
heading when its row is removed. Late results after navigation or an account
change do not mutate the new view. Reload reads authoritative memberships.

Leaving does not delete posts/comments or remove the author's editing rights.
Recent visits remain separate browsing history. Joining is still available
through the post composer; see [posting](14-web-posts-discussions-and-voting.md).
Arbitrary-community joined/role lookup, community settings, ownership transfer,
community deletion, and moderation are not added by this screen.

## Verification

Follow [web setup](12-web-foundation.md) to run Docker, migrated APIs, and the
web app. Open `http://localhost:4200/communities/joined` while signed in.

```bash
npm run codegen:web
npm run test:web -- --maxWorkers=2
npx nx run-many -t lint,typecheck,build -p web
npx nx lint web-e2e
npm run test:e2e:web -- --workers=2
npm run test:e2e:web:live -- --workers=1
```

Unit tests cover owner/guest guards, matching responses, cancellation, focus
restoration, serialized writes, errors, session rechecks, and late responses.
Mocked desktop/mobile tests cover entry points, long names and viewport bounds,
confirmation layout, subscription refresh, pagination overlaps, automatic
paging stops/retries, empty lists, and session expiry. Existing content-control
tests also exercise the shared confirmation dialog.

The optional live discussion test checks its creator's Owner label, then
creates an isolated second account, joins that test community through the API,
and leaves through the web dialog. Reload and the real member counter verify
the result. Cleanup attempts an idempotent departure even after a failure.
The suite retains both test accounts and the test community, and soft-deletes
its discussion content afterward.
