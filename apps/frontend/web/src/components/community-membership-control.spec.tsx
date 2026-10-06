import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useQuery } from '@apollo/client/react';
import { CommunityMembershipControl } from './community-membership-control';
import {
  CommunityMembershipDocument,
  CommunityMembershipQuery,
  JoinForPostingDocument,
} from '../graphql/generated/social';

const community = {
  id: 'craft',
  slug: 'craft',
  name: 'Craft',
  ownerId: 'owner',
  description: null,
  memberCount: 2,
  createdAt: '2026-10-06T00:00:00Z',
};
let account: { id: string } | null = { id: 'viewer' };
const refresh = jest.fn();
const join = jest.fn();
const leave = jest.fn();
const refetchQueries = jest.fn();
const query: {
  data?: CommunityMembershipQuery;
  loading: boolean;
  error?: unknown;
  refetch: jest.Mock;
} = { loading: false, refetch: jest.fn() };
jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => query),
  useMutation: (document: unknown) => [
    document === JoinForPostingDocument ? join : leave,
  ],
  useApolloClient: () => ({ refetchQueries }),
}));
jest.mock('./session-provider', () => ({
  useSession: () => ({ account, loading: false, refresh }),
}));

describe('community membership controls', () => {
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
    query.data = { myCommunities: { items: [] } };
    query.error = undefined;
    query.loading = false;
    join.mockResolvedValue({ data: { joinCommunity: community } });
    leave.mockResolvedValue({
      data: { leaveCommunity: { ...community, memberCount: 1 } },
    });
    refetchQueries.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not issue private lookups for guests', () => {
    account = null;
    render(<CommunityMembershipControl slug="craft" allowLeave />);
    expect(
      screen.getByRole('link', { name: 'Join community' }),
    ).toHaveAttribute('href', '/account');
    expect(useQuery).not.toHaveBeenCalled();
  });
  it('looks up one exact community and dims an existing composer membership', () => {
    query.data = { myCommunities: { items: [community] } };
    render(<CommunityMembershipControl slug="craft" />);
    expect(useQuery).toHaveBeenCalledWith(
      CommunityMembershipDocument,
      expect.objectContaining({
        variables: { slug: 'craft' },
        fetchPolicy: 'no-cache',
        context: { queryDeduplication: false },
      }),
    );
    expect(screen.getByRole('button', { name: 'Joined' })).toBeDisabled();
    expect(join).not.toHaveBeenCalled();
  });
  it('hides success after 3.5 seconds without re-enabling Join', async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    render(<CommunityMembershipControl slug="craft" onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join community' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Community joined.');
    expect(screen.getByRole('button', { name: 'Joined' })).toBeDisabled();
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joined' })).toBeDisabled();
    expect(onChange).toHaveBeenCalledWith(community);
    expect(refetchQueries).toHaveBeenCalledTimes(1);
  });
  it('serializes joins and keeps composer pending state in sync', async () => {
    let resolve!: (value: unknown) => void;
    join.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onPendingChange = jest.fn();
    render(
      <CommunityMembershipControl
        slug="craft"
        onPendingChange={onPendingChange}
      />,
    );
    const button = screen.getByRole('button', { name: 'Join community' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(join).toHaveBeenCalledTimes(1);
    expect(onPendingChange).toHaveBeenCalledWith(true);
    await act(async () => {
      resolve({ data: { joinCommunity: community } });
    });
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });
  it('resets confirmed state on community changes and restores membership from the query', async () => {
    const { rerender } = render(<CommunityMembershipControl slug="craft" />);
    fireEvent.click(screen.getByRole('button', { name: 'Join community' }));
    await screen.findByRole('button', { name: 'Joined' });
    rerender(<CommunityMembershipControl slug="books" />);
    expect(
      screen.getByRole('button', { name: 'Join community' }),
    ).toBeEnabled();
    expect(screen.queryByText('Community joined.')).not.toBeInTheDocument();
    query.data = { myCommunities: { items: [community] } };
    rerender(<CommunityMembershipControl slug="craft" />);
    expect(screen.getByRole('button', { name: 'Joined' })).toBeDisabled();
  });
  it('confirms Leave, cancels without writing, and changes to Join only after success', async () => {
    query.data = { myCommunities: { items: [community] } };
    render(<CommunityMembershipControl slug="craft" allowLeave />);
    const trigger = screen.getByRole('button', { name: 'Leave community' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(leave).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await screen.findByRole('button', { name: 'Join community' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(refetchQueries).toHaveBeenCalledTimes(1);
  });
  it('does not offer owners a Leave action', () => {
    account = { id: 'owner' };
    query.data = { myCommunities: { items: [community] } };
    render(<CommunityMembershipControl slug="craft" allowLeave />);
    expect(screen.getByRole('button', { name: 'Owner' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Leave community' }),
    ).not.toBeInTheDocument();
  });
  it('does not guess membership while a lookup is loading or failed', () => {
    query.data = undefined;
    query.loading = true;
    const { rerender } = render(
      <CommunityMembershipControl slug="craft" allowLeave />,
    );
    expect(
      screen.getByRole('button', { name: 'Checking membership...' }),
    ).toBeDisabled();
    query.loading = false;
    query.error = new Error('Offline');
    rerender(<CommunityMembershipControl slug="craft" allowLeave />);
    expect(
      screen.queryByRole('button', { name: 'Join community' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('keeps a failed leave in its dialog and rechecks expiry without retrying writes', async () => {
    query.data = { myCommunities: { items: [community] } };
    leave.mockRejectedValueOnce(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
        ],
      }),
    );
    render(<CommunityMembershipControl slug="craft" allowLeave />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave community' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm leave community' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(refetchQueries).not.toHaveBeenCalled();
  });
  it('ignores late writes from a previous account', async () => {
    let resolve!: (value: unknown) => void;
    join.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onChange = jest.fn();
    const { rerender } = render(
      <CommunityMembershipControl slug="craft" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join community' }));
    account = { id: 'another-viewer' };
    rerender(<CommunityMembershipControl slug="craft" onChange={onChange} />);
    await act(async () => {
      resolve({ data: { joinCommunity: community } });
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(refetchQueries).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Join community' }),
    ).toBeEnabled();
  });
});
