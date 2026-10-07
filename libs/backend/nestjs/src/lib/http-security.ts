import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';

export function httpSecurity(config: ConfigService) {
  const production = config.get('NODE_ENV') === 'production';
  const origins = config
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (production && !origins?.length) {
    throw new Error('Production requires explicit CORS_ORIGINS.');
  }
  if (production) {
    for (const origin of origins ?? []) {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
        throw new Error(
          'Production CORS_ORIGINS must contain HTTPS origins only.',
        );
      }
    }
    const secret = config.get<string>('JWT_SECRET');
    if (secret !== undefined && secret.length < 32) {
      throw new Error(
        'Production JWT_SECRET must contain at least 32 characters.',
      );
    }
  }

  const proxies = config
    .get<string>('TRUST_PROXY')
    ?.split(',')
    .map((proxy) => proxy.trim())
    .filter(Boolean);
  for (const proxy of proxies ?? []) {
    const [address, bits, ...extra] = proxy.split('/');
    const version = isIP(address);
    if (
      !version ||
      extra.length ||
      (bits !== undefined &&
        (!/^\d+$/.test(bits) || Number(bits) > (version === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'TRUST_PROXY accepts only explicit proxy IP addresses or CIDRs.',
      );
    }
  }
  return {
    production,
    origins: origins?.length ? origins : true,
    proxies: proxies?.length ? proxies : false,
  };
}
