import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma-clients/roorin-auth';
import { CreateUserInput } from './dto/create-user.input';
import { hash } from 'bcryptjs';
import { UpdateUserInput } from './dto/update-user.input';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createUser(data: CreateUserInput) {
    try {
      return await this.prismaService.client.user.create({
        data: {
          ...data,
          password: await hash(data.password, 10),
        },
      });
    } catch (error) {
      // https://www.prisma.io/docs/orm/v7/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors
      // https://www.prisma.io/docs/orm/v7/reference/error-reference#error-codes -- all the error codes
      // P2002 stands for "Unique constraint failed on the {constraint}" so we're checking if
      // there is a field that throws this error since email and username are @unique in prisma's schema.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.['target'] as string[])?.join(', ');
        throw new ConflictException(`${target ?? 'field'} already taken`);
      }
      throw error;
    }
  }

  async getPublicUser(username: string) {
    try {
      return await this.prismaService.client.user.findUniqueOrThrow({
        where: { username },
        select: {
          id: true,
          createdAt: true,
          username: true,
          avatarUrl: true,
          bio: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw err;
    }
  }

  async getUserAvatars(userIds: string[]) {
    if (
      userIds.length > 100 ||
      userIds.some((id) => !id.trim() || id.length > 128)
    ) {
      throw new BadRequestException('Provide at most 100 valid user IDs.');
    }
    if (!userIds.length) return [];
    return this.prismaService.client.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, avatarUrl: true },
    });
  }

  async getUser(args: Prisma.UserWhereUniqueInput) {
    try {
      return await this.prismaService.client.user.findUniqueOrThrow({
        where: args,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }

      throw err;
    }
  }

  async updateUser(userId: string, data: UpdateUserInput) {
    return this.prismaService.client.user.update({
      where: { id: userId },
      data,
    });
  }
}
