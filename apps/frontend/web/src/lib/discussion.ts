import { z } from 'zod';
import { safeExternalLink } from './content';

export const COMMENT_PAGE_SIZE = 20;

export const postSchema = z
  .object({
    communitySlug: z.string().trim().min(1, 'Choose a community.'),
    title: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(300, 'Use at most 300 characters.'),
    kind: z.enum(['text', 'link']),
    body: z.string(),
    url: z.string(),
  })
  .superRefine((input, context) => {
    if (input.kind === 'text') {
      const body = input.body.trim();
      if (!body || body.length > 40000)
        context.addIssue({
          code: 'custom',
          path: ['body'],
          message: 'Use between 1 and 40,000 characters.',
        });
    } else {
      const link = safeExternalLink(input.url.trim());
      if (!link || !new URL(link.href).hostname.includes('.'))
        context.addIssue({
          code: 'custom',
          path: ['url'],
          message: 'Enter a public HTTP or HTTPS URL without credentials.',
        });
    }
  });

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment first.')
    .max(10000, 'Use at most 10,000 characters.'),
});

export type PostFields = z.infer<typeof postSchema>;
export type CommentFields = z.infer<typeof commentSchema>;

export function postInput(input: PostFields) {
  return {
    communitySlug: input.communitySlug,
    title: input.title,
    ...(input.kind === 'text'
      ? { body: input.body.trim() }
      : { url: input.url.trim() }),
  };
}

export function toggledVote(current: number, selected: -1 | 1) {
  return current === selected ? 0 : selected;
}
