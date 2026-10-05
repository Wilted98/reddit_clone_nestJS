import { LoaderCircle, RotateCcw } from 'lucide-react';
import { errorMessage } from '../lib/errors';

export function QueryError({
  error,
  retry,
  pending = false,
}: {
  error: unknown;
  retry: () => void;
  pending?: boolean;
}) {
  return (
    <div className="query-error" role="alert">
      <p>{errorMessage(error)}</p>
      <button className="text-button" onClick={retry} disabled={pending}>
        <RotateCcw size={16} />
        Retry
      </button>
    </div>
  );
}

export function QueryLoading({ label }: { label: string }) {
  return (
    <p className="query-loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </p>
  );
}
