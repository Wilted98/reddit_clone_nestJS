import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class VoteResult {
  @Field()
  targetId!: string;

  /** Updated score for mutations; batch lookups return 0 (read feed/post score). */
  @Field(() => Int)
  score!: number;

  /** This user's vote on the target now: 1, -1 or 0. */
  @Field(() => Int)
  myVote!: number;
}
