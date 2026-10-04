import {
  expectData,
  gql,
  GqlResponse,
  registerAndLogin,
  Session,
  unique,
} from '../support/gql';

interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  body: string | null;
  url: string | null;
  score: number;
  commentCount: number;
  deletedAt: string | null;
}

interface Comment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  body: string;
  deletedAt: string | null;
  hasReplies: boolean;
}

const postFields =
  'id authorId authorUsername body url score commentCount deletedAt';
const commentFields =
  'id parentId authorId authorUsername body deletedAt hasReplies';
const createPostQuery = `mutation ($input: CreatePostInput!) { createPost(createPostInput: $input) { ${postFields} } }`;
const createCommentQuery = `mutation ($input: CreateCommentInput!) { createComment(createCommentInput: $input) { ${commentFields} } }`;
const postQuery = `query ($id: String!) { post(id: $id) { ${postFields} } }`;
const commentsQuery = `query ($postId: String!, $parentId: String) { comments(postId: $postId, parentId: $parentId) { items { ${commentFields} } nextCursor hasMore } }`;
const deletePostQuery = `mutation ($id: String!) { deletePost(id: $id) { ${postFields} } }`;
const deleteCommentQuery = `mutation ($id: String!) { deleteComment(id: $id) { ${commentFields} } }`;

function expectError(response: GqlResponse<unknown>, statusCode: number) {
  expect(response.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        extensions: expect.objectContaining({
          originalError: expect.objectContaining({ statusCode }),
        }),
      }),
    ]),
  );
}

