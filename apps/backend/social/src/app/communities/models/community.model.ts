import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AbstractModel } from '@roorin/nestjs';

export enum MemberRole {
  MEMBER = 'MEMBER',
  MODERATOR = 'MODERATOR',
  OWNER = 'OWNER',
}

registerEnumType(MemberRole, { name: 'MemberRole' });

@ObjectType()
export class Community extends AbstractModel {
  @Field()
  slug!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  ownerId!: string;

  @Field(() => Int)
  memberCount!: number;
}
