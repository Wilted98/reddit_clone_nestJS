import axios from 'axios';
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
  communityId: string;
  title: string;
  body: string | null;
  url: string | null;
  score: number;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  score: number;
  hasReplies: boolean;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

const postFields =
  'id authorId communityId title body url score commentCount createdAt editedAt deletedAt';
const commentFields =
  'id postId parentId authorId body score hasReplies createdAt editedAt deletedAt';
const updatePostQuery = `mutation ($input: UpdatePostInput!) { updatePost(updatePostInput: $input) { ${postFields} } }`;
const updateCommentQuery = `mutation ($input: UpdateCommentInput!) { updateComment(updateCommentInput: $input) { ${commentFields} } }`;
const postsByAuthorQuery = `query ($authorId: String!, $cursor: String, $limit: Int) { activity: postsByAuthor(authorId: $authorId, cursor: $cursor, limit: $limit) { items { ${postFields} } nextCursor hasMore } }`;
const commentsByAuthorQuery = `query ($authorId: String!, $cursor: String, $limit: Int) { activity: commentsByAuthor(authorId: $authorId, cursor: $cursor, limit: $limit) { items { ${commentFields} } nextCursor hasMore } }`;

function expectError(response: GqlResponse<unknown>, status: number) {
  expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
    status,
  );
}

