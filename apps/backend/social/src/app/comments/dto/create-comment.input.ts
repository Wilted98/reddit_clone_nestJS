import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

@InputType()
export class CreateCommentInput {
  // See CreatePostInput: whitelist:true drops undecorated properties.
  @Field()
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentId?: string;

  @Field()
  @Length(1, 10000)
  body!: string;
}
