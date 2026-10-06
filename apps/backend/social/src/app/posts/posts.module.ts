import { Module } from '@nestjs/common';
import { CommunitiesModule } from '../communities/communities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsResolver } from './posts.resolver';
import { PostsService } from './posts.service';
import { AuthorAvatarsService } from './author-avatars.service';

@Module({
  imports: [PrismaModule, CommunitiesModule],
  providers: [PostsResolver, PostsService, AuthorAvatarsService],
  exports: [PostsService],
})
export class PostsModule {}
