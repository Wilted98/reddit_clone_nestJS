import axios from 'axios';
import {
  expectData,
  gql,
  GqlResponse,
  registerAndLogin,
  Session,
  unique,
} from '../support/gql';

interface Comment {
  id: string;
  parentId: string | null;
  score: number;
  body: string;
  hasReplies: boolean;
}

interface Page {
  items: Comment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const fields = 'id parentId score body hasReplies';
const commentsQuery = `query ($postId: String!, $parentId: String, $cursor: String, $limit: Int) {
  comments(postId: $postId, parentId: $parentId, cursor: $cursor, limit: $limit) {
    items { ${fields} } nextCursor hasMore
  }
}`;

function expectBadRequest(response: GqlResponse<unknown>) {
  expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(400);
}

describe('Bounded public comment pages', () => {
  let author: Session;
  let postId: string;
  let otherPostId: string;
  let roots: Comment[];
  let replies: Comment[];
  let foreign: Comment;

  async function createComment(
    post: string,
    parentId?: string,
  ): Promise<Comment> {
    return expectData(
      await gql<{ createComment: Comment }>(
        `mutation ($input: CreateCommentInput!) { createComment(createCommentInput: $input) { ${fields} } }`,
        { input: { postId: post, parentId, body: 'Pagination fixture' } },
        author.cookie,
      ),
    ).createComment;
  }

  async function page(variables: Record<string, unknown>): Promise<Page> {
    return expectData(
      await gql<{ comments: Page }>(commentsQuery, { postId, ...variables }),
    ).comments;
  }

  beforeAll(async () => {
    author = await registerAndLogin();
    const slug = unique('pages');
    expectData(
      await gql(
        'mutation ($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        { input: { slug, name: 'Comment pagination' } },
        author.cookie,
      ),
    );
    async function createPost() {
      return expectData(
        await gql<{ createPost: { id: string } }>(
          'mutation ($input: CreatePostInput!) { createPost(createPostInput: $input) { id } }',
          {
            input: {
              communitySlug: slug,
              title: 'Bounded comment thread',
              body: 'Thread fixture',
            },
          },
          author.cookie,
        ),
      ).createPost.id;
    }
    postId = await createPost();
    otherPostId = await createPost();
    roots = [];
    for (let offset = 0; offset < 105; offset += 15) {
      roots.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(15, 105 - offset) }, () =>
            createComment(postId),
          ),
        )),
      );
    }
    replies = await Promise.all(
      Array.from({ length: 12 }, () => createComment(postId, roots[0].id)),
    );
    foreign = await createComment(otherPostId);
    for (const [targetId, value] of [
      [roots[104].id, 1],
      [roots[0].id, -1],
    ] as const) {
      expectData(
        await gql(
          'mutation ($input: VoteInput!) { voteComment(voteInput: $input) { score } }',
          { input: { targetId, value } },
          author.cookie,
        ),
      );
    }
  }, 30000);

  it('defaults to 25 roots and caps a page at 100 without losing remaining siblings', async () => {
    const defaultPage = await page({});
    expect(defaultPage.items).toHaveLength(25);
    expect(defaultPage.hasMore).toBe(true);
    const first = await page({ limit: 100 });
    const second = await page({ limit: 100, cursor: first.nextCursor });
    expect(first.items).toHaveLength(100);
    expect(first).toMatchObject({
      hasMore: true,
      nextCursor: first.items[99].id,
    });
    expect(second.items).toHaveLength(5);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
    const items = [...first.items, ...second.items];
    expect(new Set(items.map((row) => row.id))).toEqual(
      new Set(roots.map((row) => row.id)),
    );
    expect(items.every((row) => row.parentId === null)).toBe(true);
    expect(items[0]).toMatchObject({ id: roots[104].id, score: 1 });
    expect(items[104]).toMatchObject({
      id: roots[0].id,
      score: -1,
      hasReplies: true,
    });
    expect(items.filter((row) => row.hasReplies)).toHaveLength(1);
  });

  it('paginates replies independently and reports empty leaf pages', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await page({ parentId: roots[0].id, cursor, limit: 5 });
      expect(result.items.length).toBeLessThanOrEqual(5);
      expect(
        result.items.every(
          (row) => row.parentId === roots[0].id && !row.hasReplies,
        ),
      ).toBe(true);
      ids.push(...result.items.map((row) => row.id));
      cursor = result.nextCursor;
      expect(result.hasMore).toBe(cursor !== null);
    } while (cursor !== null);
    expect(ids).toHaveLength(12);
    expect(new Set(ids)).toEqual(new Set(replies.map((row) => row.id)));
    expect(await page({ parentId: roots[1].id })).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { postId: '' },
    { parentId: '' },
    { cursor: '' },
    { parentId: 'missing-comment' },
    { cursor: 'missing-comment' },
  ])('rejects invalid pagination or thread arguments %j', async (variables) => {
    expectBadRequest(await gql(commentsQuery, { postId, ...variables }));
  });

  it('rejects parents and cursors from another post or sibling group', async () => {
    for (const variables of [
      { parentId: foreign.id },
      { cursor: foreign.id },
      { cursor: replies[0].id },
      { parentId: roots[0].id, cursor: roots[0].id },
      { parentId: roots[1].id, cursor: replies[0].id },
    ]) {
      expectBadRequest(await gql(commentsQuery, { postId, ...variables }));
    }
  });

  it('keeps a deleted parent cursor usable and its descendants reachable', async () => {
    const deleted = expectData(
      await gql<{ deleteComment: Comment }>(
        `mutation ($id: String!) { deleteComment(id: $id) { ${fields} } }`,
        { id: roots[0].id },
        author.cookie,
      ),
    ).deleteComment;
    expect(deleted).toMatchObject({ body: '[deleted]', hasReplies: true });
    const replyPage = await page({ parentId: roots[0].id, limit: 100 });
    expect(replyPage.items).toHaveLength(12);
    expect(await page({ cursor: roots[0].id })).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it('traverses a deep thread one bounded level at a time without recursive payloads', async () => {
    const chain: Comment[] = [];
    let parentId: string | undefined;
    for (let depth = 0; depth < 40; depth++) {
      const row = await createComment(otherPostId, parentId);
      chain.push(row);
      parentId = row.id;
    }
    for (let depth = 0; depth < chain.length; depth++) {
      const result = await page({
        postId: otherPostId,
        parentId: depth === 0 ? null : chain[depth - 1].id,
      });
      const row = result.items.find((item) => item.id === chain[depth].id);
      expect(row).toMatchObject({
        id: chain[depth].id,
        hasReplies: depth < chain.length - 1,
      });
      expect(row).not.toHaveProperty('replies');
      if (depth > 0) expect(result.items).toHaveLength(1);
    }
    expect(await page({ postId: otherPostId, parentId: chain[39].id })).toEqual(
      { items: [], nextCursor: null, hasMore: false },
    );
  }, 30000);

  it('removes the recursive replies field from the public schema', async () => {
    const response = await axios.post('/graphql', {
      query: '{ __type(name: "Comment") { fields { name } } }',
    });
    const names = expectData<{ __type: { fields: { name: string }[] } }>(
      response.data,
    ).__type.fields.map((field) => field.name);
    expect(names).toContain('hasReplies');
    expect(names).not.toContain('replies');
  });

  it('preserves empty root pages for unknown posts', async () => {
    expect(await page({ postId: 'missing-post' })).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
