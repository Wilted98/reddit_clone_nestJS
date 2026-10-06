import { fireEvent, render, screen } from '@testing-library/react';
import { ProfileAvatar } from './profile-avatar';

describe('profile avatars', () => {
  it('falls back to initials for absent or executable URLs', () => {
    render(<ProfileAvatar username="alex" avatarUrl="javascript:alert(1)" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
  it('loads directly without a referrer and falls back when an image fails', () => {
    const { rerender } = render(
      <ProfileAvatar username="alex" avatarUrl="https://example.com/one.png" />,
    );
    const avatar = screen.getByRole('img');
    expect(avatar).toHaveAttribute('src', 'https://example.com/one.png');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.error(avatar);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(
      <ProfileAvatar username="alex" avatarUrl="https://example.com/two.png" />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/two.png',
    );
  });
});
