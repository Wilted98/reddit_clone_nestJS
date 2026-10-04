import { Module } from '@nestjs/common';
import { CommunitiesModule } from '../communities/communities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedResolver } from './feed.resolver';
import { FeedService } from './feed.service';

@Module({
  imports: [PrismaModule, CommunitiesModule],
  providers: [FeedResolver, FeedService],
})
export class FeedModule {}
