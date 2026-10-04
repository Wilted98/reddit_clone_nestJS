import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './gql-throttler.guard';

function positiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(config.get(key) ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
    throw new Error(
      `${key} must be a positive integer no greater than 2147483647`,
    );
  }
  return value;
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = positiveInteger(config, 'AUTH_RATE_LIMIT_TTL_MS', 60000);
        return [
          {
            name: 'login',
            ttl,
            limit: positiveInteger(config, 'AUTH_LOGIN_RATE_LIMIT', 10),
          },
          {
            name: 'register',
            ttl,
            limit: positiveInteger(config, 'AUTH_REGISTER_RATE_LIMIT', 5),
          },
        ];
      },
    }),
  ],
  providers: [GqlThrottlerGuard],
  exports: [ThrottlerModule, GqlThrottlerGuard],
})
export class RateLimitModule {}
