# 13 - Web Feeds and Communities

## Routes and data sources

| Route          | View                                     | GraphQL operations                         |
| -------------- | ---------------------------------------- | ------------------------------------------ |
| `/`            | Public global feed                       | Social `feed`                              |
| `/communities` | Public community directory               | Social `communities`                       |
| `/r/[slug]`    | Community details and scoped feed        | Social `community`, `feed`                 |
| `/account`     | Registration, login, and private account | Auth `createUser`, `login`, `me`, `logout` |

`AppShell` provides shared navigation and account access. Social pages also
display a desktop discovery rail with up to five public communities, ordered
by the backend's member-count/ID ordering. This is a popular-community list,
not a list of the caller's memberships.

The topbar is sticky with an opaque background above scrolling content. Its
offset follows the desktop/tablet shell inset. The discovery rail sticks below
the topbar and scrolls independently when taller than the available viewport;
it is keyboard-focusable. Post, profile-tab, and comment anchors reserve room
below the header. The rail remains hidden at widths of 1050px or less, and the
topbar retains its existing mobile-hidden layout at 640px or less.

The desktop sidebar is sticky and bounded to the viewport height, with its
own overflow scrolling. On mobile it becomes normal page content and its
community shortcuts use an expandable section. Recently visited and Your
communities each have independent disclosure buttons; collapsing keeps the
loaded list mounted. Both start expanded. Their preferences are shared across
routes and stored as booleans under `roorin:sidebar-preferences` in localStorage,
independently of account identity. Tabs synchronize via storage events; blocked
storage falls back to shared in-memory state for client navigation, not reloads.
Missing or invalid stored preferences use the expanded defaults. Server HTML
uses these defaults and the browser restores saved choices during hydration.
Long sidebar slugs truncate with an ellipsis, with the
full slug and name available in the link tooltip. The sidebar uses a thin,
space-reserving scrollbar: its thumb appears on hover or keyboard focus and
remains visible on devices without hover. Recently visited shows the
last three distinct, successfully loaded community pages, newest first.
Only slug/name pairs are stored under an account-specific localStorage key;
guest history is separate. Invalid storage is ignored, and blocked storage
falls back to memory for that browser session. Missing communities are not
recorded. History is a browser convenience, not membership data.

Your communities reads authenticated `myCommunities` pages of 20, with
no-cache requests, deduplication, and explicit more/retry controls. It includes
owned communities, is scoped to the account ID, and clears from the UI on
logout. Guests never issue this private query. Successful composer joins
refresh the active list. No popular-community data is used as a subscription
fallback.

Run the app with `npx nx dev web` and open `http://localhost:4200`.
The directory's Create community action opens `/communities/new`; see
[community creation](17-web-community-creation.md) for its mutation and session rules.
See [web setup](12-web-foundation.md) for environment variables, build/start
commands, cookie/CORS settings, and schema generation.

Public browsing requires the social API but does not wait for auth session
restoration. Auth failures do not block public feed or directory queries.
Account operations still require the auth API.

## Feed filters

Filters live in URL search parameters:

```text
/?sort=NEW
/?sort=TOP&range=DAY
/r/craft?sort=TOP&range=WEEK
```

`sort` accepts `HOT`, `NEW`, and `TOP`, defaulting to `HOT`. `range` accepts
`ALL`, `DAY`, `WEEK`, and `MONTH` and only applies to `TOP`. Unsupported or
repeated parameters fall back to defaults; HOT/NEW use `ALL` regardless of
an incoming range. Sorting links and the time-range selector preserve the
community scope. Browser Back and reload restore filters from the URL.

## Pagination

