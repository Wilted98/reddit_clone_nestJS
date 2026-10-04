import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GqlContext } from '@roorin/nestjs';
import { LoginInput } from './dto/login.input';
import { Account } from '../users/models/account.model';
import { GqlThrottlerGuard } from '../rate-limit/gql-throttler.guard';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(GqlThrottlerGuard)
  @SkipThrottle({ register: true })
  @Mutation(() => Account)
  async login(
    @Args('loginInput') loginInput: LoginInput,
    @Context() context: GqlContext,
  ) {
    return this.authService.login(loginInput, context.res);
  }

  @Mutation(() => Boolean)
  async logout(@Context() context: GqlContext) {
    return this.authService.logout(context.res);
  }
}
