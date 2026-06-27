import { D1Database } from "@cloudflare/workers-types";
import { Rule, List, QueryLog, BloomMeta } from "../types";

// ── Rules ──────────────────────────────────────────────────────────────────

export class RuleModel {
  constructor(private db: D1Database) {}

  async getAll(): Promise<Rule[]> {
    const { results } = await this.db.prepare("SELECT * FROM rules ORDER BY type, domain").all();
    return results as unknown as Rule[];
  }

  async add(type: 'ALLOW' | 'BLOCK', domain: string): Promise<void> {
    await this.db.prepare("INSERT OR REPLACE INTO rules (type, domain) VALUES (?, ?)")
      .bind(type, domain.toLowerCase().trim()).run();
  }

  async remove(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
  }
}

// ── Lists ──────────────────────────────────────────────────────────────────

export class ListModel {
  constructor(private db: D1Database) {}

  async getAll(): Promise<List[]> {
    const { results } = await this.db.prepare("SELECT * FROM lists ORDER BY name").all();
    return (results as any[]).map(r => ({ ...r, enabled: !!r.enabled })) as List[];
  }

  async add(url: string, name: string, type: 'block' | 'allow' = 'block'): Promise<void> {
    await this.db.prepare("INSERT OR IGNORE INTO lists (url, name, type, enabled) VALUES (?, ?, ?, 1)")
      .bind(url, name, type).run();
  }

  async remove(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM lists WHERE id = ?").bind(id).run();
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.db.prepare("UPDATE lists SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, id).run();
  }

  async updateSyncResult(id: number, domainCount: number, error: string | null): Promise<void> {
    await this.db.prepare(
      "UPDATE lists SET last_synced_at = ?, domain_count = ?, sync_error = ? WHERE id = ?"
    ).bind(Math.floor(Date.now() / 1000), domainCount, error, id).run();
  }
}

// ── Logs ───────────────────────────────────────────────────────────────────

export class LogModel {
  constructor(private db: D1Database) {}

  async add(log: QueryLog): Promise<void> {
    await this.db.prepare(
      "INSERT INTO logs (timestamp, domain, record_type, action, reason) VALUES (?, ?, ?, ?, ?)"
    ).bind(log.timestamp, log.domain, log.record_type, log.action, log.reason ?? null).run();
  }

  async getRecent(limit = 200): Promise<QueryLog[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?"
    ).bind(limit).all();
    return results as unknown as QueryLog[];
  }

  async getStats(sinceTs: number): Promise<{ total: number; blocked: number }> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN action='BLOCK' THEN 1 ELSE 0 END) as blocked FROM logs WHERE timestamp >= ?"
    ).bind(sinceTs).first() as any;
    return { total: row?.total ?? 0, blocked: row?.blocked ?? 0 };
  }

  async cleanup(maxDays: number): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - maxDays * 86400;
    await this.db.prepare("DELETE FROM logs WHERE timestamp < ?").bind(cutoff).run();
  }
}

// ── Bloom Storage ──────────────────────────────────────────────────────────

const CHUNK_SIZE = 450_000; // bytes per D1 chunk (safe under 1MB limit)

export class BloomStorage {
  constructor(private db: D1Database) {}

  async saveMeta(meta: BloomMeta): Promise<void> {
    await this.db.prepare("INSERT OR REPLACE INTO bloom_meta (key, value) VALUES ('meta', ?)")
      .bind(JSON.stringify(meta)).run();
  }

  async getMeta(): Promise<BloomMeta | null> {
    const row = await this.db.prepare("SELECT value FROM bloom_meta WHERE key='meta'").first() as any;
    return row ? JSON.parse(row.value) : null;
  }

  async saveChunks(bitArray: Uint8Array): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.prepare("DELETE FROM bloom_chunks").run();
    let idx = 0;
    for (let offset = 0; offset < bitArray.length; offset += CHUNK_SIZE) {
      const chunk = bitArray.slice(offset, offset + CHUNK_SIZE);
      await this.db.prepare("INSERT INTO bloom_chunks (chunk_index, data, updated_at) VALUES (?, ?, ?)")
        .bind(idx++, chunk, now).run();
    }
  }

  async loadChunks(): Promise<Uint8Array | null> {
    const { results } = await this.db.prepare("SELECT data FROM bloom_chunks ORDER BY chunk_index").all();
    if (!results.length) return null;
    const totalLen = results.reduce((s: number, r: any) => s + (r.data as Uint8Array).length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const row of results as any[]) {
      const chunk = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data);
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }
}

// ── Key Management ─────────────────────────────────────────────────────────

export class KeyModel {
  constructor(private db: D1Database) {}

  /** Returns the stored SHA-256 hash of the access key, or null if not set */
  async getHash(): Promise<string | null> {
    const row = await this.db.prepare("SELECT value FROM kv WHERE key='access_key_hash'").first() as any;
    return row?.value ?? null;
  }

  /** Store a SHA-256 hash of the access key */
  async setHash(hash: string): Promise<void> {
    await this.db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('access_key_hash', ?)")
      .bind(hash).run();
  }

  /** Generate a cryptographically strong random key (64 bytes → 88 char Base64) */
  static generateKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  /** SHA-256 hash a string, returns hex */
  static async hash(key: string): Promise<string> {
    const enc = new TextEncoder().encode(key);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// ── Settings (KV-backed) ───────────────────────────────────────────────────

export class SettingsModel {
  constructor(private db: D1Database) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.prepare('SELECT value FROM kv WHERE key=?').bind(`setting:${key}`).first() as any;
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
      .bind(`setting:${key}`, value).run();
  }
}
