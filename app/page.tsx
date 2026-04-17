'use client';

/**
 * Landing page — terminal-forward single-purpose search.
 *
 * Design brief (approved by user):
 *   - "Search IS the hero", Bloomberg/Dune mood, quant aesthetic, no AI slop.
 *   - Addresses-only submit (v1). Quick-pick chips below for common pools.
 *   - Hardcoded stat strip (no fake TVL counters).
 *   - Cyan accent used sparingly: brand square, focus ring, chip hover.
 *
 * Full spec lives in the UXUI agent's memory file; this component is the
 * faithful implementation. See CLAUDE.md (agent team workflow) for how the
 * spec was produced.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isValidAddress } from '../lib/poolStore';

interface QuickPick {
  label: string;
  address: string;
}

const QUICK_PICKS: QuickPick[] = [
  // Aerodrome Slipstream USDC/CHECK — the default demo pool (known-working).
  { label: 'USDC / CHECK', address: '0x3c4384f3664b37a3cb5a5cb3452b4b4a3aa1256f' },
  // Uniswap V3 WETH/USDC on Base — the canonical Base high-volume pool.
  { label: 'WETH / USDC', address: '0xd0b53D9277642d899DF5C87A3966A349A798F224' },
  // Aerodrome Slipstream cbBTC/USDC.
  { label: 'cbBTC / USDC', address: '0x4e962BB3889Bf030368F56810A9c96B83CB3E778' },
];

export default function Landing() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!isValidAddress(trimmed)) {
      setError('Not a valid Base address');
      return;
    }
    router.push(`/pool/${trimmed.toLowerCase()}`);
  };

  return (
    <div style={frameStyle}>
      {/* Faint dot grid — the only decorative chrome on the page */}
      <div style={dotGridStyle} aria-hidden="true" />

      <Nav />

      <main style={mainStyle}>
        <Hero value={value} setValue={setValue} error={error} setError={setError} submit={submit} />
        <QuickPicks onPick={(addr) => router.push(`/pool/${addr.toLowerCase()}`)} />
        <StatStrip />
        <PreviewStrip />
      </main>

      <Footer />
    </div>
  );
}

// ============================================================================
// Sections
// ============================================================================

function Nav() {
  return (
    <nav style={navStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={brandSquareStyle} aria-hidden="true" />
        <span style={wordmarkStyle}>LIQUIDSCOUT</span>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <NavLink href="https://github.com/chevyjai/liquidscout#readme">DOCS</NavLink>
        <NavLink href="https://github.com/chevyjai/liquidscout">GITHUB</NavLink>
        <NavLink href="https://basescan.org">STATUS</NavLink>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={navLinkStyle}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e7eb')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
    >
      {children}
    </a>
  );
}

function Hero({
  value,
  setValue,
  error,
  setError,
  submit,
}: {
  value: string;
  setValue: (v: string) => void;
  error: string | null;
  setError: (e: string | null) => void;
  submit: (e?: FormEvent) => void;
}) {
  return (
    <section style={heroStyle}>
      <div style={eyebrowStyle}>
        PER-TICK LIQUIDITY · BASE · UNISWAP V3 + AERODROME SLIPSTREAM
      </div>
      <h1 style={h1Style}>Read any CL pool down to the tick.</h1>
      <p style={subStyle}>
        Live bid/ask depth, cumulative curves, and tick-by-tick inventory for
        concentrated-liquidity pools on Base.
      </p>

      <form onSubmit={submit} style={searchFormStyle}>
        <SearchBar
          value={value}
          onChange={(v) => {
            setValue(v);
            if (error) setError(null);
          }}
          onSubmit={submit}
        />
        {error && <div style={errorStyle}>{error}</div>}
      </form>
    </section>
  );
}

function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        ...searchBarStyle,
        borderColor: focused ? '#22d3ee' : '#1f2937',
        boxShadow: focused ? '0 0 0 4px rgba(34, 211, 238, 0.10)' : 'none',
      }}
    >
      <SearchIcon />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="0x… pool address"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        style={searchInputStyle}
        aria-label="Pool address"
      />
      <kbd style={kbdStyle} aria-hidden="true">↵</kbd>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748b"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: 'absolute', left: 20, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function QuickPicks({ onPick }: { onPick: (address: string) => void }) {
  return (
    <div style={quickPicksStyle}>
      {QUICK_PICKS.map((p) => (
        <button
          key={p.address}
          onClick={() => onPick(p.address)}
          style={chipStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#22d3ee';
            e.currentTarget.style.color = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#1f2937';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function StatStrip() {
  // Hardcoded truths only — no fake live counters. Every value is something
  // that's actually true about the app and won't silently rot.
  const stats = [
    { label: 'PROTOCOLS', value: '2' },
    { label: 'CHAIN', value: 'BASE' },
    { label: 'TICK RESOLUTION', value: '1' },
    { label: 'REFRESH', value: 'LIVE' },
  ];
  return (
    <div style={statStripStyle}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            ...statCellStyle,
            borderLeft: i === 0 ? 'none' : '1px solid #1f2937',
          }}
        >
          <div style={statLabelStyle}>{s.label}</div>
          <div style={statValueStyle}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Static SVG preview of the depth chart. Hand-drawn proportions (not a real
 * fetch) so the landing page renders instantly and doesn't hit the RPC on
 * first paint. Matches the actual chart's palette and per-tick bar style.
 */
function PreviewStrip() {
  return (
    <div style={previewFrameStyle}>
      <div style={previewOverlayLabelStyle}>
        USDC / CHECK · 0x3c43…256f · LIVE
      </div>
      <svg
        viewBox="0 0 1120 320"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        preserveAspectRatio="none"
        aria-label="Preview of the LiquidScout depth chart"
      >
        {/* Grid lines */}
        {[80, 160, 240].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="1120"
            y2={y}
            stroke="#1e293b"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        ))}
        {/* Current-price reference line */}
        <line
          x1="560"
          y1="0"
          x2="560"
          y2="320"
          stroke="#ec4899"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        {/* Bars — left bid (orange) */}
        {[
          { x: 40, h: 180 },
          { x: 120, h: 28 },
          { x: 200, h: 44 },
          { x: 260, h: 36 },
          { x: 320, h: 52 },
          { x: 400, h: 68 },
          { x: 470, h: 88 },
          { x: 520, h: 72 },
        ].map((b) => (
          <rect
            key={`l-${b.x}`}
            x={b.x}
            y={320 - b.h}
            width="14"
            height={b.h}
            fill="#f97316"
            fillOpacity="0.75"
          />
        ))}
        {/* Active center bar (cyan) */}
        <rect x="554" y="120" width="14" height="200" fill="#22d3ee" />
        {/* Bars — right ask (green) */}
        {[
          { x: 610, h: 92 },
          { x: 660, h: 72 },
          { x: 720, h: 60 },
          { x: 780, h: 48 },
          { x: 850, h: 40 },
          { x: 920, h: 32 },
          { x: 990, h: 52 },
          { x: 1060, h: 210 },
        ].map((b) => (
          <rect
            key={`r-${b.x}`}
            x={b.x}
            y={320 - b.h}
            width="14"
            height={b.h}
            fill="#10b981"
            fillOpacity="0.75"
          />
        ))}
      </svg>
    </div>
  );
}

function Footer() {
  return (
    <footer style={footerStyle}>
      <span>LIQUIDSCOUT · BUILT ON BASE · NOT FINANCIAL ADVICE</span>
      <span style={{ color: '#64748b' }}>chevyjai/liquidscout</span>
    </footer>
  );
}

// ============================================================================
// Styles (inline — keeps the landing page self-contained and easy to diff)
// ============================================================================

const frameStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  background: '#030712',
  color: '#e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const dotGridStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'radial-gradient(rgba(31, 41, 55, 0.6) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
  opacity: 0.35,
  pointerEvents: 'none',
  zIndex: 0,
};

const navStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: 72,
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 1120,
  margin: '0 auto',
  width: '100%',
};

const brandSquareStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: '#22d3ee',
};

const wordmarkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#e5e7eb',
};

const navLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 12,
  color: '#94a3b8',
  textDecoration: 'none',
  letterSpacing: '0.05em',
  transition: 'color 150ms ease',
};

const mainStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  flex: 1,
  maxWidth: 1120,
  margin: '0 auto',
  padding: '0 24px',
  width: '100%',
};

const heroStyle: React.CSSProperties = {
  paddingTop: 'min(12vh, 96px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 11,
  color: '#64748b',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  marginBottom: 32,
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  fontWeight: 500,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  color: '#e5e7eb',
  maxWidth: 900,
};

const subStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 16,
  lineHeight: 1.5,
  color: '#94a3b8',
  maxWidth: 620,
};

const searchFormStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  marginTop: 40,
};

const searchBarStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 720,
  height: 64,
  background: '#0b1220',
  border: '1px solid #1f2937',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  transition: 'border-color 180ms ease, box-shadow 180ms ease',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  padding: '0 60px 0 52px',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 15,
  color: '#e5e7eb',
  caretColor: '#22d3ee',
};

const kbdStyle: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #1f2937',
  borderRadius: 4,
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 12,
  color: '#64748b',
  background: '#030712',
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 12,
  color: '#f97316',
};

const quickPicksStyle: React.CSSProperties = {
  marginTop: 20,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
};

const chipStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: 'transparent',
  border: '1px solid #1f2937',
  borderRadius: 4,
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 12,
  color: '#94a3b8',
  cursor: 'pointer',
  transition: 'border-color 150ms ease, color 150ms ease',
};

const statStripStyle: React.CSSProperties = {
  marginTop: 120,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  border: '1px solid #1f2937',
  borderRadius: 4,
  background: '#0b1220',
};

const statCellStyle: React.CSSProperties = {
  height: 72,
  padding: '0 20px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};

const statLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 10,
  color: '#64748b',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const statValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 14,
  color: '#e5e7eb',
  letterSpacing: '0.04em',
};

const previewFrameStyle: React.CSSProperties = {
  position: 'relative',
  marginTop: 80,
  background: '#0b1220',
  border: '1px solid #1f2937',
  borderRadius: 8,
  overflow: 'hidden',
};

const previewOverlayLabelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 16,
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 11,
  color: '#64748b',
  letterSpacing: '0.05em',
  zIndex: 2,
};

const footerStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: 64,
  marginTop: 120,
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 1120,
  margin: '0 auto',
  width: '100%',
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 12,
  color: '#64748b',
  letterSpacing: '0.05em',
  borderTop: '1px solid #1f2937',
};
