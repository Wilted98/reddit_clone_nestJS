import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Cursor pagination, not offset. On a live feed new rows land between page
 * loads, which makes OFFSET silently skip or duplicate items; a cursor anchored
 * to a specific row cannot.
 */
@ArgsType()
export class PaginationArgs {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  cursor?: string;

  @Field(() => Int, { defaultValue: 25 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
