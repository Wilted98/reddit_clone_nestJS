import { profileHref, profilePatch, profileSchema } from './profile';

describe('profile inputs and routes', () => {
  it('encodes usernames and preserves the activity tab in the URL', () => {
    expect(profileHref('name/with spaces')).toBe('/u/name%2Fwith%20spaces');
    expect(profileHref('alex', 'comments')).toBe('/u/alex?tab=comments');
  });
  it('accepts empty fields and exactly 300 bio characters', () => {
    expect(
      profileSchema.safeParse({ bio: 'x'.repeat(300), avatarUrl: '' }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ bio: 'x'.repeat(301), avatarUrl: '' }).success,
    ).toBe(false);
  });
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'ftp://example.com/avatar',
    'https://user:secret@example.com/avatar',
    '/avatar.png',
    'http://localhost/avatar',
  ])('rejects unsafe or nonpublic avatar URL %s', (avatarUrl) => {
    expect(profileSchema.safeParse({ bio: '', avatarUrl }).success).toBe(false);
  });
  it('normalizes surrounding avatar whitespace and leaves bio text intact', () => {
    expect(
      profileSchema.parse({
        bio: '  hello\nworld  ',
        avatarUrl: ' https://example.com/avatar.png ',
      }),
    ).toEqual({
      bio: '  hello\nworld  ',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });
  it('omits unchanged fields and clears avatars using explicit null', () => {
    const account = {
      bio: 'Hello',
      avatarUrl: 'https://example.com/avatar.png',
    };
    expect(
      profilePatch({ bio: 'Hello', avatarUrl: account.avatarUrl }, account),
    ).toEqual({});
    expect(
      profilePatch({ bio: '', avatarUrl: account.avatarUrl }, account),
    ).toEqual({ bio: '' });
    expect(profilePatch({ bio: 'Hello', avatarUrl: '' }, account)).toEqual({
      avatarUrl: null,
    });
    expect(
      profilePatch({ bio: '', avatarUrl: '' }, { bio: null, avatarUrl: null }),
    ).toEqual({});
  });
});
