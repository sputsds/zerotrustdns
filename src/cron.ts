import { Env } from "./types";
import { ListModel, BloomStorage } from "./models";
import { BloomFilter } from "./utils/bloom";
import { fetchListContent } from "./utils/listFetcher";
import { invalidateBloomCache } from "./pipeline";

export async function handleScheduled(_event: any, env: Env): Promise<void> {
  try {
    await syncLists(env);
  } catch (e) {
    console.error('[Cron] Error:', e);
  }
}

async function syncLists(env: Env): Promise<void> {
  const listModel = new ListModel(env.DB);
  const storage = new BloomStorage(env.DB);
  const timeoutMs = Number(env.SYNC_TIMEOUT_MS) || 30_000;
  const maxDomains = Number(env.MAX_LIST_DOMAINS) || 500_000;
  const falsePositiveRate = Number(env.BLOOM_FALSE_POSITIVE_RATE) || 0.0001;
  const maxBytes = 20 * 1024 * 1024; // 20 MB per list

  const lists = await listModel.getAll();
  const enabledBlockLists = lists.filter(l => l.enabled && l.type === 'block');

  if (enabledBlockLists.length === 0) {
    // Clear bloom if no lists
    await storage.saveMeta({ size: 0, hashes: 0, chunks: 0 });
    return;
  }

  const allDomains = new Set<string>();

  for (const list of enabledBlockLists) {
    const result = await fetchListContent(list.url, maxBytes, timeoutMs);
    await listModel.updateSyncResult(list.id, result.domains.length, result.error);
    if (!result.error) {
      for (const d of result.domains) {
        allDomains.add(d);
        if (allDomains.size >= maxDomains) break;
      }
    }
  }

  if (allDomains.size === 0) return;

  // Build bloom filter
  const bloom = BloomFilter.create(allDomains.size, falsePositiveRate);
  for (const domain of allDomains) {
    bloom.add(domain);
  }

  const packed = bloom.toUint8Array(); // first 8 bytes = header (size + hashes), rest = bitArray
  const size = new DataView(packed.buffer).getUint32(0, true);
  const hashes = new DataView(packed.buffer).getUint32(4, true);
  const bits = packed.slice(8);
  await storage.saveChunks(bits);
  await storage.saveMeta({ size, hashes, chunks: Math.ceil(bits.length / 450_000) });

  invalidateBloomCache();
  console.log(`[Sync] Built bloom with ${allDomains.size} domains`);
}
