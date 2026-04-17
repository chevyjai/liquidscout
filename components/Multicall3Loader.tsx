'use client';

/**
 * Multicall3Loader — a little nostalgia easter egg for the loading state.
 *
 * Inspired by the Chrome T-Rex offline game: a tiny dino jogs on a
 * "blockchain" while call payloads (slot0, tickBitmap, ticks) roll past
 * and get hopped over. Honors prefers-reduced-motion.
 *
 * Pure CSS + SVG, no runtime deps. The keyframes live in globals.css
 * scoped via the `mc3-` class prefix so they don't collide.
 */

import { useEffect, useState } from 'react';

const PAYLOADS = [
  'slot0',
  'tickBitmap',
  'liquidity',
  'ticks()',
  'multicall3',
  'fee()',
  'token0',
  'token1',
];

export function Multicall3Loader({
  height = 360,
  label = 'Batching reads through Multicall3…',
}: {
  height?: number;
  label?: string;
}) {
  const [hint, setHint] = useState(0);
  const hints = [
    'Fetching slot0 + bitmap…',
    'Decoding initialized ticks…',
    'Computing liquidity distribution…',
    'Pricing in USDC terms…',
  ];

  useEffect(() => {
    const id = setInterval(() => setHint((i) => (i + 1) % hints.length), 1200);
    return () => clearInterval(id);
  }, [hints.length]);

  return (
    <div
      className="skeleton"
      style={{
        height,
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      {/* Scene */}
      <div className="mc3-stage" aria-hidden="true">
        {/* Ground line */}
        <div className="mc3-ground" />

        {/* Dino */}
        <div className="mc3-dino">
          <svg viewBox="0 0 32 32" width="36" height="36">
            {/* Pixel-art-ish dino silhouette — 8x8 grid at 4px per pixel */}
            <g fill="#22d3ee">
              {/* Head */}
              <rect x="16" y="4" width="12" height="10" />
              {/* Eye (cutout) */}
              <rect x="23" y="7" width="2" height="2" fill="#030712" />
              {/* Neck */}
              <rect x="12" y="10" width="6" height="4" />
              {/* Body */}
              <rect x="6" y="14" width="20" height="10" />
              {/* Tail */}
              <rect x="0" y="14" width="6" height="4" />
              {/* Legs (animated via CSS) */}
              <rect className="mc3-leg mc3-leg-1" x="8" y="24" width="4" height="6" />
              <rect className="mc3-leg mc3-leg-2" x="18" y="24" width="4" height="6" />
              {/* Arm */}
              <rect x="22" y="16" width="3" height="4" />
            </g>
          </svg>
        </div>

        {/* Scrolling blocks (cacti equivalent — they're Multicall3 payloads) */}
        <div className="mc3-track">
          {PAYLOADS.map((p, i) => (
            <div key={i} className="mc3-block" style={{ animationDelay: `${i * -1.8}s` }}>
              <span>{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Label */}
      <div style={{ textAlign: 'center', zIndex: 2 }}>
        <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {label}
        </div>
        <div
          style={{
            color: '#94a3b8',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            minHeight: 16,
          }}
        >
          {hints[hint]}
        </div>
      </div>
    </div>
  );
}

export default Multicall3Loader;
