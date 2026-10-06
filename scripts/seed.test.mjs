import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSeedData } from './seed-data.mjs';
import { assertSeedIdentities, seedDatabases } from './seed.mjs';

test('demo data is deterministic, bounded and internally consistent', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const data = buildSeedData(now);
  assert.deepEqual(data, buildSeedData(now));
  assert.equal(data.users.length, 12);
  assert.equal(data.communities.length, 6);
  assert.equal(data.posts.length, 24);
  assert.equal(data.comments.length, 72);
  for (const name of ['users', 'communities', 'posts', 'comments', 'votes']) {
    assert.equal(
      new Set(data[name].map((item) => item.id)).size,
      data[name].length,
    );
  }
  const authors = new Map(data.users.map((item) => [item.id, item.username]));
  const posts = new Map(data.posts.map((item) => [item.id, item]));
  const comments = new Map(data.comments.map((item) => [item.id, item]));
  for (const community of data.communities) {
    const owners = data.memberships.filter(
      (item) => item.communityId === community.id && item.role === 'OWNER',
    );
    assert.equal(owners.length, 1);
    assert.equal(owners[0].userId, community.ownerId);
  }
  for (const post of data.posts) {
    assert.equal(authors.get(post.authorId), post.authorUsername);
    assert.notEqual(Boolean(post.body), Boolean(post.url));
    assert(
      data.memberships.some(
        (item) =>
          item.communityId === post.communityId &&
          item.userId === post.authorId,
      ),
    );
    assert(post.createdAt < now);
  }
  for (const comment of data.comments) {
    assert.equal(authors.get(comment.authorId), comment.authorUsername);
    assert(posts.has(comment.postId));
    if (comment.parentId)
      assert.equal(comments.get(comment.parentId).postId, comment.postId);
    assert(comment.createdAt >= posts.get(comment.postId).createdAt);
    assert(comment.createdAt <= now);
  }
  const uniqueVotes = new Set();
  for (const vote of data.votes) {
    assert(authors.has(vote.userId));
    assert([-1, 1].includes(vote.value));
    assert.notEqual(Boolean(vote.postId), Boolean(vote.commentId));
    assert(vote.postId ? posts.has(vote.postId) : comments.has(vote.commentId));
    const key = `${vote.userId}:${vote.postId ?? vote.commentId}`;
    assert(!uniqueVotes.has(key));
    uniqueVotes.add(key);
  }
});

test('identity checks refuse collisions without overwriting unrelated accounts/communities', () => {
  const data = buildSeedData();
  assert.doesNotThrow(() =>
    assertSeedIdentities(data.users, data.communities, data),
  );
  assert.throws(() =>
    assertSeedIdentities([{ ...data.users[0], id: 'real-user' }], [], data),
  );
  assert.throws(() =>
    assertSeedIdentities(
      [],
      [{ ...data.communities[0], id: 'real-community' }],
      data,
    ),
  );
});

test('seeding uses skipDuplicates and recomputes counters from stored records, not fictional totals', async () => {
  const data = buildSeedData();
  const writes = [];
  const auth = {
    user: {
      findMany: async () => [],
      createMany: async (input) => {
        writes.push(['users', input]);
      },
    },
  };
  const tx = Object.fromEntries(
    ['community', 'membership', 'post', 'comment', 'vote'].map((name) => [
      name,
      {
        createMany: async (input) => {
          writes.push([name, input]);
        },
        updateMany: async (input) => {
          writes.push([`${name}Update`, input]);
        },
        count: async () => (name === 'membership' ? 7 : 4),
        aggregate: async () => ({ _sum: { value: 5 } }),
      },
    ]),
  );
  const social = {
    community: { findMany: async () => [] },
    $transaction: async (work) => work(tx),
  };
  await seedDatabases({ auth, social }, data);
  for (const [, input] of writes.filter(([name]) => !name.endsWith('Update')))
    assert.equal(input.skipDuplicates, true);
  const password = writes[0][1].data[0].password;
  assert.match(password, /^\$2[aby]\$10\$/);
  assert(!password.includes('RoorinDemo'));
  assert.equal(
    writes.find(([name]) => name === 'communityUpdate')[1].data.memberCount,
    7,
  );
  assert.deepEqual(writes.find(([name]) => name === 'postUpdate')[1].data, {
    commentCount: 4,
    score: 5,
  });
  assert.equal(
    writes.find(([name]) => name === 'commentUpdate')[1].data.score,
    5,
  );
});
