import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Providers } from '../components/providers';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/900.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Roorin | Your daily conversations',
  description: 'Communities and conversations on Roorin.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
