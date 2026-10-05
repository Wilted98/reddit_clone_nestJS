/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type SocialHealthQueryVariables = Exact<{ [key: string]: never }>;

export type SocialHealthQuery = { health: string };

export const SocialHealthDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SocialHealth' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'health' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SocialHealthQuery, SocialHealthQueryVariables>;
