import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

@InputType()
export class UpdateCommentInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id!: string;

  @Field()
  @Length(1, 10000)
  body!: string;
}
