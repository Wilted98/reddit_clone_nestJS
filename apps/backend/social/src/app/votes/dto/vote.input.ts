import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class VoteInput {
  // See CreatePostInput: whitelist:true drops undecorated properties.
  @Field()
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  /** 1 = upvote, -1 = downvote, 0 = remove my vote. */
  @Field(() => Int)
  @IsIn([-1, 0, 1])
  value!: number;
}
