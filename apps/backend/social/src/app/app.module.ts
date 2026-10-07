import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommunitiesModule } from './communities/communities.module';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { GqlContext } from '@roorin/nestjs';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppResolver } from './app.resolver';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { FeedModule } from './feed/feed.module';
import { VotesModule } from './votes/votes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/backend/social/.env',
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    AuthModule,
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
    CommunitiesModule,
    PostsModule,
    CommentsModule,
    FeedModule,
    VotesModule,
  ],
  providers: [AppResolver],
})
export class AppModule {}
