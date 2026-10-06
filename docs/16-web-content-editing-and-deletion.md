# 16 - Web Content Editing and Deletion

## Access and operations

`/posts/[id]` exposes Edit/Delete actions for the signed-in author of a live
post or comment through a three-dot options button in the top-right of its
author/date header. The caller's `/u/[username]` Posts/Comments activity uses the
same options, inline editors, and deletion modals. Closed options consume no
footer space; headers reserve room so metadata cannot overlap the button.
Edit/Delete commands are hidden until the options are opened;
Escape, clicking outside, or tabbing away closes them. Escape returns focus to
the options button, and commands support native keyboard activation. Other profiles
and anonymous viewers have no content-management controls. Feed cards link
to discussions without inline editors. Public screens never select or render email.
Client ownership checks are presentation only: the existing social API guards
and author checks authorize every mutation.

| Web operation   | API mutation                        | Response                     |
| --------------- | ----------------------------------- | ---------------------------- |
| `EditPost`      | `updatePost(updatePostInput)`       | `DiscussionPost` fragment    |
| `RemovePost`    | `deletePost(id)`                    | `DiscussionPost` fragment    |
| `EditComment`   | `updateComment(updateCommentInput)` | `DiscussionComment` fragment |
| `RemoveComment` | `deleteComment(id)`                 | `DiscussionComment` fragment |

Operations use the existing credentialed social Apollo client with `no-cache`.
This UI requires no new dependencies, schema changes, or database migrations;
the existing content-editing backend migration must already be deployed.
See [social editing contracts](09-social-service.md#content-editing) and
[web setup](12-web-foundation.md).

## Editing

Editors use React Hook Form/Zod and the same rules as publishing: trimmed
titles of 3-300 characters, text bodies of 1-40,000 characters, public HTTP(S)
links without credentials, and comment bodies of 1-10,000 characters.
There is no community, identity, parent, or post-type control. Text posts edit
title/body; link posts edit title/URL. Post patches omit unchanged fields.
Comment edits send only ID and the trimmed body. Unchanged forms disable Save;
normalization-only changes do not issue a mutation. Cancel discards the draft.

Only a confirmed mutation updates displayed content and the `Edited` marker.
Local content overlays exclude score/count fields so later totals reads do not
revert a confirmed edit or overwrite vote state. Authoritative deleted query
results take precedence over live overlays. Loaded comment pages, expanded
replies, and sibling cursors remain mounted after successful edits/deletions;
post totals refresh separately after comment writes. A failed totals refresh
does not repeat a successful mutation.
The API's `commentCount` includes stored deleted-comment placeholders and does
not decrement on deletion; the UI follows that authoritative count.

## Deletion

Delete first opens a native modal dialog; Cancel or Escape performs no write
and returns focus to the options button. The modal traps focus, makes background
content inert, and locks background scrolling. The document reserves a stable
scrollbar gutter so opening or closing the modal does not shift the page.
Cancel receives initial focus.
Pending writes disable confirmation/cancellation and prevent Escape dismissal;
errors remain inside the modal for explicit retry or reload. The confirmation
describes the retained discussion/replies and warns that deletion cannot be
undone. Confirmed post
deletion removes body/URL, displays `[Deleted post]`, and removes its write,
vote, and new-comment controls. Its thread remains readable. Deleted comments
display `[deleted]` and lose author/edit/delete/vote controls, while expanded
or subsequently loaded descendants stay reachable. Live posts still allow
replies under a deleted parent. Authors may still edit/delete their live
comments on a deleted post; creating new replies there is disabled.

Feed and profile activity use fresh queries on navigation/reload, so the API
excludes deleted content there. There is no optimistic deletion or undo.
Confirmed profile deletions remove the row immediately, retaining other loaded
activity and its cursor, including continuation past a deleted anchor. Profile
edits update the row without issuing a fresh first-page query. Explicit Refresh
resets the selected tab to its first page; a refresh started before a later
confirmed mutation cannot clear that mutation's local changes. Failure actions
on profiles are labeled Reload activity and reload the current profile.

## Failures and sessions

Each target allows one pending edit or deletion. Inputs, Cancel, and confirmation
buttons disable during writes. Failed edits preserve the draft; failed deletes
preserve the original content and confirmation. Retry is an explicit user action,
never an automatic mutation. Unauthorized/forbidden failures recheck the auth
session. A still-valid session keeps its draft; logout/account changes unmount
the author controls and discard drafts. Late responses from those unmounted
controls cannot update another session's UI.

Mutation responses must match the target and author; delete responses must
include a deletion timestamp. Errors offer an explicit Reload conversation
action to read authoritative state after missing/deleted targets or ambiguous
transport failures. Reload discards unsaved drafts and pagination state.
Backend edits remain last-writer-wins, without version conflicts or idempotency
keys. A network failure after a completed server write is ambiguous; reload
before deciding whether to retry. This UI is not real-time cross-tab syncing.

## Link feedback

Community labels on post cards underline and change color on hover and keyboard
focus. Their native community links remain above the stretched discussion link,
so clicking them does not open the post. Existing author/title feedback is unchanged.

## Verification

```bash
npm run test:web
npx nx run-many -t lint,typecheck,build -p web
npx nx lint web-e2e
npm run test:e2e:web
# With migrated auth/social APIs running locally:
npm run test:e2e:web:live
```

Run codegen/build before browser tests when sharing a development server.
Unit tests cover ownership, validation, typed patches, mutation serialization,
draft preservation, confirmation, permission rechecks, response validation,
and late-response protection. Mocked desktop/mobile tests cover text/link edits,
reload persistence, independent comment pages/replies, deletion/totals/tombstones,
session expiry, privacy, responsive layouts, and community hover/focus feedback.
The live discussion smoke test also edits and deletes its own post/comment from
discussions and profile activity and checks persisted results with the real Nest cookie. Cleanup still
soft-deletes its own content if the test fails. Its account, community,
membership, and soft-deleted records remain in local databases. Never run it
against production.
