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

## Next batches

| Batch          | Features                                | Completion boundary                                                                                                                                                                                          |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2              | Bounded comment retrieval               | Bound query size and reply loading, define pagination/truncation behavior, and test large/deep threads before public deployment.                                                                             |
| 3              | Profile activity + post/comment editing | Reuse public profile lookup and existing author-post pagination, add bounded author-comment history, and support author-only edits with an edit timestamp. A frontend profile page remains separate UI work. |
| 4              | Membership context + community settings | Expose the caller's membership/role and owner-authorized settings updates; preserve stable community identity and document slug behavior.                                                                    |
| 5, when needed | Basic moderation + search               | Add reports/removal/role checks appropriate to the MVP and bounded search for communities/posts; avoid an elaborate moderation platform.                                                                     |

Password recovery deserves a separate account-focused batch before people
rely on their accounts: expiring, single-use tokens; safe storage; delivery;
request throttling; and responses that do not reveal whether an email exists.
Do not bundle it into profile editing.

## Before public use

- Complete bounded comment retrieval; current discussion-tree reads are not
  a safe limit on large/deep threads.
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
