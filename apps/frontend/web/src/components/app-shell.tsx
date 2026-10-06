'use client';

import Link from 'next/link';
import {
  Compass,
  House,
  LogIn,
  MessagesSquare,
  Plus,
  UserRound,
} from 'lucide-react';
import { ReactNode } from 'react';
import { useSession } from './session-provider';
import { CommunityShortcuts } from './community-shortcuts';
import { profileHref } from '../lib/profile';
import { ProfileAvatar } from './profile-avatar';

export function AppShell({
  children,
  active,
  title,
  mainId = 'content',
}: {
  children: ReactNode;
  active: 'home' | 'communities' | 'account' | 'profile' | null;
  title: string;
  mainId?: string;
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
  if (account)
    links.splice(2, 0, {
      href: profileHref(account.username),
      key: 'profile',
      label: 'Your profile',
      icon: UserRound,
    });
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
        <Link className="primary-button create-post-link" href="/submit">
          <Plus size={19} />
          Create post
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
        <CommunityShortcuts />
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
            href={account ? profileHref(account.username) : '/account'}
            className="header-avatar"
            aria-label={
              account ? `Open profile for ${account.username}` : 'Open account'
            }
            title={account ? account.username : 'Sign in'}
          >
            {account ? (
              <ProfileAvatar
                username={account.username}
                avatarUrl={account.avatarUrl}
              />
            ) : (
              <UserRound size={23} />
            )}
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
