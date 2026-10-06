import { Module } from '@nestjs/common';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { sessionLifetimeMs } from './session-lifetime';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: {
          expiresIn:
            sessionLifetimeMs(configService.getOrThrow('JWT_EXPIRATION_MS')) /
            1000,
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    RateLimitModule,
  ],
  providers: [AuthResolver, AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
