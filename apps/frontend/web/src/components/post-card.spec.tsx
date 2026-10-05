import { render, screen } from '@testing-library/react';
import { PostCard } from './post-card';
import type { BrowseFeedQuery } from '../graphql/generated/social';

const post: BrowseFeedQuery['feed']['items'][number] = {
  __typename: 'Post',
  id: 'one',
  title: 'A conversation',
  authorUsername: 'alex',
  body: '<img src=x onerror=alert(1)>',
  url: 'javascript:alert(1)',
  communityId: 'craft',
  score: -3,
  commentCount: 0,
  createdAt: '2026-10-05T00:00:00Z',
  editedAt: null,
};

describe('post cards', () => {
  it('renders user text as text and rejects executable links', () => {
    render(<PostCard post={post} />);
    expect(screen.getByText(post.body ?? '')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByLabelText('-3 score')).toBeInTheDocument();
    expect(screen.getByLabelText('0 comments')).toBeInTheDocument();
  });
  it('marks external links and edited content', () => {
    render(
      <PostCard
        post={{
          ...post,
          body: null,
          url: 'https://example.com/story',
          editedAt: '2026-10-06T00:00:00Z',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Edited')).toHaveAttribute(
      'title',
      'Edited Oct 6, 2026',
    );
  });
  it('keeps the full body available for long text posts', () => {
    const body = 'A long discussion. '.repeat(30);
    render(<PostCard post={{ ...post, body }} />);
    expect(
      screen.getByText('Read full post').closest('details'),
    ).toHaveTextContent(body.trim());
  });
});
