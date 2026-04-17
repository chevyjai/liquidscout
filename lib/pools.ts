/**
 * pools.ts — Registered Uniswap V3 pools that LiquidScout tracks on Base.
 *
 * Token decimals are intentionally hard-coded here rather than fetched live:
 * they never change for a deployed ERC-20, and keeping them local avoids an
 * extra 2 RPC calls per page load.
 */

import type { Address } from 'viem';

export interface PoolConfig {
  id: string;
  label: string;
  address: Address;
  /**
   * Decimals for token0 / token1 in the order Uniswap stores them (lower
   * address = token0). If unknown at config time, the dashboard will fall
   * back to fetching them on first load.
   */
  token0Decimals?: number;
  token1Decimals?: number;
  /** Flip the chart to read as token0/token1 instead of token1/token0. */
  invertPrice?: boolean;
  /** Short label shown next to the current-price marker. */
  pairLabel?: string;
}

/**
 * Known Base token addresses. token0/token1 ordering inside the pool is
 * determined by address comparison — USDC (0x8335…) sorts below CHECK
 * (0x9126…) so on the USDC/CHECK pool token0 = USDC (6 decimals), token1 =
 * CHECK (18 decimals). The hook still fetches decimals live as a safety
 * check, but we inline known values so the first render is accurate.
 */
export const BASE_TOKENS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  USDBC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address,
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as Address,
  CHECK: '0x9126236476eFBA9Ad8aB77855c60eB5BF37586Eb' as Address,
};

/**
 * USD-pegged stablecoins on Base used as numeraires for notional pricing.
 * If either side of a pool is in this set, notional values are expressed
 * in that token's units — otherwise we fall back to a generic "token0
 * units" label. Keep the set lowercased for case-insensitive comparison.
 */
export const USD_LIKE_TOKENS: ReadonlySet<string> = new Set(
  [BASE_TOKENS.USDC, BASE_TOKENS.USDBC, BASE_TOKENS.USDT, BASE_TOKENS.DAI].map(
    (a) => a.toLowerCase(),
  ),
);

export function isUsdLike(address: string): boolean {
  return USD_LIKE_TOKENS.has(address.toLowerCase());
}

/**
 * USDC/CHECK on Base — primary target of LiquidScout.
 */
export const USDC_CHECK_POOL: PoolConfig = {
  id: 'usdc-check',
  label: 'USDC / CHECK',
  address: '0x3c4384f3664b37a3cb5a5cb3452b4b4a3aa1256f',
  token0Decimals: 6,   // USDC
  token1Decimals: 18,  // CHECK
  pairLabel: 'CHECK per USDC',
};

export const POOLS: PoolConfig[] = [USDC_CHECK_POOL];

export const DEFAULT_POOL = USDC_CHECK_POOL;
