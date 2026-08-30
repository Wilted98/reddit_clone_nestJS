import { Field, ObjectType } from '@nestjs/graphql';
import { AbstractModel } from '@roorin/nestjs'

@ObjectType()
export class User extends AbstractModel {
    @Field()
    username: string;

    @Field()
    email: string;

    @Field({ nullable: true })
    avatarUrl?: string;

    @Field({ nullable: true })
    bio?: string;
}