import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { TokenPayload } from '../auth/token-payload.interface';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { User } from './models/user.model';
import { UsersService } from './users.service';
import { Account } from './models/account.model';
import { SkipThrottle } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../rate-limit/gql-throttler.guard';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(GqlThrottlerGuard)
  @SkipThrottle({ login: true })
  @Mutation(() => Account)
  async createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
    return this.usersService.createUser(createUserInput);
  }

  @Query(() => User, { name: 'user' })
  async getUser(@Args('username') username: string) {
    return this.usersService.getPublicUser(username);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => Account, { name: 'me' })
  async getMe(@CurrentUser() token: TokenPayload) {
    return this.usersService.getUser({ id: token.userId });
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Account)
  async updateUser(
    @CurrentUser() token: TokenPayload,
    @Args('updateUserInput') updateUserInput: UpdateUserInput,
  ) {
    return this.usersService.updateUser(token.userId, updateUserInput);
  }
}
