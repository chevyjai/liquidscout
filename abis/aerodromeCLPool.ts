/**
 * Aerodrome Slipstream CL pool ABI.
 *
 * Aerodrome's concentrated-liquidity pools on Base (e.g. USDC/CHECK at
 * 0x3c43…256f) are a Uniswap V3 fork with two layout differences that
 * matter for this dashboard:
 *
 *   1. slot0 drops `feeProtocol` → 6 fields instead of 7.
 *   2. `ticks()` adds `stakedLiquidityNet` and `rewardGrowthOutsideX128`
 *      for gauge rewards → 10 fields instead of 8.
 *
 * Bitmap format (tickBitmap, liquidity, tickSpacing, token0, token1, and
 * the Swap/Mint/Burn events) is identical to Uniswap V3.
 */

export const aerodromeCLPoolAbi = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'liquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'tickSpacing',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'int24' }],
  },
  {
    // Aerodrome CL pools expose fee() (uint24) like Uniswap V3.
    type: 'function',
    name: 'fee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tickBitmap',
    stateMutability: 'view',
    inputs: [{ name: 'wordPosition', type: 'int16' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ticks',
    stateMutability: 'view',
    inputs: [{ name: 'tick', type: 'int24' }],
    outputs: [
      { name: 'liquidityGross', type: 'uint128' },
      { name: 'liquidityNet', type: 'int128' },
      { name: 'stakedLiquidityNet', type: 'int128' },
      { name: 'feeGrowthOutside0X128', type: 'uint256' },
      { name: 'feeGrowthOutside1X128', type: 'uint256' },
      { name: 'rewardGrowthOutsideX128', type: 'uint256' },
      { name: 'tickCumulativeOutside', type: 'int56' },
      { name: 'secondsPerLiquidityOutsideX128', type: 'uint160' },
      { name: 'secondsOutside', type: 'uint32' },
      { name: 'initialized', type: 'bool' },
    ],
  },
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: false, name: 'amount0', type: 'int256' },
      { indexed: false, name: 'amount1', type: 'int256' },
      { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
      { indexed: false, name: 'liquidity', type: 'uint128' },
      { indexed: false, name: 'tick', type: 'int24' },
    ],
  },
  {
    type: 'event',
    name: 'Mint',
    inputs: [
      { indexed: false, name: 'sender', type: 'address' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'tickLower', type: 'int24' },
      { indexed: true, name: 'tickUpper', type: 'int24' },
      { indexed: false, name: 'amount', type: 'uint128' },
      { indexed: false, name: 'amount0', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Burn',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'tickLower', type: 'int24' },
      { indexed: true, name: 'tickUpper', type: 'int24' },
      { indexed: false, name: 'amount', type: 'uint128' },
      { indexed: false, name: 'amount0', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
  },
] as const;
