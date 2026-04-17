'use client';

/**
 * CumulativeChart — "How much of each token sits between the current price
 * and any given target price?"
 *
 * How to read it
 * --------------
 * Pick a price on the X axis. The height of the filled area at that X tells
 * you the cumulative token amount a trader would receive while moving the
 * pool price from its current value to that target.
 *
 *   - Right of current price (ASK, green)
 *       Trader is pushing price UP. The bins above current are 100% token0
 *       (USDC here). Swapping token1 (CHECK) IN pulls token0 OUT. The
 *       y-value at price P = total USDC that would leave the pool if price
 *       climbs from current → P.
 *
 *   - Left of current price (BID, orange)
 *       Trader pushes price DOWN. Bins below current are 100% token1
 *       (CHECK). Swapping token0 IN pulls token1 OUT. The y-value at P =
 *       total CHECK that would leave the pool going current → P.
 *
 * Shape reading:
 *   - Steep early rise on one side → thick wall near current price. Price
 *     moves slowly in that direction for a given trade size.
 *   - Flat stretch → thin liquidity. A small imbalance moves price fast.
 *   - Asymmetric heights → market is one-sided (typical for pegged assets
 *     with a stronger floor, or meme tokens with lopsided depth).
 *
 * Unit choice
 * -----------
 * We can't plot USDC and CHECK on the same axis because they have wildly
 * different decimals and market value. We convert BOTH sides to USDC-
 * equivalent notional using the current pool price as the bridge — so the
 * two fills are directly comparable at a glance.
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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

export interface CumulativeChartProps {
  bins: LiquidityBin[];
  currentTick: number;
  token0: TokenInfo;
  token1: TokenInfo;
  invertPrice?: boolean;
  height?: number;
}

interface Point {
  price: number;         // Decimal-adjusted, oriented per invertPrice
  bidValue: number | null; // USDC-equiv of cumulative token1 (null on ask side)
  askValue: number | null; // USDC-equiv of cumulative token0 (null on bid side)
  // Raw amounts for tooltip display
  cumToken0: bigint;
  cumToken1: bigint;
  side: 'bid' | 'current' | 'ask';
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

function formatUsd(v: number): string {
  if (v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

/**
 * Format a notional value prefixed by $ when the numeraire is a stablecoin,
 * otherwise suffixed by the token symbol (e.g. "1.23M WETH").
 */
function formatNotional(v: number, symbol: string): string {
  const isUsd = ['USDC', 'USDbC', 'USDT', 'DAI'].includes(symbol);
  if (isUsd) return formatUsd(v);
  if (v === 0) return `0 ${symbol}`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M ${symbol}`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K ${symbol}`;
  if (v >= 1) return `${v.toFixed(2)} ${symbol}`;
  return `${v.toFixed(4)} ${symbol}`;
}

