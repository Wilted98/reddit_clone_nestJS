import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { TokenPayload } from './token-payload.interface';

/**
 * Local counterpart of @roorin/nestjs's CurrentUser. Here the request carries
 * the raw token payload (passport put it there), not a hydrated proto User.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenPayload =>
    GqlExecutionContext.create(context).getContext().req.user,
);
