import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { User } from './models/user.model';
import { UsersService } from './users.service';
import { Query } from '@nestjs/graphql';
import { CreateUserInput } from './dto/create-user.input';

@Resolver(() => User)
export class UsersResolver {
    constructor(private readonly usersService: UsersService) { }


    @Mutation(() => User)
    async createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
        return this.usersService.createUser(createUserInput);
    }

    @Query(() => User, { name: 'user' })
    async getUser(@Args('username') username: string) {
        return this.usersService.getUser({ username });
    }

}
