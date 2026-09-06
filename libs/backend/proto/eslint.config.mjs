import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Generated output - not ours to lint.
    ignores: ['src/generated/**'],
  },
];
