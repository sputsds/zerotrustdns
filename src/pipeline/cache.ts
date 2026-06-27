// Simple in-memory DNS response cache
interface CacheEntry {
  answer: Uint8Array;
  action: 'PASS' | 'BLOCK';
  reason?: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export const dnsCache = {
  get(key: string): CacheEntry | undefined {
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry;
    if (entry) cache.delete(key);
    return undefined;
  },

  set(key: string, entry: Omit<CacheEntry, 'expiresAt'>, ttlSeconds: number): void {
    if (cache.size > 10_000) {
      // Evict oldest 20% when full
      const keys = [...cache.keys()].slice(0, 2000);
      for (const k of keys) cache.delete(k);
    }
    cache.set(key, { ...entry, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
};
