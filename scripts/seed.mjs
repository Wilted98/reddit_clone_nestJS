import { hash } from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { databaseConfig, databaseClients } from './dev-database.mjs';
import { buildSeedData, demoPassword } from './seed-data.mjs';

export function assertSeedIdentities(existingUsers, existingCommunities, data) {
  for (const user of existingUsers) {
    const expected = data.users.find((item) => item.id === user.id);
    if (
      !expected ||
      expected.username !== user.username ||
      expected.email !== user.email
    ) {
      throw new Error(
        'A demo username/email is already owned by a different account. Seed will not overwrite it.',
      );
    }
  }
  for (const community of existingCommunities) {
    const expected = data.communities.find((item) => item.id === community.id);
    if (!expected || expected.slug !== community.slug) {
      throw new Error(
        'A demo community slug is already owned by another community. Seed will not overwrite it.',
      );
    }
  }
}

export async function seedDatabases({ auth, social }, data = buildSeedData()) {
  const existingUsers = await auth.user.findMany({
    where: {
      OR: [
        { id: { in: data.users.map((item) => item.id) } },
        { username: { in: data.users.map((item) => item.username) } },
        { email: { in: data.users.map((item) => item.email) } },
      ],
    },
    select: { id: true, username: true, email: true },
  });
  const existingCommunities = await social.community.findMany({
    where: {
      OR: [
        { id: { in: data.communities.map((item) => item.id) } },
        { slug: { in: data.communities.map((item) => item.slug) } },
      ],
    },
    select: { id: true, slug: true },
  });
  assertSeedIdentities(existingUsers, existingCommunities, data);
  const password = await hash(demoPassword, 10);
  await auth.user.createMany({
    data: data.users.map((user) => ({ ...user, password })),
    skipDuplicates: true,
  });
  await social.$transaction(
    async (tx) => {
      await tx.community.createMany({
        data: data.communities,
        skipDuplicates: true,
      });
      await tx.membership.createMany({
        data: data.memberships,
        skipDuplicates: true,
      });
      await tx.post.createMany({ data: data.posts, skipDuplicates: true });
      await tx.comment.createMany({
        data: data.comments,
        skipDuplicates: true,
      });
      await tx.vote.createMany({ data: data.votes, skipDuplicates: true });
      // Recount actual rows, including user-created activity preserved on reseeding.
      for (const community of data.communities) {
        const memberCount = await tx.membership.count({
          where: { communityId: community.id },
        });
        await tx.community.updateMany({
          where: { id: community.id, memberCount: { not: memberCount } },
          data: { memberCount },
        });
      }
      for (const post of data.posts) {
        const commentCount = await tx.comment.count({
          where: { postId: post.id },
        });
        const total = await tx.vote.aggregate({
          where: { postId: post.id },
          _sum: { value: true },
        });
        const score = total._sum.value ?? 0;
        await tx.post.updateMany({
          where: {
            id: post.id,
            OR: [
              { score: { not: score } },
              { commentCount: { not: commentCount } },
            ],
          },
          data: { commentCount, score },
        });
      }
      for (const comment of data.comments) {
        const total = await tx.vote.aggregate({
          where: { commentId: comment.id },
          _sum: { value: true },
        });
        const score = total._sum.value ?? 0;
        await tx.comment.updateMany({
          where: { id: comment.id, score: { not: score } },
          data: { score },
        });
      }
    },
    { timeout: 30000 },
  );
  return Object.fromEntries(
    Object.entries(data).map(([name, rows]) => [name, rows.length]),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let clients;
  try {
    parseArgs();
    const config = await databaseConfig();
    clients = await databaseClients(config);
    const counts = await seedDatabases(clients);
    console.log('Demo seed ready:', counts);
    console.log(`Local demo login: test@test.com / ${demoPassword}`);
    console.log(
      'Fictional development accounts only. Do not expose demo data/passwords publicly.',
    );
  } catch (error) {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (clients) {
      await clients.auth.$disconnect();
      await clients.social.$disconnect();
    }
  }
}
