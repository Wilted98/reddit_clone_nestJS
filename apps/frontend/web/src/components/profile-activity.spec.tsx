import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import type { EditableContent } from '../lib/content-editing';
import type {
  DiscussionPostFragment,
  DiscussionCommentFragment,
} from '../graphql/generated/social';
import { ProfileActivity } from './profile-activity';

const post: DiscussionPostFragment = {
  id: 'one',
  title: 'Original post',
  body: 'Original body',
  url: null,
  authorId: 'owner',
  authorUsername: 'alex',
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
const postQuery = {
  data: { postsByAuthor: { items: [post], hasMore: true, nextCursor: 'one' } },
  loading: false,
  error: undefined,
  refetch: jest.fn(),
  fetchMore: jest.fn(),
};
const commentQuery = {
  data: {
    commentsByAuthor: { items: [comment], hasMore: true, nextCursor: 'root' },
  },
  loading: false,
  error: undefined,
  refetch: jest.fn(),
  fetchMore: jest.fn(),
};
jest.mock('@apollo/client/react', () => ({
  useQuery: (doc: { definitions: { name?: { value: string } }[] }) =>
    doc.definitions[0].name?.value === 'AuthorPosts' ? postQuery : commentQuery,
}));
jest.mock('./voting', () => ({
  VoteGroup: ({ children }: { children: ReactNode }) => children,
  VoteControls: ({ score }: { score: number }) => (
    <span aria-label={`${score} score`}>{score}</span>
  ),
}));
jest.mock('./content-actions', () => ({
  ContentActions: (
    props: EditableContent & {
      onChanged: (
        item: DiscussionPostFragment | DiscussionCommentFragment,
      ) => void;
    },
  ) => (
    <>
      <button
        onClick={() =>
          props.onChanged({
            ...props.item,
            ...(props.kind === 'post'
              ? { title: 'Updated post' }
              : { body: 'Updated comment' }),
            editedAt: post.createdAt,
            score: 999,
          })
        }
      >
        Update {props.kind}
      </button>
      <button
        onClick={() =>
          props.onChanged({ ...props.item, deletedAt: post.createdAt })
        }
      >
        Remove {props.kind}
      </button>
    </>
  ),
}));

describe('profile activity content changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postQuery.data = {
      postsByAuthor: { items: [post], hasMore: true, nextCursor: 'one' },
    };
    commentQuery.data = {
      commentsByAuthor: { items: [comment], hasMore: true, nextCursor: 'root' },
    };
    postQuery.fetchMore.mockResolvedValue({
      data: { postsByAuthor: { nextCursor: 'next' } },
    });
    commentQuery.fetchMore.mockResolvedValue({
      data: { commentsByAuthor: { nextCursor: 'next' } },
    });
    postQuery.refetch.mockResolvedValue(undefined);
    commentQuery.refetch.mockResolvedValue(undefined);
  });
  it('applies post edits without replacing scores, refetching or losing a deleted anchor', async () => {
    render(<ProfileActivity authorId="owner" kind="posts" />);
    fireEvent.click(screen.getByRole('button', { name: 'Update post' }));
    expect(
      screen.getByRole('heading', { name: 'Updated post' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('3 score')).toBeInTheDocument();
    expect(postQuery.refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove post' }));
    expect(screen.queryByTestId('post-one')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No posts on this page' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more posts' }));
    await waitFor(() => expect(postQuery.fetchMore).toHaveBeenCalledTimes(1));
    expect(postQuery.fetchMore.mock.calls[0][0].variables).toEqual({
      cursor: 'one',
    });
  });
  it('applies comment edits and deletions independently of its sibling cursor', async () => {
    render(<ProfileActivity authorId="owner" kind="comments" />);
    fireEvent.click(screen.getByRole('button', { name: 'Update comment' }));
    expect(screen.getByText('Updated comment')).toBeInTheDocument();
    expect(screen.getByLabelText('1 score')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }));
    expect(
      screen.queryByTestId('activity-comment-root'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more comments' }));
    await waitFor(() =>
      expect(commentQuery.fetchMore).toHaveBeenCalledTimes(1),
    );
    expect(commentQuery.fetchMore.mock.calls[0][0].variables).toEqual({
      cursor: 'root',
    });
  });
  it('does not erase a confirmed edit when an earlier refresh finishes late', async () => {
    let resolve!: () => void;
    postQuery.refetch.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    render(<ProfileActivity authorId="owner" kind="posts" />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update post' }));
    await act(async () => {
      resolve();
    });
    expect(
      screen.getByRole('heading', { name: 'Updated post' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Original post' }),
      ).toBeInTheDocument(),
    );
  });
});
