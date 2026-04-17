/**
 * tickBitmap.ts — Fetch initialized ticks for a concentrated-liquidity pool
 * on Base. Supports both Uniswap V3 and Aerodrome Slipstream CL (a V3 fork
 * with a smaller slot0 struct and extra tick fields for gauge rewards).
 *
 * Strategy
 * --------
 * 1. Auto-detect pool variant by trying the Uniswap V3 slot0 ABI first and
 *    falling back to Aerodrome on a decode error. The check is cached per
 *    pool address so subsequent refreshes skip it.
 * 2. Read slot0 + liquidity + tickSpacing + fee + token0 + token1 in a
 *    single multicall.
 * 3. Multicall a range of tickBitmap words around the current tick.
 * 4. Multicall `ticks()` on every set bit to pull liquidityNet.
 */

import {
  type Address,
  type PublicClient,
} from 'viem';
import { uniswapV3PoolAbi } from '../abis/uniswapV3Pool';
import { aerodromeCLPoolAbi } from '../abis/aerodromeCLPool';

// --- Types ---------------------------------------------------------------

export type PoolVariant = 'uniswap-v3' | 'aerodrome-cl';

export interface PoolState {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  tickSpacing: number;
  token0: Address;
  token1: Address;
  fee: number;
  variant: PoolVariant;
}

export interface InitializedTick {
  tick: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
}

export interface TickBitmapResult {
  pool: PoolState;
  initializedTicks: InitializedTick[];
  wordRange: { min: number; max: number };
}

// --- Helpers -------------------------------------------------------------

function compressTick(tick: number, spacing: number): number {
  return Math.trunc(tick / spacing);
}

function wordAndBit(compressed: number): { wordPos: number; bitPos: number } {
  const wordPos = compressed >> 8;
  const bitPos = ((compressed % 256) + 256) % 256;
  return { wordPos, bitPos };
}

function decodeWord(wordPos: number, bitmap: bigint): number[] {
  const out: number[] = [];
  if (bitmap === 0n) return out;
  for (let bit = 0; bit < 256; bit++) {
    if ((bitmap >> BigInt(bit)) & 1n) {
      out.push(wordPos * 256 + bit);
    }
  }
  return out;
}

// --- Variant detection ---------------------------------------------------

const variantCache = new Map<Address, PoolVariant>();

/**
 * Try to read slot0 with the Uniswap V3 layout; on decode failure fall back
 * to Aerodrome. The error viem throws for a short return buffer is a
 * PositionOutOfBoundsError inside the multicall — we probe slot0 alone.
 */
/**
 * Heuristic: an error thrown by viem during ABI decoding (wrong return size
 * for the declared outputs) almost always mentions "Position", "bounds",
 * "decode", or "AbiDecode". Anything else — rate limits, timeouts, 5xx —
 * should be surfaced as-is instead of triggering a fallback attempt, so we
 * don't thrash the RPC probing Aerodrome ABI against a pool that's just
 * momentarily unreachable.
 */
function isDecodeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('Position') ||
    msg.includes('out of bounds') ||
    msg.includes('AbiDecode') ||
    msg.includes('decode') ||
    msg.includes('returndata')
  );
}

async function detectVariant(
  client: PublicClient,
  poolAddress: Address,
): Promise<PoolVariant> {
  const cached = variantCache.get(poolAddress);
  if (cached) return cached;

  try {
    await client.readContract({
      address: poolAddress,
      abi: uniswapV3PoolAbi,
      functionName: 'slot0',
    });
    variantCache.set(poolAddress, 'uniswap-v3');
    return 'uniswap-v3';
  } catch (uniErr) {
    // Only try the Aerodrome ABI if the first probe looks like a decode
    // mismatch. Network/rate-limit errors bubble up untouched so retries
    // can succeed on the original ABI.
    if (!isDecodeError(uniErr)) {
      throw uniErr;
    }
    try {
      await client.readContract({
        address: poolAddress,
        abi: aerodromeCLPoolAbi,
        functionName: 'slot0',
      });
      variantCache.set(poolAddress, 'aerodrome-cl');
      return 'aerodrome-cl';
    } catch (aeroErr) {
      if (!isDecodeError(aeroErr)) throw aeroErr;
      throw new Error(
        `Pool ${poolAddress} is neither Uniswap V3 nor Aerodrome CL. ` +
          `Uniswap error: ${(uniErr as Error).message}. ` +
          `Aerodrome error: ${(aeroErr as Error).message}.`,
      );
    }
  }
}

function abiFor(variant: PoolVariant) {
  return variant === 'aerodrome-cl' ? aerodromeCLPoolAbi : uniswapV3PoolAbi;
}

// --- Public API ----------------------------------------------------------

