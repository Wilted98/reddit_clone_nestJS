import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import type {
  DiscussionPostFragment,
  DiscussionCommentFragment,
} from '../graphql/generated/social';
import { ContentActions } from './content-actions';

const mutate = jest.fn();
const refresh = jest.fn();
let account: { id: string } | null = { id: 'owner' };
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mutate] }));
jest.mock('./session-provider', () => ({
  useSession: () => ({ account, loading: false, refresh }),
}));
const post: DiscussionPostFragment = {
  id: 'one',
  title: 'Original title',
  body: 'Original body',
  url: null,
  authorId: 'owner',
  authorUsername: 'alex',
  authorAvatarUrl: null,
  communityId: 'craft',
  communitySlug: 'craft',
  createdAt: '2026-10-06T00:00:00Z',
  editedAt: null,
  deletedAt: null,
  score: 3,
  commentCount: 2,
};
const comment: DiscussionCommentFragment = {
  id: 'root',
  postId: 'one',
  parentId: null,
  authorId: 'owner',
  authorUsername: 'alex',
  body: 'Original comment',
  createdAt: post.createdAt,
  editedAt: null,
  deletedAt: null,
  score: 1,
  hasReplies: true,
};
describe('author content actions', () => {
  beforeAll(() => {
    // jsdom lacks native modal dialog methods; browser tests cover focus trapping.
    HTMLDialogElement.prototype.showModal = jest.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = jest.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    account = { id: 'owner' };
    refresh.mockResolvedValue(undefined);
  });
  it('keeps commands hidden until options open and restores focus on Escape', () => {
    render(<ContentActions kind="post" item={post} onChanged={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Post options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Edit post' }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Edit post' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(
      screen.queryByRole('group', { name: 'Post options' }),
    ).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
  it('dismisses options when clicking outside, tabbing away or toggling the trigger', () => {
    render(<ContentActions kind="post" item={post} onChanged={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Post options' });
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.blur(screen.getByRole('button', { name: 'Edit post' }), {
      relatedTarget: document.body,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(mutate).not.toHaveBeenCalled();
  });
  it('hides actions for guests, other authors and deleted targets', () => {
    const props = { kind: 'post' as const, item: post, onChanged: jest.fn() };
    account = null;
    const { rerender } = render(<ContentActions {...props} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    account = { id: 'someone-else' };
    rerender(<ContentActions {...props} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    account = { id: 'owner' };
    rerender(
      <ContentActions
        {...props}
        item={{ ...post, deletedAt: post.createdAt }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('validates and sends only changed post fields', async () => {
    const onChanged = jest.fn();
    mutate.mockResolvedValue({
      data: {
        updatePost: {
          ...post,
          title: 'Updated title',
          editedAt: post.createdAt,
        },
      },
    });
    render(<ContentActions kind="post" item={post} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'ab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Use at least 3 characters.'),
    ).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: ' Updated title ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith({
      variables: { input: { id: 'one', title: 'Updated title' } },
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
  it('edits link URLs without a post type switch or body payload', async () => {
    const link = { ...post, body: null, url: 'https://example.com' };
    mutate.mockResolvedValue({
      data: { updatePost: { ...link, url: 'https://example.com/new' } },
    });
    render(<ContentActions kind="post" item={link} onChanged={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    expect(screen.queryByLabelText('Post body')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com/new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith({
      variables: { input: { id: 'one', url: 'https://example.com/new' } },
    });
  });
  it('serializes comment saves and retains a failed draft for explicit retry', async () => {
    let reject!: (error: Error) => void;
    mutate.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const onChanged = jest.fn();
    render(
      <ContentActions kind="comment" item={comment} onChanged={onChanged} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: ' New body ' },
    });
    const form = screen.getByRole('form', { name: 'Edit comment' });
    fireEvent.submit(form);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    expect(screen.getByLabelText('Comment')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => {
      reject(new Error('Offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach Roorin',
    );
    expect(screen.getByLabelText('Comment')).toHaveValue(' New body ');
    expect(mutate).toHaveBeenCalledTimes(1);
    mutate.mockResolvedValue({
      data: { updateComment: { ...comment, body: 'New body' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenLastCalledWith({
      variables: { input: { id: 'root', body: 'New body' } },
    });
  });
  it('requires explicit deletion confirmation and never changes content on cancellation', async () => {
    const onChanged = jest.fn();
    mutate.mockResolvedValue({
      data: {
        deleteComment: {
          ...comment,
          body: '[deleted]',
          deletedAt: post.createdAt,
        },
      },
    });
    render(
      <ContentActions kind="comment" item={comment} onChanged={onChanged} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Delete comment?' }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChanged).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
    expect(
      screen.getByRole('button', { name: 'Comment options' }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm delete comment' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith({ variables: { id: 'root' } });
  });
  it('cancels a deletion modal with Escape without issuing a mutation', () => {
    render(<ContentActions kind="post" item={post} onChanged={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('button', { name: 'Post options' })).toHaveFocus();
    expect(mutate).not.toHaveBeenCalled();
  });
  it('retains a pending deletion modal through Escape and keeps errors inside it', async () => {
    let reject!: (error: Error) => void;
    mutate.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<ContentActions kind="post" item={post} onChanged={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm delete post' }),
    );
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => {
      reject(new Error('Offline'));
    });
    expect(dialog).toContainElement(screen.getByRole('alert'));
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
  it('ignores a late save response after logout', async () => {
    let resolve!: (value: unknown) => void;
    mutate.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onChanged = jest.fn();
    const { rerender } = render(
      <ContentActions kind="post" item={post} onChanged={onChanged} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Late title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    account = null;
    rerender(<ContentActions kind="post" item={post} onChanged={onChanged} />);
    await act(async () => {
      resolve({ data: { updatePost: { ...post, title: 'Late title' } } });
    });
    expect(onChanged).not.toHaveBeenCalled();
  });
  it('rechecks a permission failure without retrying or discarding the draft', async () => {
    mutate.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Forbidden',
            extensions: {
              code: 'FORBIDDEN',
              originalError: {
                statusCode: 403,
                message: 'You can only edit your own comments.',
              },
            },
          },
        ],
      }),
    );
    render(
      <ContentActions kind="comment" item={comment} onChanged={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Keep my draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Comment')).toHaveValue('Keep my draft');
    expect(mutate).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched mutation response', async () => {
    mutate.mockResolvedValue({
      data: { updatePost: { ...post, id: 'other' } },
    });
    const onChanged = jest.fn();
    render(<ContentActions kind="post" item={post} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
