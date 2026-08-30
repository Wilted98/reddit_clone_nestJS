import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma-clients/roorin-auth';
import { PrismaPg } from '@prisma/adapter-pg'

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma: PrismaClient;

    constructor(){
        const url = process.env.DATABASE_URL;
        if(!url) throw new Error('Missing DATABASE_URL!');
        const adapter = new PrismaPg({ connectionString: url });
        this.prisma = new PrismaClient({ adapter })
    }

    get client(){
        return this.prisma;
    }


    async onModuleInit() {
        await this.prisma.$connect();
    }

    async onModuleDestroy() {
        await this.prisma.$disconnect();
    }
}
