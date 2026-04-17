/**
 * wagmi config — read-only public client pointed at Base mainnet.
 *
 * LiquidScout doesn't need wallet connections for the MVP (it's a
 * view-only analytics dashboard), but we still use wagmi so the
 * `useWatchContractEvent` hook is available for push-driven refreshes.
 */

import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';

const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://base-rpc.publicnode.com';

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(BASE_RPC_URL, {
      batch: true, // Coalesce simultaneous reads into JSON-RPC batch requests
    }),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
