# 15 - Web Profiles and Settings

## Routes and ownership

`/u/[username]` is a public profile. It renders the public username, bio,
avatar, join date, and bounded Posts/Comments activity. Author names in feed
cards and live discussion comments link to this route. Deleted comments
retain their tombstone rather than linking to an author.

Signed-in navigation includes the caller's public profile. `/account` remains
the private account view; `/account#profile-settings` opens its profile editor.
Only bio and avatar URL are editable. Username, email, and passwords are not
editable through this form. Content editing/deletion and community settings
are separate workflows, not included here. Discussion author controls are
documented in [content editing/deletion](16-web-content-editing-and-deletion.md).
Own activity cards also expose author-only content editing/deletion. Successful
edits retain loaded pages, and confirmed deletions remove their activity rows
without resetting the next cursor. Public visitors have no such controls.

## Public and private data

`PublicProfile(username)` selects auth's `user` fields: `id`, `username`,
`bio`, `avatarUrl`, and `createdAt`. It uses a separate, per-screen Apollo
client with `credentials: omit`, browser HTTP `cache: no-store`, and Apollo
`no-cache`. It never reads a private `Account` object to render public fields.
There is no email selection in the public operation and no authenticated
server-side rendering. Public profile data loads in the browser.

`SaveProfile(input)` uses auth's existing credentialed, noncached private
client and caller-scoped `updateUser`. Its returned `Account` stays in the
session provider, not social or public-profile caches. A successful save
updates the current account view and navigation avatar. Later public profile
navigation loads current data from auth rather than reusing account state.
Session revisions prevent a late save from restoring an account after logout
or replacing a newer session. Unauthorized saves recheck `me`; network and
validation failures retain drafts without automatically retrying writes.

## Activity pagination

Public `postsByAuthor` and `commentsByAuthor` use the public user's ID and a
page size of 20. The activity tab is represented in the URL (`?tab=comments`);
unknown values use Posts. Tabs query only when first visited and retain
independent accumulated pages and cursors while switching within one profile.
Changing authors resets both lists. Reload starts with the first page of the
selected tab.

Load-more requests are serialized, append by ID without duplicates, preserve
existing rows on failure, and retry the same cursor explicitly. Missing or
repeated cursors stop pagination. Refresh resets the selected list to its
first page. Activity order is the backend's creation-time/ID order; votes and
edits do not reorder it. Vote controls reuse the existing account-scoped
private vote restoration and mutation handling.

Comment activity identifies comments/replies and links to their discussion's
`#comments` section. It does not promise to locate an exact comment: the API
has no single-comment lookup, and a target may be on a later root page or
inside a collapsed reply branch. Live comments on deleted posts follow the
backend's existing activity/deletion rules. No total activity counts are
inferred from a loaded page.

## Settings and avatar handling

The editor validates bio length at 300 characters and avatar URLs as public
HTTP/HTTPS URLs without credentials, with a frontend length cap of 2,048.
Avatar URL whitespace is trimmed; bio text is preserved. The backend remains
authoritative. Unchanged fields are omitted from patches. Empty bio writes
an empty string; clearing an existing avatar writes explicit `null`.
Saving an unchanged form is disabled. Save and Cancel are disabled while a
write is pending, and repeated submissions cannot duplicate a pending write.
Cancel discards the draft; successful saves reset dirty state.
Disabled, unchanged Save changes buttons use the unavailable cursor, not a
busy cursor. The busy cursor, spinner, and `aria-busy` state apply only during
an actual submission and clear after success, failure, or validation errors.

Avatar images load directly in the browser with `referrerPolicy: no-referrer`
and Next image optimization disabled. Arbitrary avatar URLs are never fetched
by the Next server/image optimizer. Invalid schemes, URLs with credentials,
missing images, and image load failures use initials. Image containers have
fixed dimensions, so loading/error states do not shift the layout.
Post cards on Home, community feeds, profile activity, and discussions use
the same avatar renderer at 42px, with lazy loading and the username retained.
Social's nullable `Post.authorAvatarUrl` resolves current profile data via
auth's internal `GetUserAvatars` RPC. A per-GraphQL-context DataLoader batches
and deduplicates author IDs, with at most 100 IDs per RPC and a 1.5-second
timeout. Auth selects only IDs and avatar URLs; email/password never cross
this endpoint. Missing users/avatars and RPC failures return `null` so posts
remain readable with initials. No avatar snapshot is stored in social and no
database migration is needed. A new request reads current profile data after
an avatar change or removal; an already rendered page updates on refresh.
An external avatar host still receives the viewer's image request/IP;
there is no upload or image-proxy service in this implementation.

## Verification

From the repository root:

```bash
npm run codegen:web
npm run test:web -- --maxWorkers=2
npx nx run-many -t lint,typecheck,build -p web
npx nx lint web-e2e
npm run test:e2e:web -- --workers=1
```

Unit specs cover validation/patches, safe routes, isolated public transport,
avatar fallback, failed drafts, pending-save serialization, account identity,
expired sessions, and late save responses after logout. Mocked browser tests
exercise public/private separation, author/tab pagination, retry, settings,
desktop/mobile bounds, and images. Screenshots/traces are under ignored
`test-results/web`.

With auth/social APIs and migrated databases running:

```bash
npm run test:e2e:web:live -- --workers=1
```

The live profile smoke test creates a unique account, saves a bio using the
real cookie/API, verifies reload/public activity/anonymous access, and logs
out. The live discussion smoke test updates an existing post author's avatar
through auth and verifies its image in discussion, profile activity, and Home
through social's real gRPC lookup. Test accounts remain in the local auth
database. Profile editing uses
existing profile mutations and requires no database migrations. The social
avatar field adds the `dataloader` runtime dependency and extends the internal
auth protobuf contract; regenerate bindings with `npm run codegen` and restart
both backends when deploying this change. Avatar URLs still point at external
images; there is no server-side upload, resizing, or proxy.
