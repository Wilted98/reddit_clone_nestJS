import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '@roorin/proto';

/**
 * Injects the authenticated user into a resolver argument. Populated by
 * GqlAuthGuard, so this is only meaningful on a guarded resolver.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    GqlExecutionContext.create(context).getContext().req.user,
);
