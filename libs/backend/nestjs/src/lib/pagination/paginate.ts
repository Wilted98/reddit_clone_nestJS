/**
 * Turns a Prisma `findMany` into a cursor page.
 *
 * We over-fetch by one row: if the extra row comes back there is at least one
 * more page, and the last kept row's id becomes the next cursor. `skip: 1` is
 * what makes the cursor exclusive - without it the cursor row repeats as the
 * first item of every page.
 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorQueryArgs {
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export function cursorArgs(
  cursor: string | undefined,
  limit: number,
): CursorQueryArgs {
  return {
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  };
}

export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}
