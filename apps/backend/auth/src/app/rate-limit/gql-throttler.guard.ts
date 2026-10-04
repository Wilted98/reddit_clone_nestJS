import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { GqlContext } from '@roorin/nestjs';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const { req, res } =
      GqlExecutionContext.create(context).getContext<GqlContext>();
    return { req, res };
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    this.getRequestResponse(context).res.setHeader(
      'Retry-After',
      detail.timeToBlockExpire,
    );
    // Apollo preserves statusCode only when the HttpException response is an object.
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
