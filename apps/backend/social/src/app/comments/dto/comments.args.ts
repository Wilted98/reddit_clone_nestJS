import { ArgsType, Field } from '@nestjs/graphql';
import { PaginationArgs } from '@roorin/nestjs';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

@ArgsType()
export class CommentsArgs extends PaginationArgs {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  postId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  parentId?: string | null;

  @IsNotEmpty()
  @MaxLength(128)
  declare cursor?: string;
}
