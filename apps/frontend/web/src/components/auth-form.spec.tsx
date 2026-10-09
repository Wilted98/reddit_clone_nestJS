import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AuthForm } from './auth-form';
import demoAccount from '../lib/demo-account.json';
import { registrationSchema } from '../lib/auth-validation';

const signIn = jest.fn();
jest.mock('./session-provider', () => ({ useSession: () => ({ signIn }) }));

describe('demo login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn.mockResolvedValue(undefined);
  });
  it('is hidden by default and never fills registration fields', () => {
    const { rerender } = render(
      <AuthForm mode="login" onModeChange={jest.fn()} />,
    );
    expect(screen.queryByText('Demo account')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
    rerender(
      <AuthForm mode="register" demoLoginEnabled onModeChange={jest.fn()} />,
    );
    expect(screen.queryByText('Demo account')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });
  it('fills the shared credentials without submitting and uses the normal login flow', async () => {
    render(<AuthForm mode="login" demoLoginEnabled onModeChange={jest.fn()} />);
    expect(
      screen.getByText('Shared account. Do not enter personal information.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use demo account' }));
    expect(screen.getByLabelText('Email')).toHaveValue(demoAccount.email);
    expect(screen.getByLabelText('Password')).toHaveValue(demoAccount.password);
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: demoAccount.email,
        password: demoAccount.password,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in' }),
      ).not.toBeDisabled(),
    );
  });
  it('does not replace credentials while a login is pending', async () => {
    let resolve!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<AuthForm mode="login" demoLoginEnabled onModeChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'own@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'OwnPassword123!' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: 'Use demo account' }),
    ).toBeDisabled();
    await act(async () => resolve());
    expect(screen.getByLabelText('Email')).toHaveValue('own@example.com');
  });
  it('keeps the demo credentials compatible with normal registration rules', () => {
    expect(registrationSchema.safeParse(demoAccount).success).toBe(true);
  });
});
