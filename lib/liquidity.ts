/**
 * liquidity.ts — Concentrated-liquidity math for LiquidScout.
 *
 * Given the pool's currently active liquidity L and the ordered list of
 * initialized ticks with their signed liquidityNet deltas, this module:
 *
 *   1. Walks rightward from the active tick, ADDING liquidityNet at each
 *      tick crossing — the liquidity that is active between tick[i] and
 *      tick[i+1].
 *   2. Walks leftward from the active tick, SUBTRACTING liquidityNet at
 *      each tick crossed in reverse (swap price down = cross tick in the
 *      opposite direction of how it was added).
 *   3. Converts ticks to human prices via Price = 1.0001^tick, adjusted for
 *      token decimals (USDC = 6, CHECK = 18 in the target pool).
 *
 * The output is a sorted array of "bins" — each bin represents a contiguous
 * price range with constant active liquidity, which is exactly what the
 * Uniswap depth chart renders.
 */

import type { InitializedTick, PoolState } from './tickBitmap';

// -- Types ----------------------------------------------------------------

export interface LiquidityBin {
  tickLower: number;
  tickUpper: number;
  priceLower: number; // token1 per token0, decimal-adjusted
  priceUpper: number;
  liquidity: bigint;  // Active L in this range
  isActive: boolean;  // True if the current tick falls inside this bin
}

export interface DistributionOptions {
  /** Decimals of token0 in the pool (e.g. USDC = 6). */
  token0Decimals: number;
  /** Decimals of token1 in the pool (e.g. CHECK = 18). */
  token1Decimals: number;
  /**
   * If true, invert the price so the chart reads "token0 per token1" — e.g.
   * flip a USDC/CHECK pool to display CHECK priced in USDC. Defaults to
   * false (token1 per token0, Uniswap's native orientation).
   */
  invertPrice?: boolean;
}

// -- Tick ↔ Price ---------------------------------------------------------

const TICK_BASE = 1.0001;

/**
 * Uniswap's raw price at a given tick is the *token1/token0 ratio scaled by
 * raw token amounts*, i.e. 1.0001^tick = (rawAmount1 / rawAmount0). To get
 * a human-readable price we need to adjust for decimals:
 *
 *   humanPrice = 1.0001^tick * 10^(decimals0 - decimals1)
 *
 * For USDC/CHECK where token0=USDC(6), token1=CHECK(18) that gives us
 * "CHECK per USDC". If CHECK is token0 and USDC is token1 (address ordering
 * determines this), the formula naturally reverses. Pass invertPrice=true
 * to flip the chart orientation.
 */
export function tickToPrice(
  tick: number,
  token0Decimals: number,
  token1Decimals: number,
  invert = false,
): number {
  // Math.pow is fine here — ticks are bounded to [-887272, 887272] and the
  // result is for display. On-chain math should use sqrtPriceX96 directly.
  const raw = Math.pow(TICK_BASE, tick);
  const adjusted = raw * Math.pow(10, token0Decimals - token1Decimals);
  return invert ? 1 / adjusted : adjusted;
}

// -- Core distribution ----------------------------------------------------

/**
 * Build the liquidity distribution from the active tick + initialized ticks.
 *
 * Inputs must satisfy:
 *   - `initializedTicks` is sorted ascending by `tick`
 *   - `pool.liquidity` is the live L reported by slot0's paired
 *     liquidity() read — i.e. the L active *between* the two initialized
 *     ticks that straddle the current tick.
 *
 * Walk rightward (up in price):
 *     L_{i+1} = L_i + liquidityNet(tick_{i+1})
 *
 * Walk leftward (down in price):
 *     L_{i-1} = L_i - liquidityNet(tick_i)
 *
 * The asymmetry comes from the fact that liquidityNet is defined as the
 * signed change applied when the price crosses the tick *upward*. Going
 * downward we undo that change, so we subtract the boundary we're leaving.
 */
