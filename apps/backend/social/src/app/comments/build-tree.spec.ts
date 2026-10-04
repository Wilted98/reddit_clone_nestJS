import { Comment } from '@prisma-clients/roorin-social';
import { buildTree } from './build-tree';

function comment(id: string, parentId: string | null = null): Comment {
  return {
    id,
    parentId,
    postId: 'post-1',
    authorId: 'author-1',
    authorUsername: 'author',
    body: id,
    score: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('buildTree', () => {
  it('returns an empty tree for no rows', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('links children even when they precede their parent in the flat list', () => {
    const tree = buildTree([comment('child', 'root'), comment('root')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].replies[0].id).toBe('child');
  });

  it('preserves multiple levels and sibling input order', () => {
    const tree = buildTree([
      comment('root'),
      comment('first', 'root'),
      comment('second', 'root'),
      comment('nested', 'first'),
    ]);
    expect(tree[0].replies.map((row) => row.id)).toEqual(['first', 'second']);
    expect(tree[0].replies[0].replies[0].id).toBe('nested');
  });

  it('promotes an orphan to a root without losing its descendants', () => {
    const tree = buildTree([
      comment('orphan', 'missing'),
      comment('child', 'orphan'),
    ]);
    expect(tree[0].id).toBe('orphan');
    expect(tree[0].replies[0].id).toBe('child');
  });

  it('keeps deleted parents so their replies remain reachable', () => {
    const tree = buildTree([
      { ...comment('root'), deletedAt: new Date(), body: '[deleted]' },
      comment('reply', 'root'),
    ]);
    expect(tree[0].body).toBe('[deleted]');
    expect(tree[0].replies[0].id).toBe('reply');
  });

  it('does not mutate the database rows', () => {
    const rows = [comment('root'), comment('child', 'root')];
    const original = structuredClone(rows);
    buildTree(rows);
    expect(rows).toEqual(original);
    expect(rows[0]).not.toHaveProperty('replies');
  });
});
