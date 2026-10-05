'use client';

import { RotateCcw } from 'lucide-react';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-error">
      <h1>Something went wrong</h1>
      <button className="primary-button" onClick={reset}>
        <RotateCcw size={16} />
        Try again
      </button>
    </main>
  );
}
