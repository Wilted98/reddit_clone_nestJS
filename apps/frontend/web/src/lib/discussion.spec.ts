import {
  commentSchema,
  postInput,
  postSchema,
  toggledVote,
} from './discussion';

const fields = {
  communitySlug: 'craft',
  title: 'A new project',
  kind: 'text' as const,
  body: 'Some thoughts.',
  url: 'https://example.com',
};

describe('discussion inputs', () => {
  it('sends only the selected text or link type and trims content', () => {
    expect(
      postInput(
        postSchema.parse({
          ...fields,
          title: '  A new project  ',
          body: '  Some thoughts.  ',
        }),
      ),
    ).toEqual({
      communitySlug: 'craft',
      title: 'A new project',
      body: 'Some thoughts.',
    });
    expect(
      postInput(
        postSchema.parse({
          ...fields,
          kind: 'link',
          body: '',
          url: '  https://example.com  ',
        }),
      ),
    ).toEqual({
      communitySlug: 'craft',
      title: 'A new project',
      url: 'https://example.com',
    });
  });
  it.each(['', '  ', 'a'.repeat(40001)])(
    'rejects invalid text bodies',
    (body) => {
      expect(postSchema.safeParse({ ...fields, body }).success).toBe(false);
    },
  );
  it.each([
    'javascript:alert(1)',
    'file:///tmp/test',
    'https://name:secret@example.com',
    'not a url',
    'https://localhost',
  ])('rejects unsafe or nonpublic post URLs', (url) => {
    expect(postSchema.safeParse({ ...fields, kind: 'link', url }).success).toBe(
      false,
    );
  });
  it('bounds titles, community selection, and comment text', () => {
    expect(
      postSchema.safeParse({ ...fields, title: 'a'.repeat(301) }).success,
    ).toBe(false);
    expect(postSchema.safeParse({ ...fields, title: 'ab' }).success).toBe(
      false,
    );
    expect(
      postSchema.safeParse({ ...fields, communitySlug: ' ' }).success,
    ).toBe(false);
    expect(commentSchema.safeParse({ body: ' ' }).success).toBe(false);
    expect(commentSchema.safeParse({ body: 'a'.repeat(10001) }).success).toBe(
      false,
    );
    expect(commentSchema.parse({ body: '  Hello  ' })).toEqual({
      body: 'Hello',
    });
  });
  it('toggles votes off and switches direction using backend values', () => {
    expect(toggledVote(1, 1)).toBe(0);
    expect(toggledVote(-1, -1)).toBe(0);
    expect(toggledVote(1, -1)).toBe(-1);
    expect(toggledVote(0, 1)).toBe(1);
  });
});
