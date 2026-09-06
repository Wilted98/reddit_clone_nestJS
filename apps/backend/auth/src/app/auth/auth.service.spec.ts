import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { getUser: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let response: jest.Mocked<Pick<Response, 'cookie' | 'clearCookie'>>;

  const storedUser = {
    id: 'user-1',
    email: 'vasi@roorin.dev',
    password: 'hashed-password',
  };
  const loginInput: LoginInput = {
    email: 'vasi@roorin.dev',
    password: 'Str0ng!Passw0rd',
  };

  beforeEach(async () => {
    usersService = { getUser: jest.fn().mockResolvedValue(storedUser) };
    configService = {
      get: jest.fn(),
      getOrThrow: jest.fn((key: string) =>
        key === 'JWT_EXPIRATION_MS' ? '3600000' : `mock-${key}`,
      ),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    response = { cookie: jest.fn(), clearCookie: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    (compare as jest.Mock).mockResolvedValue(true);
    usersService.getUser.mockResolvedValue(storedUser);
    jwtService.sign.mockReturnValue('signed.jwt.token');
  });

  describe('login', () => {
    it('verifies the password against the stored hash, not the plaintext', async () => {
      await service.login(loginInput, response as unknown as Response);

      expect(usersService.getUser).toHaveBeenCalledWith({
        email: loginInput.email,
      });
      expect(compare).toHaveBeenCalledWith(
        loginInput.password,
        storedUser.password,
      );
    });

    it('signs a JWT containing only the user id, never the password or email', async () => {
      await service.login(loginInput, response as unknown as Response);

      expect(jwtService.sign).toHaveBeenCalledWith({ userId: storedUser.id });
    });

    it('sets the Authentication cookie as httpOnly with the configured expiry', async () => {
      await service.login(loginInput, response as unknown as Response);

      expect(response.cookie).toHaveBeenCalledWith(
        'Authentication',
        'signed.jwt.token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 3600000,
        }),
      );
    });

    it('marks the cookie secure only in production', async () => {
      configService.get.mockReturnValue('production');
      await service.login(loginInput, response as unknown as Response);
      expect(response.cookie).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );

      jest.clearAllMocks();
      (compare as jest.Mock).mockResolvedValue(true);
      configService.get.mockReturnValue('development');
      await service.login(loginInput, response as unknown as Response);
      expect(response.cookie).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
    });

    it('returns the user on success', async () => {
      await expect(
        service.login(loginInput, response as unknown as Response),
      ).resolves.toBe(storedUser);
    });

    it('rejects a wrong password without signing a token or setting a cookie', async () => {
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(loginInput, response as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the exact same message as a wrong password', async () => {
      usersService.getUser.mockRejectedValue(new Error('no such user'));

      await expect(
        service.login(loginInput, response as unknown as Response),
      ).rejects.toThrow('Credentials are not valid.');
    });

    it('gives a wrong password the same message as an unknown email (no enumeration)', async () => {
      (compare as jest.Mock).mockResolvedValue(false);
      const wrongPassword = service
        .login(loginInput, response as unknown as Response)
        .catch((e) => e.message);

      usersService.getUser.mockRejectedValue(new Error('no such user'));
      const unknownEmail = service
        .login(loginInput, response as unknown as Response)
        .catch((e) => e.message);

      expect(await wrongPassword).toBe(await unknownEmail);
    });
  });

  describe('logout', () => {
    it('clears the Authentication cookie and returns true', () => {
      const result = service.logout(response as unknown as Response);

      expect(response.clearCookie).toHaveBeenCalledWith('Authentication');
      expect(result).toBe(true);
    });
  });
});
