import { Comment as PrismaComment } from '@prisma-clients/roorin-social';
import { Comment } from './models/comment.model';

/**
 * Turns a flat, post-scoped comment list into a reply tree in one pass.
 *
 * Deliberately done in application code rather than with a recursive CTE or a
 * closure table: a post has hundreds of comments, not millions, so one indexed
 * SELECT plus an O(n) grouping beats the complexity of maintaining a
 * materialized tree. Revisit when a single post routinely clears a few
 * thousand comments - at that point paginate replies per parent instead.
 */
export function buildTree(rows: PrismaComment[]): Comment[] {
  const nodes = new Map<string, Comment>();
  const roots: Comment[] = [];

  for (const row of rows) {
    nodes.set(row.id, { ...row, replies: [] } as Comment);
  }

  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    if (row.parentId) {
      // A parent can be missing if it was hard-deleted; treat the orphan as a
      // root rather than dropping the subtree on the floor.
      const parent = nodes.get(row.parentId);
      if (parent) {
        parent.replies.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}
