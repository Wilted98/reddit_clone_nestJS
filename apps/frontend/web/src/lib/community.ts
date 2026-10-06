import { z } from 'zod';
import type { CreateCommunityInput } from '../graphql/generated/social';

export const communitySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3, 'Use at least 3 characters.')
    .max(24, 'Use at most 24 characters.')
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, or underscores.'),
  name: z
    .string()
    .trim()
    .min(3, 'Use at least 3 characters.')
    .max(60, 'Use at most 60 characters.'),
  description: z.string().trim().max(500, 'Use at most 500 characters.'),
});

export type CommunityFields = z.infer<typeof communitySchema>;

export function communityInput(fields: CommunityFields): CreateCommunityInput {
  return {
    slug: fields.slug,
    name: fields.name,
    ...(fields.description ? { description: fields.description } : {}),
  };
}
