import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AbstractModel } from '@roorin/nestjs';

@ObjectType()
export class Comment extends AbstractModel {
  @Field()
  postId!: string;

  @Field()
  authorId!: string;

  @Field()
  authorUsername!: string;

  @Field(() => String, { nullable: true })
  parentId?: string | null;

  @Field()
  body!: string;

  @Field(() => Int)
  score!: number;

  @Field({ nullable: true })
  deletedAt?: Date;

  @Field({ nullable: true })
  editedAt?: Date;

  @Field()
  hasReplies!: boolean;
}

@ObjectType()
export class CommentPage {
  @Field(() => [Comment])
  items!: Comment[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field()
  hasMore!: boolean;
}
