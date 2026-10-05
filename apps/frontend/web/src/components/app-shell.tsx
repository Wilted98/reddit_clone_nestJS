'use client';

import Link from 'next/link';
import { Compass, House, LogIn, MessagesSquare, UserRound } from 'lucide-react';
import { ReactNode } from 'react';
import { useSession } from './session-provider';

export function AppShell({
  children,
  active,
  title,
  mainId = 'content',
  accountNavigation,
}: {
  children: ReactNode;
  active: 'home' | 'communities' | 'account';
  title: string;
  mainId?: string;
  accountNavigation?: ReactNode;
}) {
  const { account } = useSession();
  const links = [
    { href: '/', key: 'home', label: 'Home', icon: House },
    {
      href: '/communities',
      key: 'communities',
      label: 'Communities',
      icon: Compass,
    },
    {
      href: '/account',
      key: 'account',
      label: account ? 'Your account' : 'Sign in',
      icon: account ? UserRound : LogIn,
    },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Roorin home">
          <span className="brand-symbol">
            <MessagesSquare size={25} />
          </span>
          <span>Roorin</span>
        </Link>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ href, key, label, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              className={`nav-item ${active === key ? 'selected' : ''}`}
              aria-current={active === key ? 'page' : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        {accountNavigation}
        <div className="sidebar-footer">
          <span className="small-brand">roorin</span>
          <span>A little more connected.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="header-section">YOUR CORNER</span>
            <span className="header-title">{title}</span>
          </div>
          <Link
            href="/account"
            className="header-avatar"
            aria-label={
              account ? `Signed in as ${account.username}` : 'Open account'
            }
            title={account ? account.username : 'Sign in'}
          >
            <UserRound size={23} />
          </Link>
        </header>
        {children}
        <footer className="workspace-footer">
          <span>Roorin</span>
          <span>Made for conversations.</span>
        </footer>
      </div>
    </div>
  );
}
