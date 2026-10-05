/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type CreateCommentInput = {
  body: string;
  parentId?: string | null | undefined;
  postId: string;
};

export type CreatePostInput = {
  body?: string | null | undefined;
  communitySlug: string;
  title: string;
  url?: string | null | undefined;
};

export type FeedRange = 'ALL' | 'DAY' | 'MONTH' | 'WEEK';

export type FeedSort = 'HOT' | 'NEW' | 'TOP';

export type VoteInput = {
  targetId: string;
  value: number;
};

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

export type SubscribedCommunitiesQueryVariables = Exact<{
  cursor?: string | null | undefined;
  limit: number;
}>;

export type SubscribedCommunitiesQuery = {
  myCommunities: {
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
      communitySlug: string;
      createdAt: string;
      editedAt: string | null;
      score: number;
      commentCount: number;
    }>;
  };
};

export type DiscussionPostFragment = {
  __typename: 'Post';
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  authorId: string;
  authorUsername: string;
  communityId: string;
  communitySlug: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  score: number;
  commentCount: number;
};

export type DiscussionCommentFragment = {
  __typename: 'Comment';
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  score: number;
  hasReplies: boolean;
};

export type DiscussionQueryVariables = Exact<{
  id: string;
}>;

export type DiscussionQuery = {
  post: {
    __typename: 'Post';
    id: string;
    title: string;
    body: string | null;
    url: string | null;
    authorId: string;
    authorUsername: string;
    communityId: string;
    communitySlug: string;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    score: number;
    commentCount: number;
  };
};

export type ThreadCommentsQueryVariables = Exact<{
  postId: string;
  parentId?: string | null | undefined;
  cursor?: string | null | undefined;
  limit: number;
}>;

export type ThreadCommentsQuery = {
  comments: {
    __typename: 'CommentPage';
    nextCursor: string | null;
    hasMore: boolean;
    items: Array<{
      __typename: 'Comment';
      id: string;
      postId: string;
      parentId: string | null;
      authorId: string;
      authorUsername: string;
      body: string;
      createdAt: string;
      editedAt: string | null;
      deletedAt: string | null;
      score: number;
      hasReplies: boolean;
    }>;
  };
};

export type PublishPostMutationVariables = Exact<{
  input: CreatePostInput;
}>;

export type PublishPostMutation = {
  createPost: {
    __typename: 'Post';
    id: string;
    title: string;
    body: string | null;
    url: string | null;
    authorId: string;
    authorUsername: string;
    communityId: string;
    communitySlug: string;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    score: number;
    commentCount: number;
  };
};

export type PublishCommentMutationVariables = Exact<{
  input: CreateCommentInput;
}>;

export type PublishCommentMutation = {
  createComment: {
    __typename: 'Comment';
    id: string;
    postId: string;
    parentId: string | null;
    authorId: string;
    authorUsername: string;
    body: string;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    score: number;
    hasReplies: boolean;
  };
};

export type JoinForPostingMutationVariables = Exact<{
  slug: string;
}>;

export type JoinForPostingMutation = {
  joinCommunity: {
    __typename: 'Community';
    id: string;
    slug: string;
    name: string;
    description: string | null;
    memberCount: number;
    createdAt: string;
  };
};

export type OwnPostVotesQueryVariables = Exact<{
  ids: Array<string> | string;
}>;

export type OwnPostVotesQuery = {
  myPostVotes: Array<{
    __typename: 'VoteResult';
    targetId: string;
    myVote: number;
  }>;
};

export type OwnCommentVotesQueryVariables = Exact<{
  ids: Array<string> | string;
}>;

export type OwnCommentVotesQuery = {
  myCommentVotes: Array<{
    __typename: 'VoteResult';
    targetId: string;
    myVote: number;
  }>;
};

export type SetPostVoteMutationVariables = Exact<{
  input: VoteInput;
}>;

export type SetPostVoteMutation = {
  votePost: {
    __typename: 'VoteResult';
    targetId: string;
    score: number;
    myVote: number;
  };
};

export type SetCommentVoteMutationVariables = Exact<{
  input: VoteInput;
}>;

export type SetCommentVoteMutation = {
  voteComment: {
    __typename: 'VoteResult';
    targetId: string;
    score: number;
    myVote: number;
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
export const DiscussionPostFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'DiscussionPost' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communityId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communitySlug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'commentCount' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DiscussionPostFragment, unknown>;
export const DiscussionCommentFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'DiscussionComment' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Comment' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'postId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'parentId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasReplies' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DiscussionCommentFragment, unknown>;
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
export const SubscribedCommunitiesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SubscribedCommunities' },
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
            name: { kind: 'Name', value: 'myCommunities' },
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
  SubscribedCommunitiesQuery,
  SubscribedCommunitiesQueryVariables
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
                        name: { kind: 'Name', value: 'communitySlug' },
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
export const DiscussionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Discussion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
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
            name: { kind: 'Name', value: 'post' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'DiscussionPost' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'DiscussionPost' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communityId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communitySlug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'commentCount' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DiscussionQuery, DiscussionQueryVariables>;
export const ThreadCommentsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ThreadComments' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'postId' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'parentId' },
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
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'postId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'postId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'parentId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'parentId' },
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
                        name: { kind: 'Name', value: 'DiscussionComment' },
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
      name: { kind: 'Name', value: 'DiscussionComment' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Comment' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'postId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'parentId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasReplies' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ThreadCommentsQuery, ThreadCommentsQueryVariables>;
export const PublishPostDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PublishPost' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreatePostInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createPost' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'createPostInput' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'DiscussionPost' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'DiscussionPost' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communityId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'communitySlug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'commentCount' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PublishPostMutation, PublishPostMutationVariables>;
export const PublishCommentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PublishComment' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateCommentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createComment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'createCommentInput' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'DiscussionComment' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'DiscussionComment' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Comment' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'postId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'parentId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorId' } },
          { kind: 'Field', name: { kind: 'Name', value: 'authorUsername' } },
          { kind: 'Field', name: { kind: 'Name', value: 'body' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'editedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'score' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasReplies' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PublishCommentMutation,
  PublishCommentMutationVariables
>;
export const JoinForPostingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'JoinForPosting' },
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
            name: { kind: 'Name', value: 'joinCommunity' },
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
  JoinForPostingMutation,
  JoinForPostingMutationVariables
>;
export const OwnPostVotesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'OwnPostVotes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'String' },
                },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myPostVotes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'postIds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'ids' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'targetId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'myVote' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OwnPostVotesQuery, OwnPostVotesQueryVariables>;
export const OwnCommentVotesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'OwnCommentVotes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'String' },
                },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myCommentVotes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'commentIds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'ids' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'targetId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'myVote' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  OwnCommentVotesQuery,
  OwnCommentVotesQueryVariables
>;
export const SetPostVoteDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetPostVote' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'VoteInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'votePost' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'voteInput' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'targetId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'myVote' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetPostVoteMutation, SetPostVoteMutationVariables>;
export const SetCommentVoteDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetCommentVote' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'VoteInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'voteComment' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'voteInput' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'targetId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'myVote' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetCommentVoteMutation,
  SetCommentVoteMutationVariables
>;
