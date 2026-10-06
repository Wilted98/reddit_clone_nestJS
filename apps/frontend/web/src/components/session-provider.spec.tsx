import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { SessionProvider, useSession } from './session-provider';

const auth = {
  query: jest.fn(),
  mutate: jest.fn(),
  clearStore: jest.fn().mockResolvedValue(undefined),
};
const social = { clearStore: jest.fn().mockResolvedValue(undefined) };
jest.mock('../lib/apollo', () => ({ createAuthClient: () => auth }));
jest.mock('@apollo/client/react', () => ({ useApolloClient: () => social }));
const account = {
  __typename: 'Account',
  id: 'user-1',
  username: 'example',
  email: 'private@example.com',
  avatarUrl: null,
  bio: null,
};

function Probe() {
  const session = useSession();
  return (
    <>
      <span>
        {session.loading ? 'Loading' : (session.account?.email ?? 'Guest')}
      </span>
      <span>{session.account?.bio}</span>
      {session.error && <span>{session.error}</span>}
      <button
        onClick={() =>
          void session
            .signIn({ email: 'private@example.com', password: 'pass' })
            .catch(() => undefined)
        }
      >
        Login
      </button>
      <button onClick={() => void session.signOut().catch(() => undefined)}>
        Logout
      </button>
      <button
        onClick={() =>
          void session
            .updateProfile({ bio: 'Updated bio' })
            .catch(() => undefined)
        }
      >
        Save profile
      </button>
    </>
  );
}

describe('cookie session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.query.mockResolvedValue({ data: { me: account } });
  });
  it('restores the own-account session', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText(account.email)).toBeInTheDocument();
  });
  it('treats unauthorized restoration as an anonymous session', async () => {
    auth.query.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      }),
    );
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText('Guest')).toBeInTheDocument();
    expect(
      screen.queryByText('Email or password is incorrect.'),
    ).not.toBeInTheDocument();
  });
  it('does not conceal a backend outage as a normal anonymous restore', async () => {
    auth.query.mockRejectedValue(new Error('Offline'));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(
      await screen.findByText('Could not reach Roorin. Please try again.'),
    ).toBeInTheDocument();
  });
  it('does not overwrite a login with an older restore response', async () => {
    let resolve!: (value: unknown) => void;
    auth.query.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    auth.mutate.mockResolvedValue({ data: { login: account } });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByText('Login'));
    expect(await screen.findByText(account.email)).toBeInTheDocument();
    await act(async () => {
      resolve({ data: { me: null } });
    });
    expect(screen.getByText(account.email)).toBeInTheDocument();
    expect(social.clearStore).toHaveBeenCalledTimes(1);
  });
  it('settles loading after a failed login invalidates a pending restore', async () => {
    auth.query.mockReturnValue(new Promise(() => undefined));
    auth.mutate.mockRejectedValue(new Error('Offline'));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByText('Login'));
    expect(await screen.findByText('Guest')).toBeInTheDocument();
  });
  it('clears both caches and private view state on successful logout', async () => {
    auth.mutate.mockResolvedValue({ data: { logout: true } });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText('Logout'));
    await screen.findByText('Guest');
    expect(auth.clearStore).toHaveBeenCalledTimes(1);
    expect(social.clearStore).toHaveBeenCalledTimes(1);
  });
  it('does not pretend logout succeeded when the backend fails', async () => {
    auth.mutate.mockRejectedValue(new Error('Offline'));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => expect(auth.mutate).toHaveBeenCalled());
    expect(screen.getByText(account.email)).toBeInTheDocument();
    expect(auth.clearStore).not.toHaveBeenCalled();
  });
  it('updates own account state without putting account data into social cache', async () => {
    auth.mutate.mockResolvedValue({
      data: { updateUser: { ...account, bio: 'Updated bio' } },
    });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText('Save profile'));
    expect(await screen.findByText('Updated bio')).toBeInTheDocument();
    expect(auth.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { input: { bio: 'Updated bio' } } }),
    );
    expect(social.clearStore).not.toHaveBeenCalled();
  });
  it('does not replace a session with an unrelated account response', async () => {
    auth.mutate.mockResolvedValue({
      data: { updateUser: { ...account, id: 'other', bio: 'Updated bio' } },
    });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText('Save profile'));
    await waitFor(() => expect(auth.mutate).toHaveBeenCalled());
    expect(screen.queryByText('Updated bio')).not.toBeInTheDocument();
  });
  it('ignores a save response that arrives after logout', async () => {
    let resolve!: (value: unknown) => void;
    auth.mutate.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    fireEvent.click(screen.getByText('Save profile'));
    await waitFor(() => expect(auth.mutate).toHaveBeenCalledTimes(1));
    auth.mutate.mockResolvedValueOnce({ data: { logout: true } });
    fireEvent.click(screen.getByText('Logout'));
    await screen.findByText('Guest');
    await act(async () => {
      resolve({ data: { updateUser: { ...account, bio: 'Updated bio' } } });
    });
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.queryByText('Updated bio')).not.toBeInTheDocument();
  });
  it('rechecks the session after an expired-session save failure', async () => {
    const failure = new CombinedGraphQLErrors({
      errors: [
        { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
      ],
    });
    auth.mutate.mockRejectedValue(failure);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText(account.email);
    auth.query.mockRejectedValueOnce(failure);
    fireEvent.click(screen.getByText('Save profile'));
    await screen.findByText('Guest');
    expect(auth.query).toHaveBeenCalledTimes(2);
  });
});
