'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

/**
 * Small icon-only button that copies a string to clipboard and shows a
 * brief checkmark confirmation.
 */
export function CopyButton({
  value,
  title,
  size = 12,
}: {
  value: string;
  title?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked — silently ignore.
    }
  };

  return (
    <button
      onClick={onClick}
      title={title ?? `Copy ${value}`}
      aria-label={title ?? `Copy ${value}`}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 2,
        marginLeft: 4,
        cursor: 'pointer',
        color: copied ? '#10b981' : '#94a3b8',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
      }}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

export default CopyButton;
