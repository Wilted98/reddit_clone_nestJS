import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
  } as unknown as ConfigService;

  it('reads JWT_SECRET from config at construction time', () => {
    new JwtStrategy(configService);
    expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('passes the verified payload through unchanged - Passport already did the verification', () => {
    const strategy = new JwtStrategy(configService);
    const payload = { userId: 'user-1' };

    expect(strategy.validate(payload)).toBe(payload);
  });
});
