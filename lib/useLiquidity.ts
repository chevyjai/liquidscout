'use client';

/**
 * useLiquidity — React hook that keeps a pool's tick distribution live.
 *
 * Strategy:
 *   1. On mount (and when poolAddress changes), fetch the full distribution
 *      via fetchPoolTicks + buildLiquidityDistribution.
 *   2. Subscribe to Swap, Mint, and Burn events on that pool. Any event
 *      invalidates the cached data and schedules a refetch. Events fire
 *      often on active pools, so we coalesce bursts with a short debounce.
 *   3. Expose `refetch()` for explicit refresh buttons.
 *
 * Stability: `run` is intentionally decoupled from `data` to avoid a
 * feedback loop (data → run → subscribe → re-fetch → data). Token metadata
 * is cached in a ref keyed by the resolved token0 address, so we skip the
 * extra decimals/symbol multicall on each refresh without making `data` a
 * dep.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePublicClient, useWatchContractEvent } from 'wagmi';
import type { Address } from 'viem';
import { fetchPoolTicks, type InitializedTick, type PoolState } from './tickBitmap';
import {
  buildLiquidityDistribution,
  type DistributionOptions,
  type LiquidityBin,
} from './liquidity';
import { uniswapV3PoolAbi } from '../abis/uniswapV3Pool';
import { fetchTokenMeta, type TokenMeta } from './erc20';

// Swap/Mint/Burn event signatures are identical across both variants —
// Uniswap V3 ABI is sufficient for useWatchContractEvent even on Aerodrome
// CL pools, since viem matches events by topic0 hash.

export interface UseLiquidityArgs {
  poolAddress: Address;
  wordRadius?: number;
  /** Override decimals (otherwise fetched from chain on first load). */
  token0Decimals?: number;
  token1Decimals?: number;
  invertPrice?: boolean;
  /** Coalesce event bursts; events within this window trigger one refetch. */
  debounceMs?: number;
}

export interface LiquiditySnapshot {
  pool: PoolState;
  ticks: InitializedTick[];
  bins: LiquidityBin[];
  tokens: [TokenMeta, TokenMeta];
  fetchedAt: number;
  elapsedMs: number;
}

export interface UseLiquidityResult {
  data: LiquiditySnapshot | null;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refetch: () => void;
  /** Number of events received since last successful fetch. */
  pendingEvents: number;
}

export function useLiquidity(args: UseLiquidityArgs): UseLiquidityResult {
  const {
    poolAddress,
    wordRadius = 5,
    token0Decimals,
    token1Decimals,
    invertPrice,
    debounceMs = 400,
  } = args;

  const client = usePublicClient();
  const [data, setData] = useState<LiquiditySnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingEvents, setPendingEvents] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  /**
   * Token metadata cache. Decimals/symbol are immutable per ERC-20, so we
   * store them in a ref keyed by the resolved token0 address and reuse them
   * across refreshes. Keeping the cache outside React state means `run` is
   * NOT a function of `data`, which breaks the subscription-churn loop the
   * QA review flagged (H1).
   */
  const tokensCache = useRef<
    Map<string, [TokenMeta, TokenMeta]>
  >(new Map());

  const run = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any, isInitial: boolean) => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        if (isInitial) setIsLoading(true);
        else setIsRefreshing(true);

        const t0 = Date.now();
        const { pool, initializedTicks } = await fetchPoolTicks(c, poolAddress, {
          wordRadius,
          ticksBatchSize: 15,
          batchDelayMs: 200,
        });

        const cacheKey = pool.token0.toLowerCase();
        let tokens = tokensCache.current.get(cacheKey);
        if (!tokens) {
          const fetched = (await fetchTokenMeta(c, [pool.token0, pool.token1])) as [
            TokenMeta,
            TokenMeta,
          ];
          tokensCache.current.set(cacheKey, fetched);
          tokens = fetched;
        }

        const opts: DistributionOptions = {
          token0Decimals: token0Decimals ?? tokens[0].decimals,
          token1Decimals: token1Decimals ?? tokens[1].decimals,
          invertPrice,
        };

        const bins = buildLiquidityDistribution(pool, initializedTicks, opts);

        setData({
          pool,
          ticks: initializedTicks,
          bins,
          tokens,
          fetchedAt: Date.now(),
          elapsedMs: Date.now() - t0,
        });
        setError(null);
        setPendingEvents(0);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        inflight.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    // NOTE: no `data` dep — see tokensCache ref above.
    [poolAddress, wordRadius, token0Decimals, token1Decimals, invertPrice],
  );

  // Initial fetch + pool-address-change refetch
  useEffect(() => {
    if (!client) return;
    void run(client, true);
  }, [client, run]);

  const scheduleRefetch = useCallback(() => {
    setPendingEvents((n) => n + 1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (client) void run(client, false);
    }, debounceMs);
  }, [client, run, debounceMs]);

  useWatchContractEvent({
    address: poolAddress,
    abi: uniswapV3PoolAbi,
    eventName: 'Swap',
    onLogs: scheduleRefetch,
  });
  useWatchContractEvent({
    address: poolAddress,
    abi: uniswapV3PoolAbi,
    eventName: 'Mint',
    onLogs: scheduleRefetch,
  });
  useWatchContractEvent({
    address: poolAddress,
    abi: uniswapV3PoolAbi,
    eventName: 'Burn',
    onLogs: scheduleRefetch,
  });

  const refetch = useCallback(() => {
    if (client) void run(client, false);
  }, [client, run]);

  return { data, error, isLoading, isRefreshing, refetch, pendingEvents };
}