export function buildLiquidityDistribution(
  pool: Pick<PoolState, 'tick' | 'liquidity'>,
  initializedTicks: InitializedTick[],
  opts: DistributionOptions,
): LiquidityBin[] {
  if (initializedTicks.length === 0) return [];

  const { token0Decimals, token1Decimals, invertPrice = false } = opts;
  const priceOf = (t: number) =>
    tickToPrice(t, token0Decimals, token1Decimals, invertPrice);

  // Partition initialized ticks into "below or equal to current" and "above".
  // The `currentTick` may not itself be initialized — we bracket with the
  // nearest initialized tick on each side.
  const { tick: currentTick, liquidity: currentL } = pool;

  // Index of the first initialized tick strictly greater than currentTick.
  let upperIdx = initializedTicks.findIndex((t) => t.tick > currentTick);
  if (upperIdx === -1) upperIdx = initializedTicks.length;
  const lowerIdx = upperIdx - 1; // Last tick <= currentTick; may be -1

  const bins: LiquidityBin[] = [];

  // -- Right walk: from current tick up through each initialized tick -----
  // The "active" bin spans from the last tick at/below current up to the
  // first tick above current. At each upward crossing, L += liquidityNet.
  let L = currentL;
  const activeLower = lowerIdx >= 0 ? initializedTicks[lowerIdx].tick : -Infinity;
  const activeUpper =
    upperIdx < initializedTicks.length ? initializedTicks[upperIdx].tick : Infinity;

  // Active bin — contains the current price
  if (isFinite(activeLower) && isFinite(activeUpper)) {
    bins.push({
      tickLower: activeLower,
      tickUpper: activeUpper,
      priceLower: priceOf(activeLower),
      priceUpper: priceOf(activeUpper),
      liquidity: L,
      isActive: true,
    });
  }

  // Continue walking right from activeUpper onward
  let runningL = L;
  for (let i = upperIdx; i < initializedTicks.length - 1; i++) {
    // Crossing tick i upward adds its liquidityNet
    runningL += initializedTicks[i].liquidityNet;
    const lo = initializedTicks[i].tick;
    const hi = initializedTicks[i + 1].tick;
    bins.push({
      tickLower: lo,
      tickUpper: hi,
      priceLower: priceOf(lo),
      priceUpper: priceOf(hi),
      liquidity: runningL,
      isActive: false,
    });
  }

  // -- Left walk: from active bin downward through each initialized tick --
  // Walking down means we un-cross boundaries — subtract the liquidityNet
  // of the tick we are leaving behind.
  runningL = L;
  for (let i = lowerIdx; i > 0; i--) {
    // Leaving tick i downward reverses the upward crossing
    runningL -= initializedTicks[i].liquidityNet;
    const hi = initializedTicks[i].tick;
    const lo = initializedTicks[i - 1].tick;
    bins.push({
      tickLower: lo,
      tickUpper: hi,
      priceLower: priceOf(lo),
      priceUpper: priceOf(hi),
      liquidity: runningL,
      isActive: false,
    });
  }

  // Sort ascending by tickLower so the chart draws left-to-right.
  bins.sort((a, b) => a.tickLower - b.tickLower);

  // If we inverted price, the price axis now runs in the opposite direction
  // of the tick axis — that's fine, Recharts reads from the x-value field
  // directly and we'll key on price on the chart side.
  return bins;
}

