import { ConfigService } from '@nestjs/config';
import { httpSecurity } from '@roorin/nestjs';

function config(values: Record<string, unknown>) {
  const service = new ConfigService(values);
  jest.spyOn(service, 'get').mockImplementation((key) => values[String(key)]);
  return service;
}

describe('HTTP production configuration', () => {
  const production = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://roorin.com',
    JWT_SECRET: 'a'.repeat(64),
  };

  it('keeps development origins permissive and forwarded addresses untrusted', () => {
    expect(httpSecurity(config({}))).toEqual({
      production: false,
      origins: true,
      proxies: false,
    });
  });

  it('allows explicit HTTPS origins and only the configured proxy', () => {
    expect(
      httpSecurity(config({ ...production, TRUST_PROXY: '172.30.0.2' })),
    ).toEqual({
      production: true,
      origins: ['https://roorin.com'],
      proxies: ['172.30.0.2'],
    });
  });

  it.each([
    '',
    '*',
    'http://roorin.com',
    'https://roorin.com/path',
    'https://roorin.com/',
  ])('refuses unsafe production origins: %s', (CORS_ORIGINS) => {
    expect(() =>
      httpSecurity(config({ ...production, CORS_ORIGINS })),
    ).toThrow();
  });

  it('refuses a missing origin and weak production signing secret', () => {
    expect(() => httpSecurity(config({ NODE_ENV: 'production' }))).toThrow(
      'CORS_ORIGINS',
    );
    expect(() =>
      httpSecurity(config({ ...production, JWT_SECRET: 'change-me' })),
    ).toThrow('JWT_SECRET');
  });

  it.each([
    'true',
    '1',
    'loopback',
    '172.30.0.0/33',
    '::1/129',
    '172.30.0.2/nope',
  ])('refuses implicit or malformed proxy trust: %s', (TRUST_PROXY) => {
    expect(() => httpSecurity(config({ TRUST_PROXY }))).toThrow('TRUST_PROXY');
  });

  it('supports explicit CIDRs and trims origin/proxy lists', () => {
    expect(
      httpSecurity(
        config({
          ...production,
          CORS_ORIGINS: ' https://roorin.com, https://www.roorin.com ',
          TRUST_PROXY: '172.30.0.0/24, ::1/128',
        }),
      ),
    ).toMatchObject({
      origins: ['https://roorin.com', 'https://www.roorin.com'],
      proxies: ['172.30.0.0/24', '::1/128'],
    });
  });
});
