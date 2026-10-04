import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VotesResolver } from './votes.resolver';
import { VotesService } from './votes.service';

@Module({
  imports: [PrismaModule],
  providers: [VotesResolver, VotesService],
  exports: [VotesService],
})
export class VotesModule {}
