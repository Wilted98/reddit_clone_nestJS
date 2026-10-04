import { hotFeedQuery } from './ranking';

describe('hotFeedQuery', () => {
  it('ranks live posts by gravity decay with deterministic ties', () => {
    const query = hotFeedQuery(undefined, 26, 0);
    expect(query.text).toContain('WHERE "deletedAt" IS NULL');
    expect(query.text).toContain('POWER(');
    expect(query.text).toContain('NOW() - "createdAt"');
    expect(query.text).toMatch(/"createdAt" DESC,\s*"id" ASC/);
    expect(query.values).toEqual([1.8, 26, 0]);
    expect(query.text).not.toContain('AND "communityId"');
  });

  it('binds community IDs and pagination as parameters, not SQL text', () => {
    const communityId = "community'; DROP TABLE Post; --";
    const query = hotFeedQuery(communityId, 11, 20);
    expect(query.text).not.toContain(communityId);
    expect(query.text).toContain('AND "communityId" = $1');
    expect(query.values).toEqual([communityId, 1.8, 11, 20]);
  });
});
