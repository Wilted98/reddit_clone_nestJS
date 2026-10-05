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

Run the app with `npx nx dev web` and open `http://localhost:4200`.
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

Global and community feeds automatically request the next page when an
`IntersectionObserver` sentinel comes within 240px of the viewport bottom.
Automatic requests preserve the reading position and stop at pagination
boundaries, after an error, or when a response adds no new posts or repeats
the requested cursor. The load-more button remains available for manual
loading, retry, and browsers without `IntersectionObserver`. Manual loading
scrolls to and focuses the first newly appended post, rather than following
the button down the page. Successful refresh resets automatic paging.
The community directory retains explicit button pagination.

Next-page requests display a centered spinner and a live loading status at
the end of the current posts for at least 700ms, or until the request settles
if it takes longer. Newly fetched posts appear after this interval; pagination
and refresh remain locked during it. Existing posts remain readable, and
reduced-motion preferences disable spinner animation.

No shared field policy merges differently scoped feeds. Reopening a route
fetches fresh data rather than reusing an accumulated list from another view.

## Content rendering and errors

Post cards display public author usernames, creation dates, optional edit
markers, text or link content, and read-only score/comment totals. Dates use
UTC; counts use compact formatting while accessible labels retain full totals.
Long bodies remain available through an expandable full-text section.

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

The public `Post` model exposes `communityId`, not community name/slug fields.
Global cards therefore do not invent community labels or make unbounded
community lookup requests. A scoped feed identifies its community in the
page header using `community(slug)`.

The API does not expose caller membership/role context. No joined/leave state
is inferred from member counts or stored locally as if it were authoritative.
Score/comment totals are not interactive voting or discussion controls.
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
retries, late responses, automatic feed loading, manual-load scroll position,
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
