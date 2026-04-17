'use client';

/**
 * poolStore — lightweight localStorage-backed registry for tracked pools.
 *
 * Scalability notes (see also the conversation with the user):
 *  - We allow up to MAX_POOLS entries; beyond that the UI becomes
 *    unreadable and the RPC budget gets tight on free tiers.
 *  - Only the currently-selected pool is actively watched for events;
 *    other pools are simply bookmarked addresses on the dropdown.
 *  - Pool variant detection happens lazily on first fetch, so adding an
 *    invalid address costs ~1 RPC call and surfaces an error inline —
 *    it does not poison the list.
 */

import type { Address } from 'viem';
import { POOLS as BUILT_IN_POOLS, type PoolConfig } from './pools';

export const MAX_POOLS = 10;
const STORAGE_KEY = 'liquidscout.pools.v1';

export interface StoredPool extends Pick<PoolConfig, 'id' | 'label' | 'address' | 'pairLabel'> {
  /** User-added pools don't know decimals up-front; let the hook resolve them. */
  token0Decimals?: number;
  token1Decimals?: number;
  userAdded?: boolean;
}

export function loadStoredPools(): StoredPool[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p?.address === 'string');
  } catch {
    return [];
  }
}

export function saveStoredPools(pools: StoredPool[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pools));
  } catch {
    // Silently ignore — localStorage may be disabled.
  }
}

/**
 * Merge the built-in pool list with the user's stored additions. Built-in
 * entries always win (same id) to prevent accidental overrides.
 */
export function resolvePoolList(stored: StoredPool[]): PoolConfig[] {
  const builtInIds = new Set(BUILT_IN_POOLS.map((p) => p.id));
  const extras: PoolConfig[] = stored
    .filter((s) => !builtInIds.has(s.id))
    .map((s) => ({
      id: s.id,
      label: s.label,
      address: s.address as Address,
      pairLabel: s.pairLabel,
      token0Decimals: s.token0Decimals,
      token1Decimals: s.token1Decimals,
    }));
  return [...BUILT_IN_POOLS, ...extras];
}

export function isValidAddress(a: string): a is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(a.trim());
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
