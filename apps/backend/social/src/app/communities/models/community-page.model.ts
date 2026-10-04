import { Field, ObjectType } from '@nestjs/graphql';
import { Community } from './community.model';

@ObjectType()
export class CommunityPage {
  @Field(() => [Community])
  items!: Community[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field()
  hasMore!: boolean;
}
