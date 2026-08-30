import { Module } from '@nestjs/common';
import { PrismaModule } from 'apps/backend/auth/src/app/prisma/prisma.module';
import { UsersResolver } from 'apps/backend/auth/src/app/users/users.resolver';
import { UsersService } from 'apps/backend/auth/src/app/users/users.service';

@Module({
    imports: [PrismaModule],
    providers: [UsersResolver, UsersService],
    exports: [UsersService]
})
export class UsersModule { }