Feed and directory pages request 20 items at a time. Queries use Apollo
`useQuery` with `fetchPolicy: 'no-cache'` and `ssr: false`; requests run in the
browser, and each mounted view owns its accumulated pages. `fetchMore` supplies
an explicit `updateQuery` to merge results. See
[Apollo's no-cache pagination API](https://www.apollographql.com/docs/react/pagination/core-api#using-fetchmore-with-queries-that-set-a-no-cache-fetch-policy).

- HOT starts at offset 0 and advances by the requested page size, not the
  number of distinct rendered posts. It never requests an offset above the
  backend cap of 500, including when the last valid page reports `hasMore`.
- NEW/TOP use the server's `nextCursor` with offset 0. They stop when
  `hasMore` is false or no next cursor is available.
- The directory uses `nextCursor` and `hasMore`, independently of the
  discovery rail's smaller query.
- Merges deduplicate rows by ID, preserve existing order, and replace an
  overlapping row with its updated response. Ranking/member-count changes
  can still cause skipped entries across requests; these are not snapshots.
- Changing feed sort, range, or community remounts the scoped feed view and
  starts pagination again. Old responses cannot append to the new view.
- Only one load-more request can run per view. Failure keeps existing rows
  and the same offset/cursor available for an explicit retry. No automatic
  request retry loops are configured.
- Refresh reloads the first feed page and resets its pagination position.

Global feeds, community feeds, and the directory request the next page when an
`IntersectionObserver` sentinel comes within 240px of the viewport bottom.
Automatic requests preserve the reading position and stop at pagination
boundaries, after an error, or when a response adds no new rows or repeats
the requested cursor. The load-more button remains available for manual
loading, retry, and browsers without `IntersectionObserver`. Manual loading
scrolls to and focuses the first newly appended post or community, rather
than following the button down the page. Successful feed refresh resets
automatic paging.

Next-page requests display a centered spinner and a live loading status at
the end of the current posts or communities for at least 700ms, or until the
request settles if it takes longer. Newly fetched rows appear after this interval; pagination
and refresh remain locked during it. Existing posts remain readable, and
reduced-motion preferences disable spinner animation.

No shared field policy merges differently scoped feeds. Reopening a route
fetches fresh data rather than reusing an accumulated list from another view.

## Content rendering and errors

Post cards display public author usernames, creation dates, optional edit
markers, a linked `r/communitySlug`, text or link content, and vote/comment pills. Dates use
UTC; counts use compact formatting while accessible labels retain full totals.
Long bodies remain available through an expandable full-text section.

Signed-in users can vote directly from global or community feeds. Visible
post IDs are looked up together through `myPostVotes`; vote mutations follow
the same confirmed-state rules as discussions. Guests get sign-in links.
The title's native link extends over the card surface, preserving keyboard
navigation and modified-click/new-tab behavior. Vote controls, community
links, external links, comment pills, and expanded text stay independent
targets. Comment pills link directly to the discussion's comments anchor.

User text is rendered as text, not HTML. External anchors accept only parsed
absolute HTTP/S URLs without embedded credentials, and use
`rel="noopener noreferrer"` when opening a new tab. Unsupported URLs are not
rendered as actionable links. Community names, descriptions, usernames, and
long unbroken text wrap within responsive containers.

Public email is never requested by social operations. Private email is shown
only on `/account`, not in public screens or initial server-rendered HTML.
See [session behavior](12-web-foundation.md#session-and-privacy-behavior).

Empty lists have explicit empty states. Initial query failures offer retry;
page failures retain loaded rows. Community `404`/`NOT_FOUND` errors show a
missing-community state with a directory link; transport/server failures
remain retryable and do not expose internal server details.

## API boundaries

The public `Post` model supplies `communitySlug`; cards do not infer it from
IDs or the popular directory. Private `myCommunities` supplies the sidebar
subscription list, but arbitrary-community caller role context is still
unavailable. No joined/leave state is inferred from counts or visit history.
Feed cards open [discussions](14-web-posts-discussions-and-voting.md), where
comment/reply composition and authenticated voting are available. Community headers open
the post composer with the community preselected.
See [social contracts](09-social-service.md) for the backend operations and
permission rules.

## Verification

```bash
npx nx run-many -t lint,typecheck,test,build -p web
npx nx lint web-e2e
npx playwright install chromium
npx nx e2e web-e2e
```

Unit specs cover filter normalization, pagination boundaries, overlapping
rows, missing-target errors, safe external links, dates/counts, and plain-text
post rendering. Default desktop/mobile browser suites mock auth and social
HTTP boundaries, including navigation, filter/history behavior, pagination,
retries, late responses, automatic feed/directory loading, manual-load scroll
position,
sidebar disclosures, long-slug truncation, hover/focus scrollbar behavior,
empty lists, missing communities, privacy, and layout.
Mock fixtures are test-only; the app does not fall back to demo content.

With both migrated APIs running:

```bash
npx nx run web-e2e:e2e-live
```

The live social smoke test reads existing feed/directory data and opens a
community when available, without creating or changing social records. The
separate live auth test creates one unique local account and verifies its
real cookie through registration, reload restoration, and logout.
