'use client';

import React from 'react';

/**
 * AerodromeLogo — the "airplane trails" mark: four contrail arcs fanning
 * outward from a pivot on the left, in Aerodrome's brand palette
 * (black, blue, off-white, red). Inline SVG so we don't depend on a CDN.
 *
 * The arcs are stroked paths with rounded caps, each starting at the
 * left-center pivot and sweeping up-and-right at progressively flatter
 * angles from top to bottom.
 */
export function AerodromeLogo({ size = 16 }: { size?: number }) {
  const stroke = Math.max(2, size * 0.13);
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      {/* Black arc (top) */}
      <path
        d="M4 20 Q 14 4 30 8"
        stroke="#0a0a0a"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Blue arc */}
      <path
        d="M4 20 Q 14 8 30 14"
        stroke="#1d4ed8"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Cream/off-white arc */}
      <path
        d="M4 20 Q 14 14 30 20"
        stroke="#f5f0e1"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Red arc (bottom) */}
      <path
        d="M4 20 Q 14 22 30 26"
        stroke="#dc2626"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UniswapLogo({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#ff007a" />
      <path
        d="M8 15c2-1 3.5-3 4-6 0 4 2 6 4 7-3 0-5-1-8-1z"
        fill="#fff"
      />
    </svg>
  );
}

export function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="9" height="9" rx="1.5" />
      <path d="M10 4V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10" />
    </svg>
  );
}

export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8l4 4 6-8" />
    </svg>
  );
}
