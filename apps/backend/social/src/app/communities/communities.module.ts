import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunitiesService } from './communities.service';
import { CommunitiesResolver } from './communities.resolver';

@Module({
  imports: [PrismaModule],
  providers: [CommunitiesService, CommunitiesResolver],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
