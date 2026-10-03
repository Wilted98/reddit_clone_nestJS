import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AUTH_PACKAGE_NAME } from '@roorin/proto';

/**
 * Wires up the gRPC client that @roorin/nestjs's GqlAuthGuard injects. Global
 * because the guard is used across every feature module, and a guard resolves
 * its dependencies from the module where it is applied.
 *
 * Every new Roorin service gets a copy of this file and nothing else in order
 * to become "a service that can authenticate requests".
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: AUTH_PACKAGE_NAME,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC as const,
          options: {
            package: AUTH_PACKAGE_NAME,
            protoPath: join(__dirname, 'proto/auth.proto'),
            url: configService.getOrThrow('AUTH_GRPC_URL'),
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class AuthModule {}