export interface FetchOptions {
  wordRadius?: number;
  /** Skip auto-detection if you already know the variant (saves 1 RPC). */
  variant?: PoolVariant;
  /** Max ticks() per multicall. Lower for strict RPCs (default 20). */
  ticksBatchSize?: number;
  /** Sleep between ticks() batches to avoid rate limits on public RPCs. */
  batchDelayMs?: number;
}

export async function fetchPoolTicks(
  client: PublicClient,
  poolAddress: Address,
  options: FetchOptions = {},
): Promise<TickBitmapResult> {
  const wordRadius = options.wordRadius ?? 5;
  const variant = options.variant ?? (await detectVariant(client, poolAddress));
  const abi = abiFor(variant);

  const baseContract = { address: poolAddress, abi } as const;

  // -- Pass 1: pool state + metadata ---------------------------------------
  const [
    slot0Result,
    liquidityResult,
    tickSpacingResult,
    feeResult,
    token0Result,
    token1Result,
  ] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...baseContract, functionName: 'slot0' },
      { ...baseContract, functionName: 'liquidity' },
      { ...baseContract, functionName: 'tickSpacing' },
      { ...baseContract, functionName: 'fee' },
      { ...baseContract, functionName: 'token0' },
      { ...baseContract, functionName: 'token1' },
    ],
  });

  // slot0 returns a tuple as an array; the first two entries are always
  // sqrtPriceX96 and tick regardless of variant.
  const slot0 = slot0Result as readonly unknown[];
  const sqrtPriceX96 = slot0[0] as bigint;
  const currentTick = Number(slot0[1]);
  const tickSpacing = Number(tickSpacingResult);

  const pool: PoolState = {
    sqrtPriceX96,
    tick: currentTick,
    liquidity: liquidityResult as bigint,
    tickSpacing,
    token0: token0Result as Address,
    token1: token1Result as Address,
    fee: Number(feeResult),
    variant,
  };

  // -- Pass 2: tick bitmap words around the current tick -------------------
  const compressed = compressTick(currentTick, tickSpacing);
  const { wordPos: centerWord } = wordAndBit(compressed);
  const minWord = centerWord - wordRadius;
  const maxWord = centerWord + wordRadius;

  const bitmapCalls = [];
  for (let w = minWord; w <= maxWord; w++) {
    bitmapCalls.push({
      ...baseContract,
      functionName: 'tickBitmap' as const,
      args: [w] as const,
    });
  }

  const bitmapResults = await client.multicall({
    allowFailure: false,
    contracts: bitmapCalls,
  });

  const compressedInitialized: number[] = [];
  bitmapResults.forEach((word, idx) => {
    const wordPos = minWord + idx;
    compressedInitialized.push(...decodeWord(wordPos, word as bigint));
  });

  if (compressedInitialized.length === 0) {
    return {
      pool,
      initializedTicks: [],
      wordRange: { min: minWord, max: maxWord },
    };
  }

  // -- Pass 3: fetch liquidityNet for every initialized tick ---------------
  // Public RPCs (including mainnet.base.org) reject multicalls that grow too
  // large in calldata or exceed the aggregate eth_call gas ceiling. Pools
  // with tight tickSpacing can have hundreds of initialized ticks per word.
  // Chunk the ticks() reads into TICKS_BATCH-sized multicalls and stitch
  // the results back together.
  const TICKS_BATCH = options.ticksBatchSize ?? 20;
  const BATCH_DELAY_MS = options.batchDelayMs ?? 0;
  const absoluteTicks = compressedInitialized.map((c) => c * tickSpacing);
  const tickResults: Array<readonly unknown[]> = [];
  for (let i = 0; i < absoluteTicks.length; i += TICKS_BATCH) {
    if (i > 0 && BATCH_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    const batch = absoluteTicks.slice(i, i + TICKS_BATCH);
    const calls = batch.map((t) => ({
      ...baseContract,
      functionName: 'ticks' as const,
      args: [t] as const,
    }));
    const batchRes = await client.multicall({
      allowFailure: false,
      contracts: calls,
    });
    for (const r of batchRes) tickResults.push(r as readonly unknown[]);
  }

  // `ticks()` layout differs between variants but the first two fields are
  // always liquidityGross (uint128) and liquidityNet (int128). viem returns
  // them as a tuple array in declaration order — safe to index [0] / [1].
  const initializedTicks: InitializedTick[] = tickResults.map((row, i) => ({
    tick: absoluteTicks[i],
    liquidityGross: row[0] as bigint,
    liquidityNet: row[1] as bigint,
  }));

  initializedTicks.sort((a, b) => a.tick - b.tick);

  return {
    pool,
    initializedTicks,
    wordRange: { min: minWord, max: maxWord },
  };
}

export const _internal = { compressTick, wordAndBit, decodeWord };
