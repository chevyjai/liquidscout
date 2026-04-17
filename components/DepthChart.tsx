'use client';

/**
 * DepthChart — Per-tick liquidity distribution, Metrix-style.
 *
 * Design
 * ------
 * Each contiguous liquidity bin (interval between two adjacent initialized
 * ticks) is rendered as its own equal-width vertical bar on a categorical
 * X axis. The axis value is the bin's index in tick order, not its numeric
 * price — this keeps the chart readable even when tick spacing produces
 * very uneven price ranges. Price labels are derived from each bar's lower
 * tick and shown on axis ticks and in tooltips.
 *
 * Invert
 * ------
 * When `invertPrice` is true the chart displays token0/token1 instead of
 * token1/token0. To keep "price increasing left-to-right" intact after the
 * inversion we simply reverse the data array — the leftmost bar is now the
 * bin at the highest tick (= lowest inverted price). No axis re-mapping
 * needed.
 */

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LiquidityBin } from '../lib/liquidity';
import {
  tickToPrice,
  getTokenAmountsForBin,
  formatTokenAmount,
} from '../lib/liquidity';
import { isUsdLike } from '../lib/pools';

export interface TokenInfo {
  symbol: string;
  decimals: number;
  address: string;
}

export interface DepthChartProps {
  bins: LiquidityBin[];
  currentTick: number;
  token0: TokenInfo;
  token1: TokenInfo;
  invertPrice?: boolean;
  pairLabel?: string;
  height?: number;
}

