## Reading order

| #   | Doc                                                          | Read this to understand...                                                                                     |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | [`01-project-overview.md`](01-project-overview.md)           | What this repo is, what phase it's in, what actually runs today                                                |
| 2   | [`02-architecture.md`](02-architecture.md)                   | The NX workspace shape, why `apps/backend` vs `apps/frontend`, module boundaries                               |
| 3   | [`03-database-design.md`](03-database-design.md)             | The `User` model, why `cuid`, migrations, the adapter-pg pattern                                               |
| 4   | [`04-authentication.md`](04-authentication.md)               | Password hashing, login/logout, JWT cookies, and internal gRPC authentication                                  |
| 5   | [`05-tech-stack-rationale.md`](05-tech-stack-rationale.md)   | Why NX, why NestJS, why GraphQL (code-first) over REST, why Prisma, why Postgres — the alternatives considered |
| 6   | [`06-nestjs-concepts.md`](06-nestjs-concepts.md)             | Modules, DI, decorators, resolvers vs. services — taught using this repo's own files                           |
| 7   | [`07-graphql-api-reference.md`](07-graphql-api-reference.md) | Every query/mutation that exists today, with example requests                                                  |
| 8   | [`08-testing-strategy.md`](08-testing-strategy.md)           | The testing pyramid used here, how to run each layer, what's covered                                           |

Communities, membership rules, the social API, and its tests are documented in
[`09-social-service.md`](09-social-service.md).
