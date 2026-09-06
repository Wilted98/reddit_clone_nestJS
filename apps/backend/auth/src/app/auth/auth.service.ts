import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginInput } from './dto/login.input';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { TokenPayload } from './token-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login({ email, password }: LoginInput, response: Response) {
    const user = await this.verifyUser(email, password);
    const tokenPayload: TokenPayload = { userId: user.id };
    const accessToken = this.jwtService.sign(tokenPayload);

    response.cookie('Authentication', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      maxAge: Number(this.configService.getOrThrow('JWT_EXPIRATION_MS')),
    });

    return user;
  }

  logout(response: Response) {
    response.clearCookie('Authentication');
    return true;
  }

  private async verifyUser(email: string, password: string) {
    try {
      const user = await this.userService.getUser({ email });
      const authenticated = await compare(password, user.password);
      if (!authenticated) {
        throw new UnauthorizedException();
      }
      return user;
    } catch {
      throw new UnauthorizedException('Credentials are not valid.');
    }
  }
}
