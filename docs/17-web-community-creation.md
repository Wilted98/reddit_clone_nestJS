# 17 - Web Community Creation

## Routes and operations

The directory at `/communities` links to `/communities/new`. The creation page
uses the existing AppShell, form styling, and responsive discovery rail.
Browsing the directory remains public. The form waits for session restoration
and is mounted only for a signed-in account; guests get an account link.
An account change discards the prior account's form.

The typed `CreateCommunity` operation calls social's
`createCommunity(createCommunityInput)` and requests the `CommunitySummary`
fragment. Requests include the existing httpOnly session cookie. No owner ID,
email, or token is accepted from the form or written to browser storage.
The backend atomically creates the community and its owner membership with
`memberCount: 1`; see [the social API](09-social-service.md#graphql-operations).

## Validation and writes

React Hook Form and Zod trim submitted values and match the API boundaries:

| Field       | Constraint                                         |
| ----------- | -------------------------------------------------- |
| Slug        | 3-24 lowercase letters, digits, or underscores     |
| Name        | 3-60 characters                                    |
| Description | Optional, up to 500 characters; omitted when empty |

Fields expose associated validation errors and invalid state. The description
has a character counter. The `r/` prefix is visual only, not part of the slug.
Names and descriptions are plain text, not HTML.

Creation is serialized while pending: fields and the submit button are
disabled, and repeated submit events cannot issue a second mutation. A
confirmed result locks the form against duplicate creation. The client
refreshes active subscription queries and opens the returned slug's
`/r/[slug]` page, which reads fresh community/feed data. That page links to
post creation with the new community preselected. A completion link remains
available if navigation has not completed. Late responses from an unmounted
form do not redirect the user's current page.

Slug conflicts, validation failures, and transport/server errors retain the
current draft and allow an explicit retry. Internal server details are not
shown. There are no automatic mutation retries or optimistic communities.
An expired/forbidden session triggers `me` restoration; if the account is no
longer authenticated the form is removed, without replaying its mutation.
Drafts do not persist across navigation or account changes.

## Configuration and verification

No backend migration or new environment variable is required. Use
[web setup](12-web-foundation.md) to start Docker, migrated auth/social APIs,
and the web app. Local creation is available at
`http://localhost:4200/communities/new`. Regenerate typed operations from the
committed schemas after changing the GraphQL document.

```bash
npm run codegen:web
npm run test:web -- --maxWorkers=2
npx nx run-many -t lint,typecheck,build -p web
npx nx lint web-e2e
npm run test:e2e:web -- --workers=2
```

Unit coverage checks validation bounds, trimming, empty description omission,
and rejection of owner fields. Mocked desktop/mobile browser coverage checks
directory navigation, confirmed creation, refreshed subscriptions, post
composer preselection, conflicts, failure drafts, request serialization,
guest/expired-session gating, late responses, and responsive layout.
The optional `npm run test:e2e:web:live` discussion test creates a real
community through this form before publishing; it retains its test account
and community, while soft-deleting its posts/comments afterward.

This UI does not add membership-role lookup, owner settings, community
deletion, uploads, or moderation. Those contracts remain separate backend
work. The client does not infer an arbitrary community's membership or role
from counts or a partial subscription page.