describe('Profile activity and author content editing', () => {
  let author: Session;
  let viewer: Session;
  let slug: string;
  let profilePosts: Post[];
  let profileComments: Comment[];
  let foreignPost: Post;
  let foreignComment: Comment;

  async function createPost(
    input: Record<string, unknown> = {},
    session = author,
  ): Promise<Post> {
    return expectData(
      await gql<{ createPost: Post }>(
        `mutation ($input: CreatePostInput!) { createPost(createPostInput: $input) { ${postFields} } }`,
        {
          input: {
            communitySlug: slug,
            title: 'Profile activity post',
            body: 'Original post body',
            ...input,
          },
        },
        session.cookie,
      ),
    ).createPost;
  }

  async function createComment(
    postId: string,
    parentId?: string,
    session = author,
  ): Promise<Comment> {
    return expectData(
      await gql<{ createComment: Comment }>(
        `mutation ($input: CreateCommentInput!) { createComment(createCommentInput: $input) { ${commentFields} } }`,
        { input: { postId, parentId, body: 'Original comment body' } },
        session.cookie,
      ),
    ).createComment;
  }

  async function readPost(id: string): Promise<Post> {
    return expectData(
      await gql<{ post: Post }>(
        `query ($id: String!) { post(id: $id) { ${postFields} } }`,
        { id },
      ),
    ).post;
  }

  async function readComments(
    postId: string,
    parentId?: string,
  ): Promise<Comment[]> {
    return expectData(
      await gql<{ comments: Page<Comment> }>(
        `query ($postId: String!, $parentId: String) { comments(postId: $postId, parentId: $parentId) { items { ${commentFields} } nextCursor hasMore } }`,
        { postId, parentId },
      ),
    ).comments.items;
  }

  async function deletePost(id: string): Promise<Post> {
    return expectData(
      await gql<{ deletePost: Post }>(
        `mutation ($id: String!) { deletePost(id: $id) { ${postFields} } }`,
        { id },
        author.cookie,
      ),
    ).deletePost;
  }

  async function deleteComment(id: string): Promise<Comment> {
    return expectData(
      await gql<{ deleteComment: Comment }>(
        `mutation ($id: String!) { deleteComment(id: $id) { ${commentFields} } }`,
        { id },
        author.cookie,
      ),
    ).deleteComment;
  }

  beforeAll(async () => {
    [author, viewer] = await Promise.all([
      registerAndLogin(),
      registerAndLogin(),
    ]);
    slug = unique('profile');
    expectData(
      await gql(
        'mutation ($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        { input: { slug, name: 'Profile and editing fixtures' } },
        author.cookie,
      ),
    );
    expectData(
      await gql(
        'mutation ($slug: String!) { joinCommunity(slug: $slug) { id } }',
        { slug },
        viewer.cookie,
      ),
    );
    profilePosts = [];
    for (let i = 0; i < 3; i++) profilePosts.push(await createPost());
    profileComments = [];
    profileComments.push(await createComment(profilePosts[0].id));
    profileComments.push(
      await createComment(profilePosts[0].id, profileComments[0].id),
    );
    profileComments.push(await createComment(profilePosts[1].id));
    profileComments.push(await createComment(profilePosts[2].id));
    const removed = await createComment(profilePosts[2].id);
    await deleteComment(removed.id);
    await deletePost(profilePosts[2].id);
    foreignPost = await createPost({}, viewer);
    foreignComment = await createComment(foreignPost.id, undefined, viewer);
  });

  it('builds public profile activity from the existing auth profile and social pages without email', async () => {
    const profile = await axios.post(
      `${process.env.AUTH_HTTP_URL ?? 'http://localhost:3000'}/graphql`,
      {
        query:
          'query ($username: String!) { user(username: $username) { id username bio avatarUrl } }',
        variables: { username: author.username },
      },
    );
    const user = expectData<{ user: { id: string; username: string } }>(
      profile.data,
    ).user;
    expect(user).toMatchObject({
      id: author.userId,
      username: author.username,
    });
    expect(user).not.toHaveProperty('email');
    const first = expectData(
      await gql<{ activity: Page<Post> }>(postsByAuthorQuery, {
        authorId: user.id,
        limit: 1,
      }),
    ).activity;
    const second = expectData(
      await gql<{ activity: Page<Post> }>(postsByAuthorQuery, {
        authorId: user.id,
        cursor: first.nextCursor,
        limit: 1,
      }),
    ).activity;
    expect(first.items.map((row) => row.id)).toEqual([profilePosts[1].id]);
    expect(first.hasMore).toBe(true);
    expect(second.items.map((row) => row.id)).toEqual([profilePosts[0].id]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
    const comments: Comment[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 2; i++) {
      const page: Page<Comment> = expectData(
        await gql<{ activity: Page<Comment> }>(commentsByAuthorQuery, {
          authorId: user.id,
          cursor,
          limit: 2,
        }),
      ).activity;
      comments.push(...page.items);
      cursor = page.nextCursor;
      expect(page.hasMore).toBe(i === 0);
    }
    expect(cursor).toBeNull();
    expect(comments.map((row) => row.id)).toEqual(
      profileComments.map((row) => row.id).reverse(),
    );
    expect(
      comments.every(
        (row) => row.authorId === author.userId && row.deletedAt === null,
      ),
    ).toBe(true);
    expect(
      comments.find((row) => row.id === profileComments[0].id)?.hasReplies,
    ).toBe(true);
    expect(
      comments.find((row) => row.id === profileComments[1].id)?.parentId,
    ).toBe(profileComments[0].id);
    expect(comments.some((row) => row.postId === profilePosts[2].id)).toBe(
      true,
    );
  });

  it('keeps same-author deleted cursors usable for remaining activity', async () => {
    const removedPost = await deletePost(profilePosts[1].id);
    const remainingPosts = expectData(
      await gql<{ activity: Page<Post> }>(postsByAuthorQuery, {
        authorId: author.userId,
        cursor: removedPost.id,
      }),
    ).activity;
    expect(remainingPosts.items.map((row) => row.id)).toEqual([
      profilePosts[0].id,
    ]);
    const removedComment = await deleteComment(profileComments[3].id);
    const remainingComments = expectData(
      await gql<{ activity: Page<Comment> }>(commentsByAuthorQuery, {
        authorId: author.userId,
        cursor: removedComment.id,
      }),
    ).activity;
    expect(remainingComments.items.map((row) => row.id)).toEqual(
      profileComments
        .slice(0, 3)
        .map((row) => row.id)
        .reverse(),
    );
  });

  it('rejects missing/foreign activity cursors and invalid bounds on both activity queries', async () => {
    for (const [query, foreign] of [
      [postsByAuthorQuery, foreignPost.id],
      [commentsByAuthorQuery, foreignComment.id],
    ]) {
      for (const variables of [
        { cursor: foreign },
        { cursor: 'missing-cursor' },
        { cursor: '' },
        { limit: 0 },
        { limit: 101 },
        { authorId: '' },
      ]) {
        expectError(
          await gql(query, { authorId: author.userId, ...variables }),
          400,
        );
      }
      const empty = expectData(
        await gql<{ activity: Page<unknown> }>(query, {
          authorId: 'unknown-author',
        }),
      ).activity;
      expect(empty).toEqual({ items: [], nextCursor: null, hasMore: false });
    }
  });

  it('edits text/link posts and comments without changing identity, location, creation time, scores, or counts', async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    const reply = await createComment(post.id, comment.id);
    for (const [mutation, id] of [
      ['votePost', post.id],
      ['voteComment', comment.id],
    ]) {
      expectData(
        await gql(
          `mutation ($input: VoteInput!) { ${mutation}(voteInput: $input) { score } }`,
          { input: { targetId: id, value: 1 } },
          viewer.cookie,
        ),
      );
    }
    const before = await readPost(post.id);
    expect(before.editedAt).toBeNull();
    expect((await readComments(post.id))[0].editedAt).toBeNull();
    const updated = expectData(
      await gql<{ updatePost: Post }>(
        updatePostQuery,
        { input: { id: post.id, title: 'Edited title', body: 'Edited body' } },
        author.cookie,
      ),
    ).updatePost;
    expect(updated).toMatchObject({
      ...before,
      title: 'Edited title',
      body: 'Edited body',
      editedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(updated.editedAt as string))).toBe(true);
    const edited = expectData(
      await gql<{ updateComment: Comment }>(
        updateCommentQuery,
        { input: { id: comment.id, body: 'Edited comment' } },
        author.cookie,
      ),
    ).updateComment;
    expect(edited).toMatchObject({
      id: comment.id,
      postId: post.id,
      parentId: null,
      authorId: author.userId,
      score: 1,
      body: 'Edited comment',
      hasReplies: true,
      createdAt: comment.createdAt,
      editedAt: expect.any(String),
    });
    expect((await readComments(post.id, comment.id))[0].id).toBe(reply.id);
    const link = await createPost({
      body: undefined,
      url: 'https://example.com/original',
    });
    const editedLink = expectData(
      await gql<{ updatePost: Post }>(
        updatePostQuery,
        { input: { id: link.id, url: 'https://example.com/edited' } },
        author.cookie,
      ),
    ).updatePost;
    expect(editedLink).toMatchObject({
      ...link,
      url: 'https://example.com/edited',
      editedAt: expect.any(String),
    });
    expect((await readPost(post.id)).commentCount).toBe(2);
    await createComment(post.id);
    for (const [mutation, id] of [
      ['votePost', post.id],
      ['voteComment', comment.id],
    ]) {
      expectData(
        await gql(
          `mutation ($input: VoteInput!) { ${mutation}(voteInput: $input) { score } }`,
          { input: { targetId: id, value: -1 } },
          viewer.cookie,
        ),
      );
    }
    expect(await readPost(post.id)).toMatchObject({
      score: -1,
      commentCount: 3,
      editedAt: updated.editedAt,
    });
    expect(
      (await readComments(post.id)).find((row) => row.id === comment.id),
    ).toMatchObject({
      score: -1,
      editedAt: edited.editedAt,
    });
    const activity = expectData(
      await gql<{ activity: Page<Comment> }>(commentsByAuthorQuery, {
        authorId: author.userId,
      }),
    ).activity;
    expect(activity.items.find((row) => row.id === comment.id)).toMatchObject({
      body: 'Edited comment',
      editedAt: edited.editedAt,
    });
    const feed = expectData(
      await gql<{ feed: Page<Post> }>(
        'query ($slug: String!) { feed(sort: NEW, communitySlug: $slug) { items { id editedAt } nextCursor hasMore } }',
        { slug },
      ),
    ).feed;
    expect(feed.items.find((row) => row.id === post.id)?.editedAt).toBe(
      updated.editedAt,
    );
  });

  it("rejects anonymous/forged-cookie edits and edits of another author's content", async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    for (const [query, input] of [
      [updatePostQuery, { id: post.id, body: 'Edited' }],
      [updateCommentQuery, { id: comment.id, body: 'Edited' }],
    ]) {
      for (const cookie of [undefined, 'Authentication=forged']) {
        const response = await gql(query as string, { input }, cookie);
        expect(response.errors?.[0].extensions?.code).toBe('FORBIDDEN');
      }
      expectError(await gql(query as string, { input }, viewer.cookie), 403);
    }
    expect((await readPost(post.id)).body).toBe(post.body);
    expect((await readComments(post.id))[0].body).toBe(comment.body);
  });

  it('rejects empty patches, type changes, nulls, invalid lengths/URLs, and missing targets', async () => {
    const post = await createPost();
    const link = await createPost({
      body: undefined,
      url: 'https://example.com/original',
    });
    const comment = await createComment(post.id);
    for (const input of [
      { id: post.id },
      { id: post.id, title: null },
      { id: post.id, body: null },
      { id: post.id, title: 'ab' },
      { id: post.id, body: '' },
      { id: post.id, url: 'https://example.com/convert' },
      { id: link.id, body: 'Convert' },
      { id: link.id, url: null },
      { id: link.id, url: 'bad-url' },
    ])
      expectError(await gql(updatePostQuery, { input }, author.cookie), 400);
    expectError(
      await gql(
        updateCommentQuery,
        { input: { id: comment.id, body: '' } },
        author.cookie,
      ),
      400,
    );
    expectError(
      await gql(
        updateCommentQuery,
        { input: { id: comment.id, body: 'x'.repeat(10001) } },
        author.cookie,
      ),
      400,
    );
    expectError(
      await gql(
        updatePostQuery,
        { input: { id: 'missing-post', title: 'Edited title' } },
        author.cookie,
      ),
      404,
    );
    expectError(
      await gql(
        updateCommentQuery,
        { input: { id: 'missing-comment', body: 'Edited' } },
        author.cookie,
      ),
      404,
    );
    expect((await readPost(post.id)).editedAt).toBeNull();
    expect((await readComments(post.id))[0].editedAt).toBeNull();
  });

  it('rejects forged identity, location, counters, and timestamps in GraphQL input', async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    for (const [query, input] of [
      [
        updatePostQuery,
        {
          id: post.id,
          title: 'Edited title',
          authorId: viewer.userId,
          communityId: 'other',
          score: 99,
          editedAt: '2020-01-01',
        },
      ],
      [
        updateCommentQuery,
        {
          id: comment.id,
          body: 'Edited',
          authorId: viewer.userId,
          parentId: 'other',
          postId: 'other',
          score: 99,
        },
      ],
    ]) {
      const response = await axios.post(
        '/graphql',
        { query, variables: { input } },
        { headers: { Cookie: author.cookie }, validateStatus: () => true },
      );
      expect(response.status).toBe(400);
      expect(response.data.errors).toBeDefined();
    }
    expect((await readPost(post.id)).editedAt).toBeNull();
    expect((await readComments(post.id))[0].editedAt).toBeNull();
  });

  it('lets authors edit after leaving a community and lets live comments remain editable on deleted posts', async () => {
    const member = await registerAndLogin();
    expectData(
      await gql(
        'mutation ($slug: String!) { joinCommunity(slug: $slug) { id } }',
        { slug },
        member.cookie,
      ),
    );
    const post = await createPost({}, member);
    expectData(
      await gql(
        'mutation ($slug: String!) { leaveCommunity(slug: $slug) { id } }',
        { slug },
        member.cookie,
      ),
    );
    const edited = expectData(
      await gql<{ updatePost: Post }>(
        updatePostQuery,
        { input: { id: post.id, body: 'Edited after leaving' } },
        member.cookie,
      ),
    ).updatePost;
    expect(edited.body).toBe('Edited after leaving');
    const ownPost = await createPost();
    const comment = await createComment(ownPost.id);
    await deletePost(ownPost.id);
    const editedComment = expectData(
      await gql<{ updateComment: Comment }>(
        updateCommentQuery,
        { input: { id: comment.id, body: 'Thread correction' } },
        author.cookie,
      ),
    ).updateComment;
    expect(editedComment.body).toBe('Thread correction');
  });

  it('does not resurrect deleted content when edits and deletions race', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const post = await createPost();
      const [edit] = await Promise.all([
        gql(
          updatePostQuery,
          { input: { id: post.id, body: 'Racing edit' } },
          author.cookie,
        ),
        deletePost(post.id),
      ]);
      if (edit.errors) expectError(edit, 400);
      else expectData(edit);
      expect(await readPost(post.id)).toMatchObject({
        body: null,
        url: null,
        deletedAt: expect.any(String),
      });
      expectError(
        await gql(
          updatePostQuery,
          { input: { id: post.id, title: 'Restore' } },
          author.cookie,
        ),
        400,
      );
      const live = await createPost();
      const comment = await createComment(live.id);
      const [commentEdit] = await Promise.all([
        gql(
          updateCommentQuery,
          { input: { id: comment.id, body: 'Racing edit' } },
          author.cookie,
        ),
        deleteComment(comment.id),
      ]);
      if (commentEdit.errors) expectError(commentEdit, 400);
      else expectData(commentEdit);
      expect((await readComments(live.id))[0]).toMatchObject({
        body: '[deleted]',
        deletedAt: expect.any(String),
      });
      expectError(
        await gql(
          updateCommentQuery,
          { input: { id: comment.id, body: 'Restore' } },
          author.cookie,
        ),
        400,
      );
    }
  }, 15000);
});
