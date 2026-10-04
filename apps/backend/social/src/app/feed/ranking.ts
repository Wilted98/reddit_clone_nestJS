import { Prisma } from '@prisma-clients/roorin-social';

/**
 *
 * https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
 * Gravity-decay "hot" ranking, the Hacker News shape
 *
 *     rank = score / (ageInHours + 2) ^ GRAVITY
 *
 * A post's rank halves roughly every few hours unless it keeps earning votes,
 * which is what stops a single popular post from owning the front page for a
 * week. Reddit's own formula is log-scaled and time-anchored; this one is
 * easier to reason about and indistinguishable at our size.
 *
 * Raw SQL because the ORDER BY is a computed expression - Prisma's query
 * builder has no way to express it.
 */
const GRAVITY = 1.8;

export function hotFeedQuery(
  communityId: string | undefined,
  limit: number,
  offset: number,
): Prisma.Sql {
  const communityFilter = communityId
    ? Prisma.sql`AND "communityId" = ${communityId}`
    : Prisma.empty;

  return Prisma.sql`
    SELECT *
    FROM "Post"
    WHERE "deletedAt" IS NULL
    ${communityFilter}
    ORDER BY
      "score" / POWER(
        EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600 + 2,
        ${GRAVITY}
      ) DESC,
      "createdAt" DESC,
      "id" ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}
