import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  hooks: { afterAllFileWrite: ['prettier --write'] },
  generates: Object.fromEntries(
    ['auth', 'social'].map((service) => [
      `src/graphql/generated/${service}.ts`,
      {
        schema: `graphql/${service}.schema.graphql`,
        documents: `src/graphql/${service}.graphql`,
        plugins: ['typescript-operations', 'typed-document-node'],
        config: {
          nonOptionalTypename: true,
          skipTypeNameForRoot: true,
          strictScalars: true,
          scalars: { DateTime: 'string' },
        },
      },
    ]),
  ),
};

export default config;
