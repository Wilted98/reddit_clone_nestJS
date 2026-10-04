import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, Length, Matches } from 'class-validator';

@InputType()
export class CreateCommunityInput {
  @Field()
  @Length(3, 24)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug may only contain lowercase letters, numbers and underscores',
  })
  slug!: string;

  @Field()
  @Length(3, 60)
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @Length(0, 500)
  description?: string;
}