/**
 * getTokenAmountsForBin — split a bin's liquidity into token0/token1 using
 * Uniswap V3's standard position formulas.
 *
 * For a liquidity position with L active between ticks [tL, tU], and the
 * current price `p` (sqrtP = sqrt(p) in raw token ratio terms):
 *
 *   p ≤ pL:  amount0 = L (sqrtU − sqrtL) / (sqrtU · sqrtL);   amount1 = 0
 *   p ≥ pU:  amount0 = 0;                                      amount1 = L (sqrtU − sqrtL)
 *   inside: amount0 = L (sqrtU − sqrtC) / (sqrtU · sqrtC);
 *           amount1 = L (sqrtC − sqrtL)
 *
 * Prices here are in raw token1/token0 units (1.0001^tick, *not* decimal-
 * adjusted) — the returned amounts are raw token units (matching the
 * token's on-chain decimals). Divide by 10^decimals to display.
 *
 * Precision note: we compute via double-precision floats after scaling L
 * down, then scale back up to bigint. The result is accurate to roughly
 * 1e-12 relative error — plenty for tooltip rendering.
 */
export function getTokenAmountsForBin(
  bin: LiquidityBin,
  currentTick: number,
): { amount0: bigint; amount1: bigint } {
  // L can exceed Number.MAX_SAFE_INTEGER (uint128, up to ~3.4e38). Divide
  // down by 1e6 to squeeze it into the double-safe range before doing the
  // sqrt arithmetic, then multiply back on the way out.
  const SCALE_DOWN = 1_000_000n;
  const lSmall = Number(bin.liquidity / SCALE_DOWN);

  // sqrt(1.0001^tick) = 1.0001^(tick/2)
  const sqrtL = Math.pow(TICK_BASE, bin.tickLower / 2);
  const sqrtU = Math.pow(TICK_BASE, bin.tickUpper / 2);

  let amt0Scaled = 0;
  let amt1Scaled = 0;

  if (currentTick < bin.tickLower) {
    amt0Scaled = (lSmall * (sqrtU - sqrtL)) / (sqrtU * sqrtL);
  } else if (currentTick >= bin.tickUpper) {
    amt1Scaled = lSmall * (sqrtU - sqrtL);
  } else {
    const sqrtC = Math.pow(TICK_BASE, currentTick / 2);
    amt0Scaled = (lSmall * (sqrtU - sqrtC)) / (sqrtU * sqrtC);
    amt1Scaled = lSmall * (sqrtC - sqrtL);
  }

  return {
    amount0: BigInt(Math.max(0, Math.round(amt0Scaled))) * SCALE_DOWN,
    amount1: BigInt(Math.max(0, Math.round(amt1Scaled))) * SCALE_DOWN,
  };
}

/**
 * Format a raw token amount (bigint in base units) as a human-readable
 * string with the given decimals. Picks a reasonable number of fractional
 * digits based on magnitude — intended for UI labels, not precise math.
 */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;

  // If the whole part is >= 1, show 2–4 decimals depending on magnitude.
  if (whole > 0n) {
    const wholeNum = Number(whole);
    if (wholeNum >= 1_000_000) return `${(wholeNum / 1e6).toFixed(2)}M`;
    if (wholeNum >= 1_000) return `${(wholeNum / 1e3).toFixed(2)}K`;
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
    return `${whole}.${fracStr}`.replace(/\.?0+$/, '') || whole.toString();
  }

  // Sub-1: find the first significant digit to choose precision.
  const fracStr = frac.toString().padStart(decimals, '0');
  const firstNonZero = fracStr.search(/[1-9]/);
  if (firstNonZero === -1) return '0';
  const precision = Math.min(firstNonZero + 4, decimals);
  return `0.${fracStr.slice(0, precision)}`.replace(/0+$/, '') || '0';
}

/**
 * Helper: compute cumulative-from-active liquidity ("depth to cross"). At
 * each bin on the right side it sums L * (price range) to approximate the
 * notional depth needed to swap up to that price. Useful for area charts.
 *
 * This is an approximation — exact swap math uses sqrt-price integrals.
 * Good enough for UI depth visualization; do NOT use for trade routing.
 */
export function cumulativeDepth(bins: LiquidityBin[]): Array<
  LiquidityBin & { cumulative: number }
> {
  return bins.map((bin) => ({
    ...bin,
    cumulative: Number(bin.liquidity) * (bin.priceUpper - bin.priceLower),
  }));
}
