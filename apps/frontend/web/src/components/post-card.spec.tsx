import { fireEvent, render, screen } from '@testing-library/react';
import { PostCard } from './post-card';
import type { BrowseFeedQuery } from '../graphql/generated/social';

const post: BrowseFeedQuery['feed']['items'][number] = {
  __typename: 'Post',
  id: 'one',
  title: 'A conversation',
  authorUsername: 'alex',
  authorAvatarUrl: null,
  body: '<img src=x onerror=alert(1)>',
  url: 'javascript:alert(1)',
  communityId: 'craft',
  communitySlug: 'craft',
  score: -3,
  commentCount: 0,
  createdAt: '2026-10-05T00:00:00Z',
  editedAt: null,
};

describe('post cards', () => {
  it('shows a current avatar without replacing the author name and falls back on errors', () => {
    render(
      <PostCard
        post={{ ...post, authorAvatarUrl: 'https://example.com/avatar.png' }}
      />,
    );
    const avatar = screen.getByRole('img', { name: "alex's avatar" });
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(avatar).toHaveAttribute('loading', 'lazy');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('link', { name: 'u/alex' })).toHaveAttribute(
      'href',
      '/u/alex',
    );
    fireEvent.error(avatar);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('rejects unsafe avatar URLs', () => {
    render(
      <PostCard post={{ ...post, authorAvatarUrl: 'javascript:alert(1)' }} />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
  it('renders user text as text and rejects executable links', () => {
    render(<PostCard post={post} />);
    expect(screen.getByText(post.body ?? '')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'A conversation' }),
    ).toHaveAttribute('href', '/posts/one');
    expect(screen.getByRole('link', { name: '0 comments' })).toHaveAttribute(
      'href',
      '/posts/one#comments',
    );
    expect(screen.getByLabelText('-3 score')).toBeInTheDocument();
    expect(screen.getByLabelText('0 comments')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'r/craft' })).toHaveAttribute(
      'href',
      '/r/craft',
    );
    expect(screen.getByRole('link', { name: 'r/craft' })).toHaveClass(
      'community-link',
    );
    expect(screen.getByRole('link', { name: 'u/alex' })).toHaveAttribute(
      'href',
      '/u/alex',
    );
    expect(
      screen.getByRole('link', { name: 'Sign in to upvote post' }),
    ).toHaveAttribute('href', '/account');
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
    const toggle = screen.getByRole('button', { name: 'Read full post' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(`${body.slice(0, 320)}...`)).toBeInTheDocument();
    expect(document.querySelectorAll('.post-body')).toHaveLength(1);
    fireEvent.click(toggle);
    expect(screen.getByText(body.trim())).toBeInTheDocument();
    expect(
      screen.queryByText(`${body.slice(0, 320)}...`),
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('.post-body')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(toggle).toHaveAttribute('aria-controls', 'post-body-one');
    fireEvent.click(toggle);
    expect(screen.getByText(`${body.slice(0, 320)}...`)).toBeInTheDocument();
  });
  it('does not truncate a 320-character body and resets expansion when content changes', () => {
    const { rerender } = render(
      <PostCard post={{ ...post, body: 'a'.repeat(320) }} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Read full post' }),
    ).not.toBeInTheDocument();
    rerender(<PostCard post={{ ...post, body: 'b'.repeat(321) }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read full post' }));
    rerender(<PostCard post={{ ...post, body: 'c'.repeat(321) }} />);
    expect(
      screen.getByRole('button', { name: 'Read full post' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
  it('renders the full post with a page heading in a discussion', () => {
    const body = 'Full text. '.repeat(100);
    render(<PostCard detail post={{ ...post, body }} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      post.title,
    );
    expect(screen.getByText(body.trim())).toBeInTheDocument();
    expect(screen.queryByText('Read full post')).not.toBeInTheDocument();
  });
});
