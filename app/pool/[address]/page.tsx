'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { DepthChart } from '../../../components/DepthChart';
import { CumulativeChart } from '../../../components/CumulativeChart';
import { Multicall3Loader } from '../../../components/Multicall3Loader';
import { AerodromeLogo, UniswapLogo } from '../../../components/icons';
import { CopyButton } from '../../../components/CopyButton';
import { useLiquidity } from '../../../lib/useLiquidity';
import { DEFAULT_POOL, POOLS } from '../../../lib/pools';
import { tickToPrice } from '../../../lib/liquidity';
import {
  MAX_POOLS,
  isValidAddress,
  loadStoredPools,
  resolvePoolList,
  saveStoredPools,
  shortAddress,
  type StoredPool,
} from '../../../lib/poolStore';

export default function Page() {
  const params = useParams<{ address: string }>();
  const router = useRouter();
  const routeAddress = (params?.address ?? '').toLowerCase();

  // Bad URL → 404 instead of hitting the RPC with junk.
  if (routeAddress && !isValidAddress(routeAddress)) {
    notFound();
  }

  // Map the URL address onto a pool id — reuse the known-pool id if the
  // address matches, otherwise synthesize a custom id so the selector
  // picks it up.
  const initialId =
    POOLS.find((p) => p.address.toLowerCase() === routeAddress)?.id ??
    (routeAddress ? `custom-${routeAddress.slice(2, 10)}` : DEFAULT_POOL.id);

  const [poolId, setPoolId] = useState(initialId);
  const [invertPrice, setInvertPrice] = useState(false);
  const [stored, setStored] = useState<StoredPool[]>([]);
  const [addInput, setAddInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Hydrate stored pools from localStorage after mount (SSR-safe).
  useEffect(() => {
    setStored(loadStoredPools());
  }, []);

  // Keep the dropdown selection in sync with the URL when the user
  // navigates (e.g. browser back, or pushing to a different pool).
  useEffect(() => {
    setPoolId(initialId);
  }, [initialId]);

  const allPools = useMemo(() => resolvePoolList(stored), [stored]);

  // If the URL points at an address not in POOLS or the user's stored list,
  // synthesize a transient pool entry so the hook still has a target. We
  // don't persist it to localStorage unless the user explicitly adds it.
  const pool = useMemo(() => {
    const match = allPools.find((p) => p.id === poolId);
    if (match) return match;
    if (routeAddress) {
      return {
        id: poolId,
        label: shortAddress(routeAddress),
        address: routeAddress as `0x${string}`,
      };
    }
    return DEFAULT_POOL;
  }, [poolId, allPools, routeAddress]);

  // Navigate to /pool/[address] when the dropdown changes. Keeps URL and
  // state in sync — no router/state fights.
  const switchPool = (nextId: string) => {
    const next = allPools.find((p) => p.id === nextId);
    if (next) router.push(`/pool/${next.address.toLowerCase()}`);
  };

  const handleAddPool = () => {
    const addr = addInput.trim();
    setAddError(null);
    if (!isValidAddress(addr)) {
      setAddError('Not a valid 0x address');
      return;
    }
    const normalized = addr.toLowerCase();
    if (allPools.some((p) => p.address.toLowerCase() === normalized)) {
      setAddError('Already tracked');
      return;
    }
    if (stored.length >= MAX_POOLS) {
      setAddError(`Max ${MAX_POOLS} custom pools`);
      return;
    }
    const id = `custom-${normalized.slice(2, 10)}`;
    const next: StoredPool[] = [
      ...stored,
      {
        id,
        label: shortAddress(addr),
        address: addr as `0x${string}`,
        userAdded: true,
      },
    ];
    setStored(next);
    saveStoredPools(next);
    setAddInput('');
    router.push(`/pool/${normalized}`);
  };

  const handleRemovePool = (id: string) => {
    const next = stored.filter((s) => s.id !== id);
    setStored(next);
    saveStoredPools(next);
    if (poolId === id) router.push(`/pool/${DEFAULT_POOL.address.toLowerCase()}`);
  };

  const isCustomPool = stored.some((s) => s.id === poolId);

  const { data, error, isLoading, isRefreshing, refetch, pendingEvents } = useLiquidity({
    poolAddress: pool.address,
    // Public RPCs are stingy; ±2 words is a good MVP default. Bump to 5+
    // after you set NEXT_PUBLIC_BASE_RPC_URL to an Alchemy/QuickNode endpoint.
    wordRadius: 2,
    invertPrice,
  });

  const currentPrice = data
    ? tickToPrice(
        data.pool.tick,
        data.tokens[0].decimals,
        data.tokens[1].decimals,
        invertPrice,
      )
    : null;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>
            <Link
              href="/"
              style={{ color: '#e5e7eb', textDecoration: 'none' }}
            >
              LiquidScout
            </Link>{' '}
            <span style={{ color: '#22d3ee', fontWeight: 400, fontSize: 16 }}>
              · Base
            </span>
          </h1>
          <p style={{ margin: '6px 0 0', color: '#9ca3af' }}>
            Per-tick concentrated liquidity, refreshed by on-chain events.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={poolId}
              onChange={(e) => switchPool(e.target.value)}
              style={{
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                padding: '0 12px',
                height: 36,
                borderRadius: 8,
                minWidth: 180,
              }}
            >
              {allPools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {isCustomPool && (
              <button
                className="card-btn"
                onClick={() => handleRemovePool(poolId)}
                title="Remove pool from watchlist"
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #1f2937',
                  padding: '0 12px',
                  height: 36,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Remove
              </button>
            )}
            <button
              className="card-btn"
              onClick={() => setInvertPrice((v) => !v)}
              style={{
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                padding: '8px 14px',
                height: 36,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Invert
            </button>
            <button
              className="primary-btn"
              onClick={refetch}
              disabled={isLoading || isRefreshing}
              style={{
                background: '#22d3ee',
                color: '#030712',
                border: 'none',
                padding: '8px 16px',
                height: 36,
                borderRadius: 8,
                fontWeight: 600,
                cursor: isLoading || isRefreshing ? 'wait' : 'pointer',
              }}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={addInput}
              onChange={(e) => {
                setAddInput(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPool()}
              placeholder="Add pool address (0x...)"
              style={{
                background: '#0b1220',
                color: '#e5e7eb',
                border: `1px solid ${addError ? '#ef4444' : '#1f2937'}`,
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                width: 260,
                fontFamily: 'ui-monospace, monospace',
              }}
            />
            <button
              onClick={handleAddPool}
              style={{
                background: '#0b1220',
                color: '#22d3ee',
                border: '1px solid #22d3ee',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Add
            </button>
            {addError && (
              <span style={{ color: '#ef4444', fontSize: 11 }}>{addError}</span>
            )}
          </div>
        </div>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <PoolIdentityCard pool={pool} data={data} />
        <VenueCard variant={data?.pool.variant} />
        <PoolTypeCard
          tickSpacing={data?.pool.tickSpacing}
          fee={data?.pool.fee}
        />
        <Stat
          label="Price"
          value={currentPrice != null ? formatPrice(currentPrice) : '—'}
          sub={
            data
              ? `${data.tokens[0].symbol} / ${data.tokens[1].symbol}${
                  invertPrice ? ' (inv)' : ''
                }`
              : ''
          }
          hero
        />
      </section>

      <section style={card()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Liquidity Depth</h2>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {data
              ? `${data.ticks.length} initialized ticks · fetched in ${data.elapsedMs}ms`
              : 'loading…'}
            {pendingEvents > 0 && (
              <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                · {pendingEvents} event{pendingEvents === 1 ? '' : 's'} pending
              </span>
            )}
          </div>
        </div>
        {error ? (
          <ErrorPanel error={error} onRetry={refetch} />
        ) : isLoading || !data ? (
          <Multicall3Loader height={360} />
        ) : (
          <DepthChart
            bins={data.bins}
            currentTick={data.pool.tick}
            token0={data.tokens[0]}
            token1={data.tokens[1]}
            invertPrice={invertPrice}
            pairLabel={`${data.tokens[0].symbol}/${data.tokens[1].symbol}`}
          />
        )}
      </section>

      <section style={{ ...card(), marginTop: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Cumulative Depth</h2>
        {error || isLoading || !data ? (
          <Multicall3Loader height={280} label="Computing depth curve…" />
        ) : (
          <CumulativeChart
            bins={data.bins}
            currentTick={data.pool.tick}
            token0={data.tokens[0]}
            token1={data.tokens[1]}
            invertPrice={invertPrice}
          />
        )}
      </section>

      <footer style={{ marginTop: 24, color: '#94a3b8', fontSize: 12 }}>
        RPC:{' '}
        <span className="mono">
          {process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://base-rpc.publicnode.com'}
        </span>{' '}
        · Events from Swap/Mint/Burn trigger auto-refresh.
      </footer>
    </main>
  );
}

function PoolIdentityCard({
  pool,
  data,
}: {
  pool: { address: string; label: string };
  data: ReturnType<typeof useLiquidity>['data'];
}) {
  return (
    <div
      style={card({
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
      })}
    >
      <div
        style={{
          color: '#9ca3af',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 2,
        }}
      >
        Addresses
      </div>
      <AddressRow
        label="Pool"
        address={pool.address}
        explorer={`https://basescan.org/address/${pool.address}`}
      />
      {data?.tokens?.[0] && (
        <AddressRow
          label={data.tokens[0].symbol}
          address={data.tokens[0].address}
          explorer={`https://basescan.org/token/${data.tokens[0].address}`}
        />
      )}
      {data?.tokens?.[1] && (
        <AddressRow
          label={data.tokens[1].symbol}
          address={data.tokens[1].address}
          explorer={`https://basescan.org/token/${data.tokens[1].address}`}
        />
      )}
    </div>
  );
}

function AddressRow({
  label,
  address,
  explorer,
}: {
  label: string;
  address: string;
  explorer: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
        fontSize: 12,
      }}
    >
      <span style={{ color: '#94a3b8', minWidth: 48, fontSize: 11 }}>{label}</span>
      <a
        href={explorer}
        target="_blank"
        rel="noopener noreferrer"
        className="mono"
        style={{ color: '#e5e7eb', textDecoration: 'none' }}
        title={address}
      >
        {shortAddress(address)}
      </a>
      <CopyButton value={address} title={`Copy ${label} address`} />
    </div>
  );
}

function VenueCard({
  variant,
}: {
  variant?: 'uniswap-v3' | 'aerodrome-cl';
}) {
  const venue =
    variant === 'aerodrome-cl'
      ? { name: 'Aerodrome', sub: 'Slipstream CL', Logo: AerodromeLogo }
      : variant === 'uniswap-v3'
      ? { name: 'Uniswap', sub: 'V3', Logo: UniswapLogo }
      : null;

  return (
    <div
      style={card({
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      })}
    >
      <div
        style={{
          color: '#9ca3af',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        Venue
      </div>
      {venue ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <venue.Logo size={24} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#e5e7eb' }}>
              {venue.name}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{venue.sub}</div>
          </div>
        </div>
      ) : (
        <div
          className="mono"
          style={{ fontSize: 20, marginTop: 4, color: '#e5e7eb' }}
        >
          —
        </div>
      )}
    </div>
  );
}

function PoolTypeCard({
  tickSpacing,
  fee,
}: {
  tickSpacing?: number;
  fee?: number;
}) {
  return (
    <div
      style={card({
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      })}
    >
      <div
        style={{
          color: '#9ca3af',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        Pool Type
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, color: '#e5e7eb' }}>
        Concentrated
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
        {tickSpacing != null ? `spacing ${tickSpacing}` : '—'}
        {fee != null ? ` · fee ${(fee / 10_000).toFixed(2)}%` : ''}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  hero = false,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  hero?: boolean;
}) {
  const base = card({ padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' });
  const heroStyles = hero
    ? {
        border: '1px solid rgba(34, 211, 238, 0.3)',
        boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.08) inset',
      }
    : {};
  return (
    <div style={{ ...base, ...heroStyles }}>
      <div style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: hero ? 28 : 20,
          marginTop: 4,
          color: hero ? '#22d3ee' : '#e5e7eb',
          fontWeight: hero ? 600 : 500,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function Skeleton({ height, label }: { height: number; label: string }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        background: 'rgba(31, 41, 55, 0.25)',
        borderRadius: 8,
      }}
    >
      {label}
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ color: '#fca5a5', fontWeight: 600 }}>Failed to fetch ticks</div>
      <div className="mono" style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>
        {error.message}
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 10,
          background: '#ef4444',
          color: '#fff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function card(overrides: Record<string, string | number> = {}) {
  return {
    background: '#0b1220',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 20,
    ...overrides,
  } as React.CSSProperties;
}

function trimBigInt(v: bigint): string {
  const s = v.toString();
  if (s.length <= 10) return s;
  // 1.23e15-style for readability
  const head = s.slice(0, 3);
  return `${head[0]}.${head.slice(1)}e${s.length - 1}`;
}

function formatPrice(p: number): string {
  if (!isFinite(p)) return '∞';
  if (p === 0) return '0';
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const fixed = p.toFixed(6);
  return fixed.replace(/\.?0+$/, '');
}
