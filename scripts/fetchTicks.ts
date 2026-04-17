/**
 * fetchTicks.ts — Standalone runner for the tickBitmap fetcher.
 *
 *   npx tsx scripts/fetchTicks.ts 0xPOOL_ADDRESS
 *
 * Prints pool state + the first few bins of liquidity distribution. Useful
 * for sanity-checking a pool before wiring it into the dashboard.
 */

import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { fetchPoolTicks } from '../lib/tickBitmap';
import { buildLiquidityDistribution, tickToPrice } from '../lib/liquidity';

async function main() {
  const pool = (process.argv[2] ?? '').trim() as Address;
  if (!pool.startsWith('0x') || pool.length !== 42) {
    console.error('Usage: tsx scripts/fetchTicks.ts 0xPoolAddress');
    process.exit(1);
  }

  const rpc = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  const client = createPublicClient({ chain: base, transport: http(rpc) });

  console.log(`Fetching ${pool} via ${rpc}...`);
  const t0 = Date.now();
  // Default to a small window for the public RPC — increase once you set
  // BASE_RPC_URL to a paid provider.
  const wordRadius = Number(process.env.WORD_RADIUS ?? 2);
  const { pool: state, initializedTicks, wordRange } = await fetchPoolTicks(
    client,
    pool,
    { wordRadius, ticksBatchSize: 15, batchDelayMs: 250 },
  );
  const elapsed = Date.now() - t0;

  console.log(`\nPool state (fetched in ${elapsed}ms):`);
  console.log(`  token0:       ${state.token0}`);
  console.log(`  token1:       ${state.token1}`);
  console.log(`  fee:          ${state.fee / 10_000}%`);
  console.log(`  tickSpacing:  ${state.tickSpacing}`);
  console.log(`  current tick: ${state.tick}`);
  console.log(`  L (active):   ${state.liquidity}`);
  console.log(`  word range:   [${wordRange.min}, ${wordRange.max}]`);
  console.log(`  initialized ticks: ${initializedTicks.length}`);

  // Default to USDC(6) / generic token(18) — override via env for specific pools.
  const dec0 = Number(process.env.TOKEN0_DECIMALS ?? 6);
  const dec1 = Number(process.env.TOKEN1_DECIMALS ?? 18);

  const bins = buildLiquidityDistribution(state, initializedTicks, {
    token0Decimals: dec0,
    token1Decimals: dec1,
  });

  console.log(`\nLiquidity distribution (first 10 bins around current price):`);
  const currentPrice = tickToPrice(state.tick, dec0, dec1);
  console.log(`  current price: ${currentPrice.toExponential(6)}`);
  const activeIdx = bins.findIndex((b) => b.isActive);
  const start = Math.max(0, activeIdx - 5);
  const end = Math.min(bins.length, activeIdx + 6);
  for (const b of bins.slice(start, end)) {
    const marker = b.isActive ? ' <-- active' : '';
    console.log(
      `  [${b.tickLower}..${b.tickUpper}]  price ${b.priceLower.toExponential(4)} -> ${b.priceUpper.toExponential(4)}  L=${b.liquidity}${marker}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
