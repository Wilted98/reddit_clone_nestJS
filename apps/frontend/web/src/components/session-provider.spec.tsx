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
});
