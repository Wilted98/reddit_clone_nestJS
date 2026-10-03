import { PrismaClient } from '@prisma-clients/roorin-social';
import { PrismaService } from './prisma.service';

jest.mock('@prisma-clients/roorin-social', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('PrismaService', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it('rejects missing database configuration', () => {
    delete process.env.DATABASE_URL;
    expect(() => new PrismaService()).toThrow('Missing DATABASE_URL');
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('exposes the configured Prisma client', () => {
    const service = new PrismaService();
    expect(PrismaClient).toHaveBeenCalledWith({ adapter: expect.anything() });
    expect(service.client).toBe(
      (PrismaClient as jest.Mock).mock.results[0].value,
    );
  });

  it('connects when the module initializes', async () => {
    const service = new PrismaService();
    await service.onModuleInit();
    expect(service.client.$connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the module is destroyed', async () => {
    const service = new PrismaService();
    await service.onModuleDestroy();
    expect(service.client.$disconnect).toHaveBeenCalledTimes(1);
  });
});
