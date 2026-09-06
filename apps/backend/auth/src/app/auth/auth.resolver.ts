import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { GqlContext } from '@roorin/nestjs';
import { LoginInput } from './dto/login.input';
import { User } from '../users/models/user.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => User)
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
