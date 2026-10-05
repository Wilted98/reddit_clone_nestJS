import { badgeTone } from '../lib/content';

export function CommunityBadge({ value }: { value: string }) {
  return (
    <span
      className={`community-badge tone-${badgeTone(value)}`}
      aria-hidden="true"
    >
      {value.slice(0, 1).toUpperCase()}
    </span>
  );
}
