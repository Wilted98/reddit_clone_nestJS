import { Field, InputType } from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

@InputType()
export class CreatePostInput {
  // Every field needs a class-validator decorator: the global ValidationPipe
  // runs with whitelist:true, which strips any property that has none.
  @Field()
  @IsString()
  @IsNotEmpty()
  communitySlug!: string;

  @Field()
  @Length(3, 300)
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Length(1, 40000)
  body?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  url?: string;
}
