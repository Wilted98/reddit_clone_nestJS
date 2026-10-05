'use client';

import Image from 'next/image';
import {
  ArrowRight,
  CircleCheck,
  LoaderCircle,
  LogIn,
  LogOut,
  MessagesSquare,
  RotateCcw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { AuthForm, AuthMode } from './auth-form';
import { AppShell } from './app-shell';
import { useSession } from './session-provider';

export function AccountScreen() {
  const session = useSession();
  const [mode, setMode] = useState<AuthMode>('login');
  const [signingOut, setSigningOut] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function signOut() {
    setSigningOut(true);
    setFailure(null);
    try {
      await session.signOut();
      setMode('login');
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <AppShell
      active="account"
      title={
        session.account ? 'Your account' : 'Good conversations start here.'
      }
      mainId="account"
      accountNavigation={
        !session.account && (
          <nav className="account-mode-nav" aria-label="Account navigation">
            <>
              <button
                className={`nav-item ${mode === 'login' ? 'selected' : ''}`}
                aria-current={mode === 'login' ? 'page' : undefined}
                onClick={() => setMode('login')}
              >
                <LogIn size={21} />
                Sign in
              </button>
              <button
                className={`nav-item ${mode === 'register' ? 'selected' : ''}`}
                aria-current={mode === 'register' ? 'page' : undefined}
                onClick={() => setMode('register')}
              >
                <UserPlus size={21} />
                Create account
              </button>
            </>
          </nav>
        )
      }
    >
      <main id="account" className="account-layout">
        <section className="account-content" aria-labelledby="account-heading">
          {session.loading ? (
            <div className="session-loading" role="status">
              <LoaderCircle size={24} className="spin" />
              <h1 id="account-heading">One moment...</h1>
            </div>
          ) : session.account ? (
            <>
              <span className="section-label">
                <CircleCheck size={16} />
                YOU&apos;RE IN
              </span>
              <h1 id="account-heading">Hey, {session.account.username}!</h1>
              <p className="section-intro">Good to have you here.</p>
              <dl className="account-details">
                <div>
                  <dt>Username</dt>
                  <dd>u/{session.account.username}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{session.account.email}</dd>
                </div>
                {session.account.bio && (
                  <div>
                    <dt>Bio</dt>
                    <dd>{session.account.bio}</dd>
                  </div>
                )}
              </dl>
              {failure && (
                <p className="error-message" role="alert">
                  {failure}
                </p>
              )}
              <button
                className="secondary-button logout-button"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                {signingOut ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <LogOut size={18} />
                )}
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <span className="section-label">MAKE YOURSELF AT HOME</span>
              <h1 id="account-heading">
                {mode === 'register' ? 'Find your people.' : 'Welcome back.'}
              </h1>
              <p className="section-intro">
                {mode === 'register'
                  ? 'A new account. A fresh conversation.'
                  : 'Your corner of the internet is waiting.'}
              </p>
              {session.error && (
                <div className="session-error" role="alert">
                  <p>{session.error}</p>
                  <button
                    className="text-button"
                    onClick={() => void session.refresh()}
                  >
                    <RotateCcw size={16} />
                    Retry session
                  </button>
                </div>
              )}
              <AuthForm key={mode} mode={mode} onModeChange={setMode} />
            </>
          )}
        </section>
        <aside className="welcome-aside" aria-label="Welcome to Roorin">
          <div className="welcome-photo">
            <Image
              src="/community-street.jpg"
              alt="A lively neighborhood street, with buildings and people crossing"
              fill
              sizes="(max-width: 1000px) 400px, 35vw"
              priority
            />
            <span className="photo-badge">
              <MessagesSquare size={16} />
              Meet in the middle.
            </span>
          </div>
          <div className="welcome-caption">
            <span className="section-label">A PLACE TO BELONG</span>
            <h2>
              Different people.
              <br />
              Shared interests.
            </h2>
            <span className="caption-symbol">
              <ArrowRight size={25} />
            </span>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <span>Your email stays in your account.</span>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}
