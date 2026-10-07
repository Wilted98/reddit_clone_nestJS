import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');
import { httpSecurity } from './http-security';

/**
 * Shared bootstrap for every Roorin HTTP service. Keeping it here means a new
 * service gets the same pipes, prefix and cookie handling for free - and when
 * we change (say) the validation policy, it changes everywhere at once.
 */
export async function init(app: INestApplication) {
  const configService = app.get(ConfigService);
  const security = httpSecurity(configService);
  app.getHttpAdapter().getInstance().set('trust proxy', security.proxies);
  const globalPrefix = 'api';
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  app.use(
    helmet({
      // The Apollo Sandbox served at /graphql in dev loads scripts from a CDN;
      // helmet's default CSP blocks it.
      contentSecurityPolicy: security.production,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: security.origins,
    credentials: true,
  });

  const port = configService.getOrThrow('PORT');
  app.enableShutdownHooks();
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
