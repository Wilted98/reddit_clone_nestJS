/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type FeedRange = 'ALL' | 'DAY' | 'MONTH' | 'WEEK';

export type FeedSort = 'HOT' | 'NEW' | 'TOP';

export type SocialHealthQueryVariables = Exact<{ [key: string]: never }>;

export type SocialHealthQuery = { health: string };

export type CommunitySummaryFragment = {
  __typename: 'Community';
  id: string;
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
};

export type BrowseCommunitiesQueryVariables = Exact<{
  cursor?: string | null | undefined;
  limit: number;
}>;

export type BrowseCommunitiesQuery = {
  communities: {
    __typename: 'CommunityPage';
    nextCursor: string | null;
    hasMore: boolean;
    items: Array<{
      __typename: 'Community';
      id: string;
      slug: string;
      name: string;
      description: string | null;
      memberCount: number;
      createdAt: string;
    }>;
  };
};

export type CommunityDetailsQueryVariables = Exact<{
  slug: string;
}>;

export type CommunityDetailsQuery = {
  community: {
    __typename: 'Community';
    id: string;
    slug: string;
    name: string;
    description: string | null;
    memberCount: number;
    createdAt: string;
  };
};

export type BrowseFeedQueryVariables = Exact<{
  sort: FeedSort;
  range: FeedRange;
  communitySlug?: string | null | undefined;
  cursor?: string | null | undefined;
  offset: number;
  limit: number;
}>;

export type BrowseFeedQuery = {
  feed: {
    __typename: 'PostPage';
    nextCursor: string | null;
    hasMore: boolean;
    items: Array<{
      __typename: 'Post';
      id: string;
      title: string;
      body: string | null;
      url: string | null;
      authorUsername: string;
      communityId: string;
      createdAt: string;
      editedAt: string | null;
      score: number;
      commentCount: number;
    }>;
  };
};

export const CommunitySummaryFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'CommunitySummary' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Community' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'memberCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CommunitySummaryFragment, unknown>;
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
export const BrowseCommunitiesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'BrowseCommunities' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'cursor' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'communities' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'cursor' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'cursor' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'CommunitySummary' },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'nextCursor' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hasMore' } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'CommunitySummary' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Community' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'memberCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  BrowseCommunitiesQuery,
  BrowseCommunitiesQueryVariables
>;
export const CommunityDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CommunityDetails' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'community' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'slug' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'slug' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'CommunitySummary' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'CommunitySummary' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Community' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'memberCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CommunityDetailsQuery,
  CommunityDetailsQueryVariables
>;
export const BrowseFeedDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'BrowseFeed' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sort' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'FeedSort' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'range' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'FeedRange' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'communitySlug' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'cursor' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'offset' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'feed' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sort' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'sort' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'range' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'range' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'communitySlug' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'communitySlug' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'cursor' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'cursor' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'offset' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'offset' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'body' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'authorUsername' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'communityId' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'editedAt' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'commentCount' },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'nextCursor' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hasMore' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<BrowseFeedQuery, BrowseFeedQueryVariables>;
