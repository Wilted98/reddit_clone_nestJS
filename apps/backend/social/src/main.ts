import { NestFactory } from '@nestjs/core';
import { init } from '@roorin/nestjs';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await init(app);
}

bootstrap();
