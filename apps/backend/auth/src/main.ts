import { NestFactory } from '@nestjs/core';
import { GrpcOptions, Transport } from '@nestjs/microservices';
import { init } from '@roorin/nestjs';
import { join } from 'path';
import { AUTH_PACKAGE_NAME } from '@roorin/proto';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Two faces on one process: GraphQL over HTTP for clients, gRPC for other
  // Roorin services.
  app.connectMicroservice<GrpcOptions>({
    transport: Transport.GRPC,
    options: {
      package: AUTH_PACKAGE_NAME,
      protoPath: join(__dirname, 'proto/auth.proto'),
      url: process.env.GRPC_URL ?? '0.0.0.0:5000',
    },
  });

  await app.startAllMicroservices();
  await init(app);
}

bootstrap();
