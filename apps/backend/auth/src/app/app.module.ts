import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { GqlContext } from '@roorin/nestjs';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/backend/auth/.env',
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    PrismaModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      introspection: process.env.NODE_ENV !== 'production',
      includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',
      playground:
        process.env.NODE_ENV === 'production'
          ? false
          : {
              settings: {
                'request.credentials': 'include',
              },
            },
      context: ({ req, res }: GqlContext) => ({ req, res }),
    }),
    UsersModule,
    AuthModule,
  ],
  providers: [],
})
export class AppModule {}