export function CumulativeChart({
  bins,
  currentTick,
  token0,
  token1,
  invertPrice = false,
  height = 320,
}: CumulativeChartProps) {
  const { points, currentPrice, maxValue, numeraireSymbol } = useMemo(() => {
    if (bins.length === 0) {
      return {
        points: [] as Point[],
        currentPrice: 0,
        maxValue: 0,
        numeraireSymbol: '',
      };
    }

    // Working price orientation — always "token1 per token0" internally.
    // We convert to the user-facing orientation only on output.
    const priceRaw = (tick: number) =>
      tickToPrice(tick, token0.decimals, token1.decimals, false);

    const priceOut = (tick: number) =>
      tickToPrice(tick, token0.decimals, token1.decimals, invertPrice);

    const currentPriceRaw = priceRaw(currentTick);
    // Guard against underflow at extreme ticks (≈ ±887272) where
    // 1.0001^tick can round to 0 or Infinity. Fall back to neutral conversion
    // so the chart still renders rather than NaN-ing out.
    const safePrice = isFinite(currentPriceRaw) && currentPriceRaw > 0 ? currentPriceRaw : 1;

    // Numeraire selection: prefer a USD-pegged token on either side; default
    // to token0 otherwise. The "notional" y-axis shows everything in
    // numeraire units.
    const t0Usd = isUsdLike(token0.address);
    const t1Usd = isUsdLike(token1.address);
    const numeraireIsToken0 = t0Usd || !t1Usd;
    const numeraireSymbol = numeraireIsToken0 ? token0.symbol : token1.symbol;

    const ascending = [...bins].sort((a, b) => a.tickLower - b.tickLower);

    // Compute token amounts per bin (already reflects whether the bin is
    // above/below/straddling the current price — see getTokenAmountsForBin).
    const withAmounts = ascending.map((bin) => ({
      bin,
      ...getTokenAmountsForBin(bin, currentTick),
    }));

    // Walk ASK side (bins at or above current). For each bin boundary going
    // up from current, accumulate token0. Converted into numeraire units on
    // the fly.
    const askPoints: Point[] = [];
    let cumAsk0 = 0n;
    for (const row of withAmounts) {
      if (row.bin.tickUpper <= currentTick) continue; // entirely below
      cumAsk0 += row.amount0;
      const priceAtUpper = priceOut(row.bin.tickUpper);
      const token0Human = Number(cumAsk0) / 10 ** token0.decimals;
      const askValue = numeraireIsToken0
        ? token0Human // already in numeraire units
        : token0Human * safePrice; // convert token0 → token1 (the numeraire)
      askPoints.push({
        price: priceAtUpper,
        bidValue: null,
        askValue,
        cumToken0: cumAsk0,
        cumToken1: 0n,
        side: 'ask',
      });
    }

    // Walk BID side (bins at or below current). Accumulate token1 going
    // DOWN from current.
    const bidPoints: Point[] = [];
    let cumBid1 = 0n;
    for (let i = withAmounts.length - 1; i >= 0; i--) {
      const row = withAmounts[i];
      if (row.bin.tickLower >= currentTick) continue; // entirely above
      cumBid1 += row.amount1;
      const priceAtLower = priceOut(row.bin.tickLower);
      const token1Human = Number(cumBid1) / 10 ** token1.decimals;
      const bidValue = numeraireIsToken0
        ? token1Human / safePrice // convert token1 → token0 (the numeraire)
        : token1Human; // already in numeraire units
      bidPoints.push({
        price: priceAtLower,
        bidValue,
        askValue: null,
        cumToken0: 0n,
        cumToken1: cumBid1,
        side: 'bid',
      });
    }

    // Recharts needs a single sorted array. Origin point (current price,
    // zero depth) stitches the two halves visually.
    const mid: Point = {
      price: priceOut(currentTick),
      bidValue: 0,
      askValue: 0,
      cumToken0: 0n,
      cumToken1: 0n,
      side: 'current',
    };

    // When invertPrice flips the price axis, the ordering of bid/ask by
    // X-coordinate flips too — bid points now have higher X than ask. Sort
    // the merged array by numeric price so Recharts draws left→right cleanly.
    const merged = [...bidPoints, mid, ...askPoints].sort(
      (a, b) => a.price - b.price,
    );

    const max = merged.reduce((m, p) => {
      const v = Math.max(p.bidValue ?? 0, p.askValue ?? 0);
      return v > m ? v : m;
    }, 0);

    return {
      points: merged,
      currentPrice: priceOut(currentTick),
      maxValue: max,
      numeraireSymbol,
    };
  }, [bins, currentTick, token0, token1, invertPrice]);

  if (points.length <= 1) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
        }}
      >
        Not enough liquidity data on both sides of the current price.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 24, right: 24, left: 64, bottom: 24 }}>
          <defs>
            <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatPrice}
            stroke="#334155"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          />
          <YAxis
            stroke="#334155"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickFormatter={(v: number) => formatNotional(v, numeraireSymbol)}
            domain={[0, maxValue * 1.05]}
            label={{
              value: `Depth (${numeraireSymbol}-equiv)`,
              angle: -90,
              position: 'insideLeft',
              offset: -48,
              style: { textAnchor: 'middle' },
              fill: '#94a3b8',
              fontSize: 12,
            }}
          />
          <Tooltip
            cursor={{ stroke: '#22d3ee', strokeOpacity: 0.4 }}
            content={(props: any) => {
              if (!props?.active || !props?.payload?.length) return null;
              const p = props.payload[0].payload as Point;
              return (
                <DepthTooltip
                  point={p}
                  token0={token0}
                  token1={token1}
                  currentPrice={currentPrice}
                  numeraireSymbol={numeraireSymbol}
                />
              );
            }}
          />
          <ReferenceLine
            x={currentPrice}
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
          <Area
            type="stepAfter"
            dataKey="bidValue"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#bidFill)"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Area
            type="stepAfter"
            dataKey="askValue"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#askFill)"
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DepthTooltip({
  point,
  token0,
  token1,
  currentPrice,
  numeraireSymbol,
}: {
  point: Point;
  token0: TokenInfo;
  token1: TokenInfo;
  currentPrice: number;
  numeraireSymbol: string;
}) {
  const isAsk = point.side === 'ask';
  const isBid = point.side === 'bid';
  const label = isAsk
    ? `Move price ${formatPrice(currentPrice)} → ${formatPrice(point.price)}`
    : isBid
    ? `Move price ${formatPrice(currentPrice)} → ${formatPrice(point.price)}`
    : `Current price · ${formatPrice(currentPrice)}`;

  return (
    <div
      style={{
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#e5e7eb',
        fontSize: 12,
        minWidth: 240,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div style={{ color: isAsk ? '#10b981' : isBid ? '#f97316' : '#9ca3af', marginBottom: 6 }}>
        {isAsk ? '▲ Ask side' : isBid ? '▼ Bid side' : '● Current'}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      {point.side !== 'current' && (
        <>
          <div style={{ color: '#9ca3af', marginBottom: 4 }}>
            Cumulative liquidity between current price and here:
          </div>
          {isAsk && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: '#9ca3af' }}>{token0.symbol} received</span>
              <span className="mono">
                {formatTokenAmount(point.cumToken0, token0.decimals)}
              </span>
            </div>
          )}
          {isBid && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: '#9ca3af' }}>{token1.symbol} received</span>
              <span className="mono">
                {formatTokenAmount(point.cumToken1, token1.decimals)}
              </span>
            </div>
          )}
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              color: '#9ca3af',
            }}
          >
            <span>Notional ({numeraireSymbol}-equiv)</span>
            <span className="mono">
              {formatNotional(
                isAsk ? point.askValue ?? 0 : point.bidValue ?? 0,
                numeraireSymbol,
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default CumulativeChart;
