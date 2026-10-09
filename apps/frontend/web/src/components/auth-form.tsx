'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  RegistrationFields,
  registrationSchema,
  SignInFields,
  signInSchema,
} from '../lib/auth-validation';
import { errorMessage } from '../lib/errors';
import { useSession } from './session-provider';
import demoAccount from '../lib/demo-account.json';

export type AuthMode = 'login' | 'register';

function PasswordVisibility({
  visible,
  toggle,
}: {
  visible: boolean;
  toggle: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      title={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      className="primary-button auth-submit"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <LoaderCircle size={19} className="spin" />
      ) : (
        <ArrowRight size={19} />
      )}
      {pending ? 'Please wait...' : label}
    </button>
  );
}

export function AuthForm({
  mode,
  onModeChange,
  demoLoginEnabled = false,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  demoLoginEnabled?: boolean;
}) {
  return (
    <>
      {mode === 'login' ? (
        <LoginForm demoLoginEnabled={demoLoginEnabled} />
      ) : (
        <RegistrationForm />
      )}
      <p className="auth-switch">
        {mode === 'register' ? 'Already a member?' : 'New to Roorin?'}{' '}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onModeChange(mode === 'register' ? 'login' : 'register')
          }
        >
          {mode === 'register' ? 'Sign in' : 'Create account'}
        </button>
      </p>
    </>
  );
}

function LoginForm({ demoLoginEnabled }: { demoLoginEnabled: boolean }) {
  const session = useSession();
  const [failure, setFailure] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  async function submit(input: SignInFields) {
    setFailure(null);
    try {
      await session.signIn(input);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }
  return (
    <form onSubmit={handleSubmit(submit)} noValidate aria-label="Sign in">
      {demoLoginEnabled && (
        <div className="demo-login">
          <strong>Demo account</strong>
          <span>{demoAccount.email}</span>
          <span>
            Password: <code>{demoAccount.password}</code>
          </span>
          <small>Shared account. Do not enter personal information.</small>
          <button
            type="button"
            className="text-button"
            disabled={isSubmitting}
            onClick={() => {
              setFailure(null);
              reset({
                email: demoAccount.email,
                password: demoAccount.password,
              });
            }}
          >
            <ArrowRight size={17} /> Use demo account
          </button>
        </div>
      )}
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          disabled={isSubmitting}
        />
        {errors.email && (
          <span className="field-error" id="email-error">
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            {...register('password')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={isSubmitting}
          />
          <PasswordVisibility
            visible={visible}
            toggle={() => setVisible(!visible)}
          />
        </div>
        {errors.password && (
          <span className="field-error" id="password-error">
            {errors.password.message}
          </span>
        )}
      </div>
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      <SubmitButton pending={isSubmitting} label="Sign in" />
    </form>
  );
}

function RegistrationForm() {
  const session = useSession();
  const [failure, setFailure] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [registered, setRegistered] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFields>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { username: '', email: '', password: '' },
  });
  async function submit(input: RegistrationFields) {
    setFailure(null);
    try {
      if (!registered) {
        await session.register(input);
        setRegistered(true);
      }
      await session.signIn({ email: input.email, password: input.password });
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }
  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Create account"
    >
      <div className="form-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          {...register('username')}
          aria-invalid={!!errors.username}
          aria-describedby={errors.username ? 'username-error' : undefined}
          readOnly={registered}
          disabled={isSubmitting}
        />
        {errors.username && (
          <span className="field-error" id="username-error">
            {errors.username.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          readOnly={registered}
          disabled={isSubmitting}
        />
        {errors.email && (
          <span className="field-error" id="email-error">
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            type={visible ? 'text' : 'password'}
            autoComplete={registered ? 'current-password' : 'new-password'}
            {...register('password')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={isSubmitting}
          />
          <PasswordVisibility
            visible={visible}
            toggle={() => setVisible(!visible)}
          />
        </div>
        {errors.password && (
          <span className="field-error" id="password-error">
            {errors.password.message}
          </span>
        )}
      </div>
      {registered && (
        <p className="form-notice" role="status">
          Account created. Sign in to continue.
        </p>
      )}
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      <SubmitButton
        pending={isSubmitting}
        label={registered ? 'Sign in' : 'Create account'}
      />
    </form>
  );
}
