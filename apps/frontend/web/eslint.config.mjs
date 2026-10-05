import next from 'eslint-config-next/core-web-vitals';
import base from '../../../eslint.config.mjs';

const config = [
  ...base,
  ...next,
  {
    ignores: [
      '.next/**',
      '.next-dev/**',
      'src/graphql/generated/**',
      'next-env.d.ts',
    ],
  },
];

export default config;
