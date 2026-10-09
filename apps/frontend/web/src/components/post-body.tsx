'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export function PostBody({
  body,
  id,
  expandable,
}: {
  body: string;
  id: string;
  expandable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = expandable && body.length > 320;
  return (
    <div className={truncated ? 'post-expanded' : undefined}>
      <p id={id} className="post-body">
        {truncated && !expanded ? `${body.slice(0, 320)}...` : body}
      </p>
      {truncated && (
        <button
          type="button"
          className="text-button post-expand-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? 'Show less' : 'Read full post'}
        </button>
      )}
    </div>
  );
}