describe('Posts and comments through auth and social', () => {
  let owner: Session;
  let outsider: Session;
  let communitySlug: string;

  beforeAll(async () => {
    [owner, outsider] = await Promise.all([
      registerAndLogin(),
      registerAndLogin(),
    ]);
    communitySlug = unique('c');
    expectData(
      await gql(
        'mutation ($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        { input: { slug: communitySlug, name: 'Posts and Comments' } },
        owner.cookie,
      ),
    );
  });

  async function createPost(
    input: Record<string, unknown> = {},
  ): Promise<Post> {
    return expectData(
      await gql<{ createPost: Post }>(
        createPostQuery,
        {
          input: {
            communitySlug,
            title: 'Review test post',
            body: 'A text post',
            ...input,
          },
        },
        owner.cookie,
      ),
    ).createPost;
  }

  async function createComment(
    postId: string,
    parentId?: string,
  ): Promise<Comment> {
    return expectData(
      await gql<{ createComment: Comment }>(
        createCommentQuery,
        {
          input: {
            postId,
            body: 'A test comment',
            ...(parentId ? { parentId } : {}),
          },
        },
        outsider.cookie,
      ),
    ).createComment;
  }

  async function readPost(id: string): Promise<Post> {
    return expectData(await gql<{ post: Post }>(postQuery, { id })).post;
  }

  async function readComments(
    postId: string,
    parentId?: string,
  ): Promise<Comment[]> {
    return expectData(
      await gql<{ comments: { items: Comment[] } }>(commentsQuery, {
        postId,
        parentId,
      }),
    ).comments.items;
  }

  it('creates member-owned text and link posts with identity supplied by auth', async () => {
    const text = await createPost();
    const link = await createPost({
      body: undefined,
      url: 'https://example.com/article',
    });
    for (const post of [text, link]) {
      expect(post).toMatchObject({
        authorId: owner.userId,
        authorUsername: owner.username,
        score: 0,
        commentCount: 0,
        deletedAt: null,
      });
      expect(await readPost(post.id)).toEqual(post);
    }
    expect(text).toMatchObject({ body: 'A text post', url: null });
    expect(link).toMatchObject({
      body: null,
      url: 'https://example.com/article',
    });
  });

  it('requires community membership to post', async () => {
    expectError(
      await gql(
        createPostQuery,
        {
          input: {
            communitySlug,
            title: 'Outsider post',
            body: 'Not a member',
          },
        },
        outsider.cookie,
      ),
      403,
    );
  });

  it.each([
    { body: undefined },
    { url: 'https://example.com' },
    { title: 'x' },
    { body: undefined, url: 'not-a-url' },
  ])('rejects invalid post content %#', async (input) => {
    expectError(
      await gql(
        createPostQuery,
        {
          input: {
            communitySlug,
            title: 'Invalid post',
            body: 'Text',
            ...input,
          },
        },
        owner.cookie,
      ),
      400,
    );
  });

  it('rejects all anonymous post and comment mutations', async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    for (const [query, variables] of [
      [
        createPostQuery,
        { input: { communitySlug, title: 'Anonymous post', body: 'Text' } },
      ],
      [deletePostQuery, { id: post.id }],
      [
        createCommentQuery,
        { input: { postId: post.id, body: 'Anonymous comment' } },
      ],
      [deleteCommentQuery, { id: comment.id }],
    ] as const) {
      const response = await gql(query, variables);
      expect(response.errors?.[0].extensions?.code).toBe('FORBIDDEN');
    }
  });

  it("rejects deleting another author's post or comment", async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    expectError(
      await gql(deletePostQuery, { id: post.id }, outsider.cookie),
      403,
    );
    expectError(
      await gql(deleteCommentQuery, { id: comment.id }, owner.cookie),
      403,
    );
    expect((await readPost(post.id)).deletedAt).toBeNull();
    expect((await readComments(post.id))[0].deletedAt).toBeNull();
  });

  it('paginates public author posts without duplicates and excludes deleted posts', async () => {
    const author = await registerAndLogin();
    expectData(
      await gql(
        'mutation ($slug: String!) { joinCommunity(slug: $slug) { id } }',
        { slug: communitySlug },
        author.cookie,
      ),
    );
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const post = expectData(
        await gql<{ createPost: Post }>(
          createPostQuery,
          {
            input: {
              communitySlug,
              title: `Pagination post ${i}`,
              body: 'Text',
            },
          },
          author.cookie,
        ),
      ).createPost;
      ids.push(post.id);
    }
    expectData(await gql(deletePostQuery, { id: ids[1] }, author.cookie));
    const query =
      'query ($authorId: String!, $cursor: String, $limit: Int!) { postsByAuthor(authorId: $authorId, cursor: $cursor, limit: $limit) { items { id } nextCursor hasMore } }';
    type Page = {
      postsByAuthor: {
        items: { id: string }[];
        nextCursor: string | null;
        hasMore: boolean;
      };
    };
    const first = expectData(
      await gql<Page>(query, { authorId: author.userId, limit: 1 }),
    ).postsByAuthor;
    const second = expectData(
      await gql<Page>(query, {
        authorId: author.userId,
        cursor: first.nextCursor,
        limit: 1,
      }),
    ).postsByAuthor;
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((post) => post.id)).toEqual([
      ids[2],
      ids[0],
    ]);
  });

  it('lets authenticated non-members comment and exposes public reply pages', async () => {
    const post = await createPost();
    const root = await createComment(post.id);
    const reply = await createComment(post.id, root.id);
    const nested = await createComment(post.id, reply.id);
    expect(root).toMatchObject({
      authorId: outsider.userId,
      authorUsername: outsider.username,
      parentId: null,
    });
    const roots = await readComments(post.id);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ id: root.id, hasReplies: true });
    expect((await readComments(post.id, root.id))[0]).toMatchObject({
      id: reply.id,
      hasReplies: true,
    });
    expect((await readComments(post.id, reply.id))[0]).toMatchObject({
      id: nested.id,
      hasReplies: false,
    });
    expect((await readPost(post.id)).commentCount).toBe(3);
  });

  it('rejects missing, cross-post, and empty parent IDs without incrementing the counter', async () => {
    const post = await createPost();
    const other = await createPost();
    const otherComment = await createComment(other.id);
    for (const parentId of ['missing-comment', otherComment.id, '']) {
      expectError(
        await gql(
          createCommentQuery,
          { input: { postId: post.id, parentId, body: 'Invalid reply' } },
          outsider.cookie,
        ),
        400,
      );
    }
    expect((await readPost(post.id)).commentCount).toBe(0);
  });

  it('preserves descendants and the total count when a comment is soft-deleted', async () => {
    const post = await createPost();
    const root = await createComment(post.id);
    const reply = await createComment(post.id, root.id);
    const deleted = expectData(
      await gql<{ deleteComment: Comment }>(
        deleteCommentQuery,
        { id: root.id },
        outsider.cookie,
      ),
    ).deleteComment;
    expect(deleted.body).toBe('[deleted]');
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.hasReplies).toBe(true);
    const roots = await readComments(post.id);
    expect(roots[0]).toMatchObject({
      id: root.id,
      body: '[deleted]',
      hasReplies: true,
    });
    expect((await readComments(post.id, root.id))[0].id).toBe(reply.id);
    expect((await readPost(post.id)).commentCount).toBe(2);
  });

  it('keeps comment counters consistent under concurrent inserts', async () => {
    const post = await createPost();
    await Promise.all(Array.from({ length: 6 }, () => createComment(post.id)));
    expect((await readPost(post.id)).commentCount).toBe(6);
    expect(await readComments(post.id)).toHaveLength(6);
  });

  it('clears deleted post content, preserves its thread, and rejects new comments', async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    const deleted = expectData(
      await gql<{ deletePost: Post }>(
        deletePostQuery,
        { id: post.id },
        owner.cookie,
      ),
    ).deletePost;
    expect(deleted).toMatchObject({ body: null, url: null, commentCount: 1 });
    expect(deleted.deletedAt).not.toBeNull();
    expect(await readPost(post.id)).toEqual(deleted);
    expect((await readComments(post.id))[0].id).toBe(comment.id);
    expectError(
      await gql(
        createCommentQuery,
        { input: { postId: post.id, body: 'Too late' } },
        outsider.cookie,
      ),
      400,
    );
    expect((await readPost(post.id)).commentCount).toBe(1);
  });

  it('serializes a concurrent comment and deletion without losing the counter', async () => {
    const post = await createPost();
    const [commentResult, deletion] = await Promise.all([
      gql<{ createComment: Comment }>(
        createCommentQuery,
        { input: { postId: post.id, body: 'Concurrent comment' } },
        outsider.cookie,
      ),
      gql(deletePostQuery, { id: post.id }, owner.cookie),
    ]);
    expectData(deletion);
    if (commentResult.errors) expectError(commentResult, 400);
    else expectData(commentResult);
    const comments = await readComments(post.id);
    const finalPost = await readPost(post.id);
    expect(finalPost.deletedAt).not.toBeNull();
    expect(finalPost.commentCount).toBe(comments.length);
    expect(comments).toHaveLength(commentResult.errors ? 0 : 1);
  });

  it('returns not-found errors for unknown posts and delete targets', async () => {
    expectError(await gql(postQuery, { id: 'missing-post' }), 404);
    expectError(
      await gql(deletePostQuery, { id: 'missing-post' }, owner.cookie),
      404,
    );
    expectError(
      await gql(deleteCommentQuery, { id: 'missing-comment' }, owner.cookie),
      404,
    );
    expectError(
      await gql(
        createCommentQuery,
        { input: { postId: 'missing-post', body: 'Missing post' } },
        outsider.cookie,
      ),
      404,
    );
    expect(await readComments('missing-post')).toEqual([]);
  });
});
