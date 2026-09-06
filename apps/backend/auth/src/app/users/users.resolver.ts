import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { TokenPayload } from '../auth/token-payload.interface';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { User } from './models/user.model';
import { UsersService } from './users.service';

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

  @UseGuards(GqlAuthGuard)
  @Query(() => User, { name: 'me' })
  async getMe(@CurrentUser() token: TokenPayload) {
    return this.usersService.getUser({ id: token.userId });
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  async updateUser(
    @CurrentUser() token: TokenPayload,
    @Args('updateUserInput') updateUserInput: UpdateUserInput,
  ) {
    return this.usersService.updateUser(token.userId, updateUserInput);
  }
}
