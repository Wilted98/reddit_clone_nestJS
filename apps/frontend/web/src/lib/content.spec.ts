import {
  badgeTone,
  formatCount,
  formatDate,
  safeExternalLink,
} from './content';

describe('public content rendering', () => {
  it.each([
    null,
    '',
    'bad url',
    'javascript:alert(1)',
    'data:text/html,hello',
    'ftp://example.com',
    '//example.com',
    'https://private:secret@example.com',
  ])('rejects unsafe or unsupported links: %s', (url) => {
    expect(safeExternalLink(url)).toBeNull();
  });
  it('accepts absolute HTTP/S URLs and uses parsed hostnames', () => {
    expect(safeExternalLink('https://www.example.com/article')).toEqual({
      href: 'https://www.example.com/article',
      host: 'example.com',
    });
    expect(safeExternalLink('http://example.com')).not.toBeNull();
  });
  it('formats zero and negative scores and compact counts', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(-3)).toBe('-3');
    expect(formatCount(1200)).toBe('1.2K');
  });
  it('uses UTC dates and tolerates malformed dates', () => {
    expect(formatDate('2026-10-05T23:59:00Z')).toBe('Oct 5, 2026');
    expect(formatDate('bad')).toBe('Unknown date');
  });
  it('gives the same identifier a stable badge tone', () => {
    expect(badgeTone('craft')).toBe(badgeTone('craft'));
    expect(['coral', 'cyan', 'lilac', 'gold']).toContain(badgeTone('craft'));
  });
});
