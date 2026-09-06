import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');

/**
 * Shared bootstrap for every Roorin HTTP service. Keeping it here means a new
 * service gets the same pipes, prefix and cookie handling for free - and when
 * we change (say) the validation policy, it changes everywhere at once.
 */
export async function init(app: INestApplication) {
  const globalPrefix = 'api';
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  app.use(
    helmet({
      // The Apollo Sandbox served at /graphql in dev loads scripts from a CDN;
      // helmet's default CSP blocks it.
      contentSecurityPolicy: process.env['NODE_ENV'] === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.get('CORS_ORIGINS')?.split(',') ?? true,
    credentials: true,
  });

  const port = configService.getOrThrow('PORT');
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
