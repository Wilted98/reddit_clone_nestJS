import { Field, InputType } from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

@InputType()
export class UpdatePostInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id!: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @Length(3, 300)
  title?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @Length(1, 40000)
  body?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsUrl()
  url?: string;
}
