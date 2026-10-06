import { z } from 'zod';
import type {
  DiscussionCommentFragment,
  DiscussionPostFragment,
} from '../graphql/generated/social';
import { commentSchema, postSchema } from './discussion';

export type EditableContent =
  | { kind: 'post'; item: DiscussionPostFragment }
  | { kind: 'comment'; item: DiscussionCommentFragment };

export const contentEditSchema = z
  .object({
    kind: z.enum(['text', 'link', 'comment']),
    title: z.string(),
    body: z.string(),
    url: z.string(),
  })
  .superRefine((values, context) => {
    const result =
      values.kind === 'comment'
        ? commentSchema.safeParse(values)
        : postSchema.safeParse({ ...values, communitySlug: 'unchanged' });
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
  });

export type ContentEditFields = z.infer<typeof contentEditSchema>;

export function contentEditDefaults(
  content: EditableContent,
): ContentEditFields {
  return {
    kind:
      content.kind === 'comment'
        ? 'comment'
        : content.item.url === null
          ? 'text'
          : 'link',
    title: content.kind === 'post' ? content.item.title : '',
    body: content.item.body ?? '',
    url: content.kind === 'post' ? (content.item.url ?? '') : '',
  };
}

export function postEditPatch(
  values: ContentEditFields,
  post: DiscussionPostFragment,
) {
  const title = values.title.trim();
  const body = values.body.trim();
  const url = values.url.trim();
  return {
    id: post.id,
    ...(title !== post.title && { title }),
    ...(post.url === null
      ? body !== post.body && { body }
      : url !== post.url && { url }),
  };
}
