# 10 - MVP Roadmap

Roorin is a NestJS learning project with a Reddit-style discussion workflow,
not a one-to-one clone. Keep changes to one or two features per branch,
including their tests, API documentation, and deployment notes.

## Batch 1: implemented

Branch: `feat/auth-profile-privacy-rate-limits-tests-and-docs`.

1. **Public/private profile separation.** Public `user(username)` returns
   `User` without email. `createUser`, successful `login`, `me`, and
   `updateUser` return `Account` with the new or authenticated caller's own
   email. Public lookups select only public database columns. Neither type
   exposes passwords.
2. **Login and registration rate limiting.** Independent per-IP budgets
   default to 10 login attempts and 5 registrations within 60 seconds.
   Configuration, error responses, proxy requirements, and in-memory storage
   limitations are in [authentication](04-authentication.md#login-and-registration-rate-limiting).

### Client migration

Remove email selections from `user(username)` and use `me` for the caller's
own email. Regenerate client schema types; account operations now return
`Account`, so fragments targeting `User` on those operations must target
`Account` instead. Public `User` and private `Account` are distinct GraphQL
object types. No Prisma migration or internal gRPC contract change is needed.

## Batch 2: implemented

Branch: `feat/social-bounded-comments-tests-and-docs`.

**Bounded comment retrieval** is a single-feature batch. `comments` now pages
roots or one parent's direct replies (25 by default, 1-100 supported).
`hasReplies` uses indexed existence checks; recursive `Comment.replies` and
whole-post tree loading are removed. Cursors are checked against the same
post and parent. Deleted parents and their descendants remain reachable.

This is a breaking GraphQL change and requires the additive sibling-index
migration. See [the social guide](09-social-service.md#bounded-comment-retrieval)
for client updates, examples, migration commands, and live-ranking caveats.
Unit and real-database E2E coverage include wide and deep threads.

## Batch 3: implemented

Branch: `feat/social-profile-activity-content-editing-tests-and-docs`.

1. **Profile activity.** Reuse auth's public `user(username)` and social's
   `postsByAuthor`; add bounded `commentsByAuthor` for roots/replies across
   posts. Activity cursors are author-scoped and survive soft-deleting their
   anchor. A frontend profile page remains separate UI work.
2. **Post/comment editing.** Authors can patch their live content without
   changing its identity, location, counters, or text/link type. Nullable
   `editedAt` records content edits independently of vote/counter updates.
   Conditional writes prevent an edit from resurrecting deleted content.

This is an additive GraphQL change with a required social migration. See
[the social guide](09-social-service.md#content-editing) for validation,
permission rules, deployment, and concurrent-edit limitations.

## Frontend handoff

This completes the core discussion API milestone, not every backend feature
or production-hardening task. The web app supports account sessions,
[feed/community browsing](13-web-feeds-and-communities.md),
[posting/discussions/voting](14-web-posts-discussions-and-voting.md),
[public profiles/settings](15-web-profiles-and-settings.md),
and [author editing/deletion](16-web-content-editing-and-deletion.md);
see [the web technical reference](12-web-foundation.md).
Keep the same one-or-two-feature workflow. [The frontend handoff](11-frontend-handoff.md)
maps these screens to the current contracts and cookie/pagination rules.

Membership context/settings remain the next backend batch, useful alongside
the community UI. Do not infer the caller's joined state or role from a
community's member count. Moderation/search can follow when needed; recovery
and deployment hardening remain important before users rely on the service.

## Next backend batches

| Batch          | Features                                | Completion boundary                                                                                                                       |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 4              | Membership context + community settings | Expose the caller's membership/role and owner-authorized settings updates; preserve stable community identity and document slug behavior. |
| 5, when needed | Basic moderation + search               | Add reports/removal/role checks appropriate to the MVP and bounded search for communities/posts; avoid an elaborate moderation platform.  |

Password recovery deserves a separate account-focused batch before people
rely on their accounts: expiring, single-use tokens; safe storage; delivery;
request throttling; and responses that do not reveal whether an email exists.
Do not bundle it into profile editing.

## Before public use

- Comment pages are bounded per field. Consider request complexity/alias
  limits and traffic controls for the actual public deployment.
- Configure trusted proxy handling for the actual deployment. Use a shared
  rate-limit store or edge enforcement for multiple auth instances.
- Review dependency advisories and verify production cookie/error settings.
- Add moderation and recovery when real users depend on the service.

Notifications, chat, awards, image uploads, elaborate karma, and personalized
recommendations can wait. Public profile privacy and an auth limiter do not
make the whole project production-ready.

## Branch and review workflow

Use `feat/<scope>-<features>-tests-and-docs`, following existing branch names.
Each PR should describe the features, breaking changes, verification,
configuration/migrations, and remaining limitations. Keep future batches out
of the current diff. Staging stays manual; prepare commit and PR text without
automatically adding files to the index.
