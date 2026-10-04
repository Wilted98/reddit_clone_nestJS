import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AbstractModel } from '@roorin/nestjs';

@ObjectType()
export class Post extends AbstractModel {
  @Field()
  communityId!: string;

  @Field()
  authorId!: string;

  @Field()
  authorUsername!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  body?: string;

  @Field({ nullable: true })
  url?: string;

  @Field(() => Int)
  score!: number;

  @Field(() => Int)
  commentCount!: number;

  @Field({ nullable: true })
  deletedAt?: Date;

  @Field({ nullable: true })
  editedAt?: Date;
}

@ObjectType()
export class PostPage {
  @Field(() => [Post])
  items!: Post[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field()
  hasMore!: boolean;
}