function formatPrice(p: number): string {
  if (!isFinite(p)) return '∞';
  if (p === 0) return '0';
  const abs = Math.abs(p);
  // No scientific notation — user prefers plain decimals. Trim trailing
  // zeros so "0.005055000000" doesn't bloat the axis.
  if (abs >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const fixed = p.toFixed(6);
  return fixed.replace(/\.?0+$/, '');
}

interface Row extends LiquidityBin {
  binIndex: number;
  /**
   * Bar height, in USDC-equivalent notional. Derived from the bin's
   * token0/token1 amounts at the current price so neighboring bars are
   * directly comparable — a 2× taller bar means 2× the notional value.
   * This is NOT the raw Uniswap L value; L is not proportional to tokens.
   */
  notionalUsd: number;
  price: number; // Decimal-adjusted price at the lower edge of this bin
  priceUpperAdj: number; // Decimal-adjusted price at the upper edge
  amount0: bigint; // Raw token0 units active in this bin
  amount1: bigint; // Raw token1 units active in this bin
}

/**
 * Normalize uint128 liquidity values into plain `number` for Recharts and
 * pre-compute decimal-adjusted prices. Choose a power-of-10 scale so the
 * largest bar lands in [1, 1e6] — keeps axis labels readable.
 */
function buildRows(
  bins: LiquidityBin[],
  token0: TokenInfo,
  token1: TokenInfo,
  invertPrice: boolean,
  currentTick: number,
): { rows: Row[]; yAxisLabel: string; numeraireSymbol: string } {
  if (bins.length === 0)
    return { rows: [], yAxisLabel: '', numeraireSymbol: '' };

  // Current price in raw (non-inverted) token1/token0 terms. We use this as
  // the numeraire to convert token1 amounts into token0-equivalent so both
  // sides of the chart share a single comparable y-axis unit.
  const priceRaw = tickToPrice(currentTick, token0.decimals, token1.decimals, false);

  // Pick the numeraire side: prefer a USD-pegged token (allowlisted in
  // lib/pools.ts). If neither side is USD-like, fall back to token0 units
  // and label the axis generically.
  const t0Usd = isUsdLike(token0.address);
  const t1Usd = isUsdLike(token1.address);
  const numeraireIsToken0 = t0Usd || !t1Usd; // tie-break: prefer token0
  const numeraireSymbol = numeraireIsToken0 ? token0.symbol : token1.symbol;

  // Walk in tick-ascending order first, then flip the array only at the
  // very end if invertPrice is true. This keeps the active-bin lookup simple.
  const ascending = [...bins].sort((a, b) => a.tickLower - b.tickLower);

  const rows: Row[] = ascending.map((bin, i) => {
    const priceL = tickToPrice(bin.tickLower, token0.decimals, token1.decimals, invertPrice);
    const priceU = tickToPrice(bin.tickUpper, token0.decimals, token1.decimals, invertPrice);
    const { amount0, amount1 } = getTokenAmountsForBin(bin, currentTick);

    const amt0Human = Number(amount0) / 10 ** token0.decimals;
    const amt1Human = Number(amount1) / 10 ** token1.decimals;
    // Convert both sides into the numeraire's units. When token0 is the
    // numeraire: amount1 × (1 / priceRaw). When token1 is the numeraire:
    // amount0 × priceRaw. Guard against priceRaw == 0 at extreme ticks.
    const safePrice = priceRaw > 0 ? priceRaw : 1;
    const notional = numeraireIsToken0
      ? amt0Human + amt1Human / safePrice
      : amt0Human * safePrice + amt1Human;

    return {
      ...bin,
      binIndex: i,
      notionalUsd: notional,
      price: priceL,
      priceUpperAdj: priceU,
      amount0,
      amount1,
    };
  });

  // Flip so chart reads lowest→highest price left→right regardless of
  // whether we inverted. Re-index after reversing.
  const oriented = invertPrice ? [...rows].reverse() : rows;
  oriented.forEach((r, i) => (r.binIndex = i));

  return {
    rows: oriented,
    yAxisLabel: `Notional (${numeraireSymbol}-equiv)`,
    numeraireSymbol,
  };
}

export function DepthChart({
  bins,
  currentTick,
  token0,
  token1,
  invertPrice = false,
  pairLabel,
  height = 360,
}: DepthChartProps) {
  const { rows, yAxisLabel, numeraireSymbol } = useMemo(
    () => buildRows(bins, token0, token1, invertPrice, currentTick),
    [bins, token0, token1, invertPrice, currentTick],
  );

  const currentPrice = useMemo(
    () => tickToPrice(currentTick, token0.decimals, token1.decimals, invertPrice),
    [currentTick, token0.decimals, token1.decimals, invertPrice],
  );

  // Find the index of the bar the current tick falls into. That bar's
  // priceLower is the "current price bar"; the reference line sits between
  // that bar and its neighbor for a cleaner visual.
  const activeIndex = useMemo(() => rows.findIndex((r) => r.isActive), [rows]);

  // Pick a sparse set of axis tick positions so labels don't overlap.
  const axisTicks = useMemo(() => {
    if (rows.length === 0) return [] as number[];
    const maxLabels = 6;
    const step = Math.max(1, Math.floor(rows.length / maxLabels));
    const ticks: number[] = [];
    for (let i = 0; i < rows.length; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== rows.length - 1) ticks.push(rows.length - 1);
    return ticks;
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        No initialized ticks in scanned range.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 16, right: 24, left: 72, bottom: 24 }}
          barCategoryGap={1}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
          <XAxis
            dataKey="binIndex"
            type="number"
            domain={[-0.5, rows.length - 0.5]}
            ticks={axisTicks}
            tickFormatter={(idx: number) => {
              const row = rows[idx];
              return row ? formatPrice(row.price) : '';
            }}
            stroke="#334155"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            label={{
              value: pairLabel
                ? `Price (${pairLabel})`
                : invertPrice
                ? 'Price (token0 / token1)'
                : 'Price (token1 / token0)',
              position: 'insideBottom',
              offset: -10,
              fill: '#94a3b8',
              fontSize: 12,
            }}
          />
          <YAxis
            dataKey="notionalUsd"
            stroke="#334155"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickFormatter={(v: number) => {
              const isUsd = numeraireSymbol === 'USDC' || numeraireSymbol === 'USDbC' || numeraireSymbol === 'USDT' || numeraireSymbol === 'DAI';
              const prefix = isUsd ? '$' : '';
              const suffix = isUsd ? '' : ` ${numeraireSymbol}`;
              if (v === 0) return `${prefix}0${suffix}`;
              if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M${suffix}`;
              if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(0)}K${suffix}`;
              return `${prefix}${v.toFixed(0)}${suffix}`;
            }}
            label={{
              value: yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              offset: -52,
              style: { textAnchor: 'middle' },
              fill: '#94a3b8',
              fontSize: 12,
            }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
            content={(props: any) => {
              if (!props?.active || !props?.payload?.length) return null;
              const row = props.payload[0].payload as Row;
              return (
                <TickTooltip
                  row={row}
                  token0={token0}
                  token1={token1}
                  invertPrice={invertPrice}
                  currentTick={currentTick}
                />
              );
            }}
          />
          {activeIndex >= 0 && (
            <ReferenceLine
              x={activeIndex}
              stroke="#ec4899"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: `Current: ${formatPrice(currentPrice)}`,
                position: 'top',
                fill: '#ec4899',
                fontSize: 12,
              }}
            />
          )}
          <Bar dataKey="notionalUsd" isAnimationActive={false}>
            {rows.map((r) => {
              const color = r.isActive
                ? '#22d3ee'
                : r.tickLower < currentTick
                ? invertPrice
                  ? '#10b981'
                  : '#f97316'
                : invertPrice
                ? '#f97316'
                : '#10b981';
              return <Cell key={r.binIndex} fill={color} fillOpacity={r.isActive ? 1 : 0.75} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Custom tooltip — shows the tick range, price range, and the USDC/CHECK
 * (token0/token1) split at each bin's liquidity position. Uses Uniswap V3
 * position math: a bin whose range is below the current price is 100%
 * token0, above is 100% token1, and straddling bins are a mix determined
 * by the current sqrt price.
 */
function TickTooltip({
  row,
  token0,
  token1,
  invertPrice,
  currentTick,
}: {
  row: Row;
  token0: TokenInfo;
  token1: TokenInfo;
  invertPrice: boolean;
  currentTick: number;
}) {
  const lo = invertPrice ? row.priceUpperAdj : row.price;
  const hi = invertPrice ? row.price : row.priceUpperAdj;
  const amt0 = formatTokenAmount(row.amount0, token0.decimals);
  const amt1 = formatTokenAmount(row.amount1, token1.decimals);

  // Approximate USD-ish total using the current price as a bridge.
  // priceUpperAdj/price are already decimal-adjusted token1/token0 (or the
  // inverse when inverted). This is a rough valuation useful for relative
  // comparison between bins.
  // Naming convention: describe where the bin is relative to the current
  // price. If currentTick is below the bin's tickLower, the bin sits above
  // the current price (position hasn't been entered yet → 100% token0).
  // If currentTick is at or above tickUpper, the bin is below current
  // (position fully converted → 100% token1).
  const rangeLabel =
    currentTick < row.tickLower
      ? `Above current price · 100% ${token0.symbol}`
      : currentTick >= row.tickUpper
      ? `Below current price · 100% ${token1.symbol}`
      : 'In range · mixed';

  return (
    <div
      style={{
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#e5e7eb',
        fontSize: 12,
        minWidth: 220,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
        Tick {row.tickLower} → {row.tickUpper}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        {formatPrice(lo)} → {formatPrice(hi)}
      </div>
      <div style={{ color: row.isActive ? '#22d3ee' : '#94a3b8', fontSize: 11, marginBottom: 8 }}>
        {row.isActive ? '● Active bin · ' : ''}
        {rangeLabel}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ color: '#9ca3af' }}>{token0.symbol}</span>
        <span className="mono">{amt0}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ color: '#9ca3af' }}>{token1.symbol}</span>
        <span className="mono">{amt1}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid #1f2937',
          display: 'flex',
          justifyContent: 'space-between',
          color: '#e5e7eb',
        }}
      >
        <span>Notional</span>
        <span className="mono">
          {row.notionalUsd >= 1_000_000
            ? `$${(row.notionalUsd / 1_000_000).toFixed(2)}M`
            : row.notionalUsd >= 1_000
            ? `$${(row.notionalUsd / 1_000).toFixed(2)}K`
            : `$${row.notionalUsd.toFixed(2)}`}
        </span>
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        <span>Liquidity (L)</span>
        <span className="mono">{trimBigIntDisplay(row.liquidity)}</span>
      </div>
    </div>
  );
}

function trimBigIntDisplay(v: bigint): string {
  const s = v.toString();
  if (s.length <= 8) return s;
  return `${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
}

export default DepthChart;
