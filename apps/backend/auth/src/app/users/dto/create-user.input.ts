import { Field, InputType } from "@nestjs/graphql";
import { IsEmail, IsStrongPassword, Length, Matches } from 'class-validator'


@InputType()
export class CreateUserInput {
    @Field()
    @Length(3, 20)
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: 'username may only contain letters, numbers and underscores',
    })
    username: string;

    @Field()
    @IsEmail()
    email: string;

    @Field()
    @IsStrongPassword()
    password: string;
}