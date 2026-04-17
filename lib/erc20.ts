import type { Address, PublicClient } from 'viem';

export const erc20Abi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export interface TokenMeta {
  address: Address;
  symbol: string;
  decimals: number;
}

export async function fetchTokenMeta(
  client: PublicClient,
  tokens: Address[],
): Promise<TokenMeta[]> {
  if (tokens.length === 0) return [];
  const calls = tokens.flatMap((address) => [
    { address, abi: erc20Abi, functionName: 'decimals' as const },
    { address, abi: erc20Abi, functionName: 'symbol' as const },
  ]);
  const results = await client.multicall({ allowFailure: false, contracts: calls });
  return tokens.map((address, i) => ({
    address,
    decimals: Number(results[i * 2]),
    symbol: String(results[i * 2 + 1]),
  }));
}
