import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum FeedSort {
  HOT = 'HOT',
  NEW = 'NEW',
  TOP = 'TOP',
}

export enum FeedRange {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  ALL = 'ALL',
}

registerEnumType(FeedSort, { name: 'FeedSort' });
registerEnumType(FeedRange, { name: 'FeedRange' });

@ArgsType()
export class FeedArgs {
  @Field(() => FeedSort, { defaultValue: FeedSort.HOT })
  @IsEnum(FeedSort)
  sort: FeedSort = FeedSort.HOT;

  /** Scopes TOP to a time window. Ignored by HOT and NEW. */
  @Field(() => FeedRange, { defaultValue: FeedRange.ALL })
  @IsEnum(FeedRange)
  range: FeedRange = FeedRange.ALL;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  communitySlug?: string;

  /**
   * HOT pages by offset, NEW and TOP by cursor - see FeedService for why the
   * two cannot share one mechanism.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  @Field(() => Int, { defaultValue: 0 })
  @IsInt()
  @Min(0)
  @Max(500)
  offset = 0;

  @Field(() => Int, { defaultValue: 25 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
