export function safeExternalLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return { href: url.href, host: url.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
}

export function badgeTone(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash + character.charCodeAt(0)) % 4;
  return ['coral', 'cyan', 'lilac', 'gold'][hash];
}
