import { Field, ObjectType } from '@nestjs/graphql';
import { User } from './user.model';

@ObjectType()
export class Account extends User {
  @Field()
  email!: string;
}
