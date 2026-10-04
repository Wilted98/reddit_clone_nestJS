import { ArgsType, Field } from '@nestjs/graphql';
import { PaginationArgs } from '@roorin/nestjs';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

@ArgsType()
export class AuthorActivityArgs extends PaginationArgs {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  authorId!: string;

  @IsNotEmpty()
  @MaxLength(128)
  declare cursor?: string;
}
