import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ProfileSettingsForm } from './profile-settings-form';

const updateProfile = jest.fn();
jest.mock('./session-provider', () => ({
  useSession: () => ({ updateProfile }),
}));
const account = {
  id: 'one',
  username: 'alex',
  email: 'private@example.com',
  bio: 'Original bio',
  avatarUrl: 'https://example.com/avatar.jpg',
};

describe('own profile settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateProfile.mockResolvedValue(undefined);
  });
  it('sends only changed public fields and disables saving after success', async () => {
    render(<ProfileSettingsForm account={account} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toHaveAttribute('aria-busy', 'false');
    fireEvent.change(screen.getByLabelText('Bio'), {
      target: { value: 'New bio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(updateProfile).toHaveBeenCalledWith({ bio: 'New bio' });
    expect(screen.queryByText(account.email)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toHaveAttribute('aria-busy', 'false');
  });
  it('preserves a failed draft and serializes pending saves', async () => {
    let reject!: (error: Error) => void;
    updateProfile.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<ProfileSettingsForm account={account} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Bio'), {
      target: { value: 'Keep this draft' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Profile settings' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Bio')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Profile settings' }));
    await act(async () => {
      reject(new Error('Offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach Roorin',
    );
    expect(screen.getByLabelText('Bio')).toHaveValue('Keep this draft');
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toHaveAttribute('aria-busy', 'false');
    expect(updateProfile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });
  it('rejects invalid bio and avatar fields without writing', async () => {
    render(<ProfileSettingsForm account={account} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Bio'), {
      target: { value: 'x'.repeat(301) },
    });
    fireEvent.change(screen.getByLabelText('Avatar URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Use at most 300 characters.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Enter a public HTTP or HTTPS image URL without credentials.',
      ),
    ).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
