import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useQuery } from '@apollo/client/react';
import type { ReactNode } from 'react';
import type { JoinedCommunitiesQuery } from '../graphql/generated/social';
import { MembershipsScreen } from './memberships-screen';

const member = {
  id: 'craft',
  slug: 'craft',
  name: 'Craft',
  description: 'Making things',
  ownerId: 'other',
  memberCount: 2,
  createdAt: '2026-10-06T00:00:00Z',
};
const owner = {
  ...member,
  id: 'owned',
  slug: 'owned',
  name: 'Owned',
  ownerId: 'viewer',
};
let account: { id: string } | null = { id: 'viewer' };
const refresh = jest.fn();
const mutate = jest.fn();
const refetchQueries = jest.fn();
const query: {
  data?: JoinedCommunitiesQuery;
  loading: boolean;
  error?: unknown;
  refetch: jest.Mock;
  fetchMore: jest.Mock;
} = {
  loading: false,
  refetch: jest.fn(),
  fetchMore: jest.fn(),
};
jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => query),
  useMutation: () => [mutate],
  useApolloClient: () => ({ refetchQueries }),
}));
jest.mock('./session-provider', () => ({
  useSession: () => ({ account, loading: false, refresh }),
}));
jest.mock('./app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./social-rail', () => ({ SocialRail: () => null }));

describe('community memberships', () => {
  beforeAll(() => {
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
    account = { id: 'viewer' };
    query.data = {
      myCommunities: {
        items: [member, owner],
        hasMore: false,
        nextCursor: null,
      },
    };
    query.error = undefined;
    query.loading = false;
    refresh.mockResolvedValue(undefined);
    refetchQueries.mockResolvedValue(undefined);
    mutate.mockResolvedValue({
      data: { leaveCommunity: { ...member, memberCount: 1 } },
    });
  });
  it('gates private memberships and protects owners without guessing other roles', () => {
    const { rerender } = render(<MembershipsScreen />);
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Joined', { exact: true })).toBeInTheDocument();
    expect(useQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fetchPolicy: 'no-cache',
        context: { queryDeduplication: false },
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Leave r/owned' }),
    ).not.toBeInTheDocument();
    account = null;
    rerender(<MembershipsScreen />);
    expect(
      screen.getByRole('link', { name: 'Sign in to see your communities' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Making things')).not.toBeInTheDocument();
  });
  it('cancels without writing, then removes only confirmed memberships and refreshes subscriptions', async () => {
    render(<MembershipsScreen />);
    const trigger = screen.getByRole('button', { name: 'Leave r/craft' });
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Leave r/craft' }),
      ).not.toBeInTheDocument(),
    );
    expect(mutate).toHaveBeenCalledWith({ variables: { slug: 'craft' } });
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Owned' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Joined communities' }),
    ).toHaveFocus();
  });
  it('locks concurrent departures and keeps the dialog and row on transport failure', async () => {
    let reject!: (error: Error) => void;
    mutate.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    render(<MembershipsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
    const confirm = screen.getByRole('button', {
      name: 'Confirm leave community',
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => {
      reject(new Error('Offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach Roorin',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(refetchQueries).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(mutate).toHaveBeenCalledTimes(2);
  });
  it('rechecks expired sessions without replaying a mutation', async () => {
    mutate.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      }),
    );
    render(<MembershipsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(refetchQueries).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { ...member, id: 'wrong' },
    { ...member, ownerId: 'viewer' },
  ])(
    'rejects an unconfirmed or mismatched departure response %p',
    async (result) => {
      mutate.mockResolvedValue({ data: { leaveCommunity: result } });
      render(<MembershipsScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm leave community' }),
      );
      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );
      expect(
        screen.getByRole('heading', { name: 'Craft' }),
      ).toBeInTheDocument();
      expect(refetchQueries).not.toHaveBeenCalled();
    },
  );
  it('ignores late departure responses after navigation', async () => {
    let resolve!: (result: unknown) => void;
    mutate.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = render(<MembershipsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    unmount();
    await act(async () => {
      resolve({ data: { leaveCommunity: member } });
    });
    expect(refetchQueries).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
  it('keeps paging available after leaving all currently loaded memberships', async () => {
    query.data = {
      myCommunities: { items: [member], hasMore: true, nextCursor: 'craft' },
    };
    render(<MembershipsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'No communities on this page' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'No joined communities' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load more communities' }),
    ).toBeEnabled();
  });
  it("isolates a new account from a prior account's late departure result", async () => {
    let resolve!: (result: unknown) => void;
    mutate.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender } = render(<MembershipsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave r/craft' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    account = { id: 'next-account' };
    query.data = {
      myCommunities: {
        items: [
          { ...owner, name: 'New account community', ownerId: 'next-account' },
        ],
        hasMore: false,
        nextCursor: null,
      },
    };
    rerender(<MembershipsScreen />);
    await act(async () => {
      resolve({ data: { leaveCommunity: member } });
    });
    expect(
      screen.getByRole('heading', { name: 'New account community' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(refetchQueries).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
});
