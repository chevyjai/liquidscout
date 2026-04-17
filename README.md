# LiquidScout

Real-time per-tick liquidity dashboard for concentrated-liquidity pools on **Base**. Supports Uniswap V3 and Aerodrome Slipstream CL out of the box.

Live: **https://liquidscout.vercel.app**

## What it does

- Fetches every initialized tick around the current price via direct RPC multicall — **no subgraph lag**.
- Renders a Uniswap-style depth chart with per-tick bars sized by token-notional (USDC-equivalent), not raw liquidity `L`.
- Cumulative depth chart showing exactly how much of each token a trader would receive moving price to any target.
- Auto-refreshes on every `Swap` / `Mint` / `Burn` event from the tracked pool.
- Add any Base CL pool by address — variant (Uniswap vs Aerodrome) is auto-detected.

## Stack

- Next.js 14 (App Router) + React 18
- viem + wagmi for blockchain reads and event subscriptions
- Multicall3 for batching (`0xca11bde05977b3631167028862be2a173976ca11`)
- Recharts for the bar and area charts
- Deployed on Vercel

## Run locally

```bash
npm install
cp .env.example .env.local  # optional — set NEXT_PUBLIC_BASE_RPC_URL for a faster RPC
npm run dev                 # http://localhost:3001
```

Quick CLI sanity-check against any pool:

```bash
npm run fetch -- 0xPOOL_ADDRESS
```

## Project layout

```
abis/              # Minimal Uniswap V3 + Aerodrome CL ABIs
lib/
  tickBitmap.ts    # Auto-detects pool variant, fetches slot0/bitmap/ticks
  liquidity.ts     # Right-walk +, left-walk - liquidity sums + V3 token math
  useLiquidity.ts  # React hook with event-triggered refetch
  pools.ts         # Known pools + USD-like token allowlist
components/
  DepthChart.tsx          # Per-tick bars (notional-sized)
  CumulativeChart.tsx     # Bid/ask depth area chart
  Multicall3Loader.tsx    # Playful dino loading animation
app/
  page.tsx         # Single-page dashboard
```

## Notes

- Designed for ~10 tracked pools on a free RPC. For more, set `NEXT_PUBLIC_BASE_RPC_URL` to a paid Alchemy/QuickNode endpoint.
- Decimals & event topic hashes are identical across Uniswap V3 and Aerodrome CL, so event watching works uniformly. Only `slot0` and `ticks()` return shapes differ — handled transparently in `tickBitmap.ts`.
