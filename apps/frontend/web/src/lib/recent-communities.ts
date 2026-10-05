import { z } from 'zod';

const recentSchema = z
  .array(
    z.object({
      slug: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_]+$/),
      name: z.string().min(1).max(100),
    }),
  )
  .max(3);

export type RecentCommunity = z.infer<typeof recentSchema>[number];
export const RECENT_COMMUNITIES_EVENT = 'roorin:recent-communities';
const fallback = new Map<string, string>();

export function recentKey(accountId?: string) {
  return `roorin:recent-communities:${accountId ?? 'guest'}`;
}

export function parseRecent(value: string | null): RecentCommunity[] {
  try {
    const parsed = recentSchema.safeParse(JSON.parse(value ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function readRecent(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return fallback.get(key) ?? null;
  }
}

export function visitCommunity(key: string, community: RecentCommunity) {
  const next = parseRecent(
    JSON.stringify(
      [
        community,
        ...parseRecent(readRecent(key)).filter(
          (item) => item.slug !== community.slug,
        ),
      ].slice(0, 3),
    ),
  );
  if (!next.length) return;
  const value = JSON.stringify(next);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    fallback.set(key, value);
  }
  window.dispatchEvent(new Event(RECENT_COMMUNITIES_EVENT));
}
