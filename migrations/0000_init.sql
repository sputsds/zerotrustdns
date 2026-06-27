-- ZeroTrustDNS - minimal single-user schema

-- Blocklists / allowlists subscriptions
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('block', 'allow')) NOT NULL DEFAULT 'block',
  enabled INTEGER DEFAULT 1,
  last_synced_at INTEGER,
  domain_count INTEGER DEFAULT 0,
  sync_error TEXT
);

-- Custom allow/deny rules
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('ALLOW', 'BLOCK')) NOT NULL,
  domain TEXT NOT NULL UNIQUE
);

-- Bloom filter storage (chunked)
CREATE TABLE IF NOT EXISTS bloom_chunks (
  chunk_index INTEGER PRIMARY KEY,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Bloom metadata
CREATE TABLE IF NOT EXISTS bloom_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DNS query logs
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  action TEXT CHECK(action IN ('PASS', 'BLOCK')) NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain);
CREATE INDEX IF NOT EXISTS idx_rules_domain ON rules(domain);

-- Key-value store for app settings (e.g. hashed access key)
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
