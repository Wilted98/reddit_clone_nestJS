import axios from 'axios';
import { expectData, gql, registerAndLogin, unique } from '../support/gql';

describe('current public post author avatars', () => {
  it('updates existing posts across detail, all feed sorts and author activity after avatar changes/removal', async () => {
    const owner = await registerAndLogin();
    const slug = unique('avatars');
    expectData(
      await gql(
        'mutation($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        { input: { slug, name: 'Author avatars' } },
        owner.cookie,
      ),
    );
    const ids: string[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const created = expectData(
          await gql<{
            createPost: { id: string; authorAvatarUrl: string | null };
          }>(
            'mutation($input: CreatePostInput!) { createPost(createPostInput: $input) { id authorAvatarUrl } }',
            {
              input: {
                communitySlug: slug,
                title: `Avatar post ${i}`,
                body: 'Existing discussion',
              },
            },
            owner.cookie,
          ),
        ).createPost;
        expect(created.authorAvatarUrl).toBeNull();
        ids.push(created.id);
      }
      type Item = {
        id: string;
        authorAvatarUrl: string | null;
        authorUsername: string;
      };
      const read = async (avatar: string | null) => {
        const detail = expectData(
          await gql<{ post: Item }>(
            'query($id: String!) { post(id: $id) { id authorUsername authorAvatarUrl } }',
            { id: ids[0] },
          ),
        ).post;
        expect(detail).toMatchObject({
          authorUsername: owner.username,
          authorAvatarUrl: avatar,
        });
        for (const sort of ['HOT', 'NEW', 'TOP']) {
          const page = expectData(
            await gql<{ feed: { items: Item[] } }>(
              'query($slug: String!, $sort: FeedSort!) { feed(communitySlug: $slug, sort: $sort) { items { id authorUsername authorAvatarUrl } } }',
              { slug, sort },
            ),
          ).feed;
          expect(page.items).toHaveLength(2);
          expect(
            page.items.every((post) => post.authorAvatarUrl === avatar),
          ).toBe(true);
        }
        const activity = expectData(
          await gql<{ postsByAuthor: { items: Item[] } }>(
            'query($author: String!) { postsByAuthor(authorId: $author) { items { id authorUsername authorAvatarUrl } } }',
            { author: owner.userId },
          ),
        ).postsByAuthor;
        expect(activity.items).toHaveLength(2);
        expect(
          activity.items.every((post) => post.authorAvatarUrl === avatar),
        ).toBe(true);
      };
      await read(null);
      for (const avatarUrl of [
        'https://example.com/avatar-one.png',
        'https://example.com/avatar-two.png',
        null,
      ]) {
        const response = await axios.post(
          `${process.env.AUTH_HTTP_URL ?? 'http://localhost:3000'}/graphql`,
          {
            query:
              'mutation($input: UpdateUserInput!) { updateUser(updateUserInput: $input) { avatarUrl } }',
            variables: { input: { avatarUrl } },
          },
          { headers: { Cookie: owner.cookie } },
        );
        expectData(response.data);
        await read(avatarUrl);
      }
    } finally {
      for (const id of ids) {
        expectData(
          await gql(
            'mutation($id: String!) { deletePost(id: $id) { id } }',
            { id },
            owner.cookie,
          ),
        );
      }
    }
  });
});
