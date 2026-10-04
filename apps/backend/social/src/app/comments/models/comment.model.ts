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

  /**
   * Populated by buildTree(); clients select the reply depth they render.
   */
  @Field(() => [Comment])
  replies!: Comment[];
}
