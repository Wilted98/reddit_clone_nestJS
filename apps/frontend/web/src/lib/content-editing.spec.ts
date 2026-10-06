import {
  contentEditDefaults,
  contentEditSchema,
  postEditPatch,
} from './content-editing';
import type { DiscussionPostFragment } from '../graphql/generated/social';

const post: DiscussionPostFragment = {
  id: 'post',
  title: 'Original title',
  body: 'Original body',
  url: null,
  authorId: 'owner',
  authorUsername: 'alex',
  authorAvatarUrl: null,
  communityId: 'craft',
  communitySlug: 'craft',
  createdAt: '2026-10-06T00:00:00Z',
  editedAt: null,
  deletedAt: null,
  score: 3,
  commentCount: 2,
};

describe('content editing contracts', () => {
  it('patches only changed fields of the original text/link type', () => {
    const values = contentEditDefaults({ kind: 'post', item: post });
    expect(postEditPatch(values, post)).toEqual({ id: post.id });
    expect(
      postEditPatch(
        { ...values, title: ' New title ', url: 'https://ignored.example' },
        post,
      ),
    ).toEqual({ id: post.id, title: 'New title' });
    const link = { ...post, body: null, url: 'https://example.com' };
    expect(contentEditDefaults({ kind: 'post', item: link }).kind).toBe('link');
    expect(
      postEditPatch(
        { ...values, url: ' https://example.com/new ', body: 'ignored' },
        link,
      ),
    ).toEqual({ id: post.id, url: 'https://example.com/new' });
  });
  it('reuses posting bounds and rejects unsafe edited URLs', () => {
    const values = contentEditDefaults({ kind: 'post', item: post });
    for (const invalid of [
      { title: 'ab' },
      { title: 'x'.repeat(301) },
      { body: ' ' },
      { body: 'x'.repeat(40001) },
    ])
      expect(
        contentEditSchema.safeParse({ ...values, ...invalid }).success,
      ).toBe(false);
    for (const url of [
      'javascript:alert(1)',
      'https://user:pass@example.com',
      'https://localhost',
    ])
      expect(
        contentEditSchema.safeParse({ ...values, kind: 'link', url }).success,
      ).toBe(false);
  });
  it('bounds edited comments independently of post text', () => {
    const values = { kind: 'comment', title: '', body: 'Hello', url: '' };
    expect(contentEditSchema.safeParse(values).success).toBe(true);
    for (const body of [' ', 'x'.repeat(10001)])
      expect(contentEditSchema.safeParse({ ...values, body }).success).toBe(
        false,
      );
  });
});
