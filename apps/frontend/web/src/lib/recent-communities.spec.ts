import {
  parseRecent,
  readRecent,
  recentKey,
  visitCommunity,
} from './recent-communities';

describe('recent communities', () => {
  beforeEach(() => localStorage.clear());
  it('keeps the last three distinct visits, newest first, and refreshes names', () => {
    const key = recentKey('alex');
    for (const slug of ['one', 'two', 'three', 'four', 'two']) {
      visitCommunity(key, { slug, name: `Community ${slug}` });
    }
    expect(parseRecent(readRecent(key)).map((item) => item.slug)).toEqual([
      'two',
      'four',
      'three',
    ]);
    visitCommunity(key, { slug: 'two', name: 'Renamed' });
    expect(parseRecent(readRecent(key))[0].name).toBe('Renamed');
  });
  it('separates guest and account histories', () => {
    visitCommunity(recentKey('alex'), { slug: 'craft', name: 'Craft' });
    expect(parseRecent(readRecent(recentKey()))).toEqual([]);
    expect(parseRecent(readRecent(recentKey('sam')))).toEqual([]);
  });
  it.each([
    'not-json',
    '[{"slug":"javascript:bad","name":"Bad"}]',
    '[1]',
    '{"items":[]}',
  ])('ignores corrupt storage %s', (input) => {
    expect(parseRecent(input)).toEqual([]);
  });
  it('strips unrelated fields and ignores invalid visits', () => {
    expect(
      parseRecent('[{"slug":"craft","name":"Craft","email":"private"}]'),
    ).toEqual([{ slug: 'craft', name: 'Craft' }]);
    visitCommunity(recentKey(), { slug: '../account', name: 'Bad' });
    expect(readRecent(recentKey())).toBeNull();
  });
  it('still works for this session when storage is blocked', () => {
    const get = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const set = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    visitCommunity(recentKey('blocked'), { slug: 'craft', name: 'Craft' });
    expect(parseRecent(readRecent(recentKey('blocked')))).toEqual([
      { slug: 'craft', name: 'Craft' },
    ]);
    get.mockRestore();
    set.mockRestore();
  });
});
