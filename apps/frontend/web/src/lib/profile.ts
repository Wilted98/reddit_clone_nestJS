import { z } from 'zod';
import { safeExternalLink } from './content';

export const ACTIVITY_PAGE_SIZE = 20;
export type ActivityTab = 'posts' | 'comments';

export function profileHref(username: string, tab: ActivityTab = 'posts') {
  return `/u/${encodeURIComponent(username)}${tab === 'comments' ? '?tab=comments' : ''}`;
}

export const profileSchema = z.object({
  bio: z.string().max(300, 'Use at most 300 characters.'),
  avatarUrl: z
    .string()
    .trim()
    .max(2048, 'Use at most 2,048 characters.')
    .refine((value) => {
      if (!value) return true;
      const link = safeExternalLink(value);
      return !!link && new URL(link.href).hostname.includes('.');
    }, 'Enter a public HTTP or HTTPS image URL without credentials.'),
});

export type ProfileFields = z.infer<typeof profileSchema>;

export function profilePatch(
  values: ProfileFields,
  account: { bio?: string | null; avatarUrl?: string | null },
) {
  return {
    ...(values.bio !== (account.bio ?? '') ? { bio: values.bio } : {}),
    ...(values.avatarUrl !== (account.avatarUrl ?? '')
      ? { avatarUrl: values.avatarUrl || null }
      : {}),
  };
}
