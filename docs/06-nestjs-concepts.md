# 06 — NestJS Concepts, Taught From This Codebase

This doc explains the NestJS mechanics that make `auth` work, using its
actual files as the examples rather than invented snippets. If you can trace
through this using the real files open next to it, the concepts will stick
to code you already need to understand anyway.

## The core idea: Dependency Injection (DI)

`UsersService` needs `PrismaService` to talk to the database. Look at how it
gets it:

```ts
// users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}
  ...
}
```

`UsersService` never writes `new PrismaService()`. It declares "I need a
`PrismaService`" as a constructor parameter, and Nest constructs one and
hands it over. This is Dependency Injection: **a class declares what it
needs; a container decides how to build it and gives it to the class.**

Why this matters in practice, not just in theory:
[`users.service.spec.ts`](../apps/backend/auth/src/app/users/users.service.spec.ts)
tests `UsersService` with a **fake** `PrismaService` — a plain object with
mocked `create`/`findUniqueOrThrow` functions:

```ts
const module: TestingModule = await Test.createTestingModule({
  providers: [UsersService, { provide: PrismaService, useValue: prisma /* the fake */ }],
}).compile();
```

Because `UsersService` only ever asked for "a `PrismaService`" and never
constructed one itself, swapping the real one for a fake one required zero
changes to `UsersService`. That swap is the entire reason DI exists — it's
what makes unit testing a class in isolation possible at all.

`@Injectable()` is the decorator that marks a class as something the DI
container is allowed to construct and inject. Every service in this codebase
has it.

## Modules: declaring who can use what

```ts
// users.module.ts
@Module({
  imports: [PrismaModule],
  providers: [UsersResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

Three lists, three different jobs:

- **`providers`** — classes this module constructs and manages:
  `UsersResolver` and `UsersService`. Anything not listed here that this
  module's classes depend on has to come from an imported module instead.
- **`imports`** — other modules whose **exported** providers this module can
  inject. `UsersModule` imports `PrismaModule` specifically so
  `UsersService`'s constructor (which asks for `PrismaService`) can be
  satisfied.
- **`exports`** — which of this module's own providers other modules are
  allowed to inject if _they_ import `UsersModule`. `UsersService` is
  exported; `UsersResolver` is not, because nothing outside this module
  should ever call a resolver method directly — resolvers exist only to be
  invoked by the GraphQL engine.

```ts
// prisma.module.ts
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`PrismaModule` is the simplest possible module: it builds one service and
exports it, so anything importing `PrismaModule` can inject `PrismaService`.
This is the pattern every future "own a piece of infrastructure" module will
follow.

```ts
// app.module.ts
@Module({
  imports: [
    PrismaModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true, ... }),
    UsersModule,
  ],
})
export class AppModule {}
```

`AppModule` is the root: it imports every feature module the application
needs. Nothing exports anything from here because nothing imports
`AppModule` — it's the top of the tree, instantiated once by
[`main.ts`](../apps/backend/auth/src/main.ts)'s
`NestFactory.create(AppModule)`.

## Resolvers vs. Services: two different jobs, on purpose

```ts
// users.resolver.ts
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User)
  async createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
    return this.usersService.createUser(createUserInput);
  }

  @Query(() => User, { name: 'user' })
  async getUser(@Args('username') username: string) {
    return this.usersService.getUser({ username });
  }
}
```

The resolver's entire job is **translation**: turn a GraphQL operation into
a call on a service method, and return whatever the service returns. It has
no business logic of its own — no password hashing, no error handling, no
database access. That's deliberate:

- `@Resolver(() => User)` tells `@nestjs/graphql` this class handles
  operations related to the `User` GraphQL type.
- `@Mutation(() => User)` / `@Query(() => User, { name: 'user' })` register
  the method as a schema field, with the given return type. The string
  `'user'` in the query is the field name clients actually call — it doesn't
  have to match the method name (`getUser`), and here it deliberately
  doesn't, to keep the method name descriptive on the TypeScript side.
- `@Args('createUserInput')` / `@Args('username')` extract arguments from the
  incoming GraphQL operation and pass them as regular method parameters.

The **service** holds every actual decision:
[`users.service.ts`](../apps/backend/auth/src/app/users/users.service.ts)
hashes the password, decides what a duplicate-email error looks like, talks
to Prisma. This split means the business logic doesn't know or care that
GraphQL exists — if a second entry point were added later (a gRPC endpoint,
say, for a future service to call `getUser` internally), it would call
`UsersService` directly, no resolver involved. `UsersService` has no
`@nestjs/graphql` import anywhere in it — that's the tell that the split is
being honored.

## Decorators as schema, not just metadata

```ts
// user.model.ts
@ObjectType()
export class User extends AbstractModel {
  @Field()
  username: string;

  @Field({ nullable: true })
  avatarUrl?: string;
}
```

With `autoSchemaFile: true` (set in `app.module.ts`), Nest reads these
decorators at startup and **generates the actual GraphQL SDL schema from
them** — there is no hand-written `.graphql` file anywhere in this project
(see [`05-tech-stack-rationale.md`](05-tech-stack-rationale.md) "code-first
vs. schema-first"). `@ObjectType()` marks the class as a GraphQL type;
`@Field()` marks a property as a schema field, with its GraphQL type
inferred from the TypeScript type (`string` → GraphQL `String`) unless
declared explicitly. `{ nullable: true }` is why `avatarUrl` shows up in the
schema as `avatarUrl: String` (optional) rather than `avatarUrl: String!`
(required) — TypeScript's `?` alone doesn't communicate that to GraphQL; the
decorator option does.

`User extends AbstractModel`
([`libs/nestjs/src/lib/graphql/abstract.model.ts`](../libs/nestjs/src/lib/graphql/abstract.model.ts))
contributes `id` and `createdAt` to the schema without `User` declaring them
itself — ordinary TypeScript inheritance, decorators included. Every future
model extends the same base, so `id`/`createdAt` are guaranteed identical
everywhere rather than redeclared (and potentially drifting) per model.

`CreateUserInput` uses the same mechanism with `@InputType()` instead of
`@ObjectType()` — the GraphQL-spec distinction between a type you can
_return_ and a type you can _pass as an argument_. A `class-validator`
decorator (`@IsEmail()`, etc.) sits right next to the `@Field()` decorator on
the same property — the schema shape and the validation rule for that exact
field are declared in the same place, not in two files that could drift
apart. Whether those rules currently run at request time is a separate
question — see [`04-authentication.md`](04-authentication.md) "Known gaps"
§3.

## The bootstrap sequence

```ts
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(port);
}
```

`NestFactory.create(AppModule)` walks the entire module tree starting from
`AppModule`, builds the DI container, and constructs every provider in
dependency order (`PrismaService` before `UsersService` before
`UsersResolver`, since each depends on the previous). `app.listen(port)`
starts the actual HTTP server only after all of that is wired up. The
`setGlobalPrefix('api')` call affects REST-style routes; it does not move the
GraphQL endpoint, which Apollo serves at `/graphql` regardless — worth
knowing the first time you go looking for the GraphQL endpoint at
`/api/graphql` and don't find it.
