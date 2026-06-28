import { Env, Rule } from "./types";
import { RuleModel, ListModel, LogModel, KeyModel, SettingsModel } from "./models";
import { resolveDNS, parseDNSQuery, invalidateBloomCache } from "./pipeline";

// ── Auto-bootstrap DB ──────────────────────────────────────────────────────
// Tự động tạo bảng nếu chưa có — người fork về không cần chạy migration thủ công.

let _dbBootstrapped = false;

async function ensureDB(db: D1Database): Promise<void> {
  if (_dbBootstrapped) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('block','allow')) NOT NULL DEFAULT 'block',
      enabled INTEGER DEFAULT 1,
      last_synced_at INTEGER,
      domain_count INTEGER DEFAULT 0,
      sync_error TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('ALLOW','BLOCK')) NOT NULL,
      domain TEXT NOT NULL UNIQUE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bloom_chunks (
      chunk_index INTEGER PRIMARY KEY,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bloom_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      domain TEXT NOT NULL,
      record_type TEXT NOT NULL,
      action TEXT CHECK(action IN ('PASS','BLOCK')) NOT NULL,
      reason TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_rules_domain ON rules(domain)`),
  ]);
  _dbBootstrapped = true;
}

// ── In-memory caches for hot path (rules + upstream URL) ──────────────────
// CRITICAL FOR LATENCY: the DNS hot path (handleDoH) must NEVER block on a D1
// query. D1 is a real network round-trip (often 50-300ms depending on how far
// the request lands from the D1 primary region) — paying that cost inline on
// a DNS query is what causes random latency spikes >100ms.
//
// Strategy (matches how a pure in-memory edge resolver behaves):
//  - Rules are kept in RAM as Map/Set for O(1) lookup (no array .find() scan).
//  - Soft TTL = 15 minutes: once loaded, we keep serving from RAM and only
//    refresh in the BACKGROUND (ctx.waitUntil) after the TTL passes — the
//    request currently being served is never delayed by the refresh.
//  - "Sync Now" in the UI calls invalidateHotCaches() which forces a
//    synchronous reload on the very next request, so changes are guaranteed
//    to apply immediately when the user explicitly asks for it.

interface RulesCache {
  allowExact: Set<string>;
  blockExact: Set<string>;
  at: number;
  refreshing: boolean;
}
interface UpstreamCache { url: string; at: number; refreshing: boolean; }

let _rulesCache: RulesCache | null = null;
let _upstreamCache: UpstreamCache | null = null;
const HOT_CACHE_TTL = 15 * 60_000; // 15 minutes — see comment above

function buildRuleIndex(rules: Rule[]): Omit<RulesCache, 'at' | 'refreshing'> {
  const allowExact = new Set<string>();
  const blockExact = new Set<string>();
  for (const r of rules) {
    if (r.type === 'ALLOW') allowExact.add(r.domain);
    else blockExact.add(r.domain);
  }
  return { allowExact, blockExact };
}

async function loadRulesIntoCache(db: D1Database): Promise<RulesCache> {
  const rules = await new RuleModel(db).getAll();
  const index = buildRuleIndex(rules);
  const cache: RulesCache = { ...index, at: Date.now(), refreshing: false };
  _rulesCache = cache;
  return cache;
}

// Returns rules immediately from RAM. Only awaits D1 on the very first call
// (cold start) — every call after that is non-blocking, even past the TTL.
async function getCachedRules(db: D1Database): Promise<RulesCache> {
  if (!_rulesCache) {
    // Cold start: nothing in RAM yet, we have to load once.
    return loadRulesIntoCache(db);
  }
  const stale = Date.now() - _rulesCache.at > HOT_CACHE_TTL;
  if (stale && !_rulesCache.refreshing) {
    _rulesCache.refreshing = true;
    // Fire-and-forget background refresh — current request keeps using the
    // (slightly stale) RAM copy and is never delayed by this.
    loadRulesIntoCache(db).catch(() => { if (_rulesCache) _rulesCache.refreshing = false; });
  }
  return _rulesCache;
}

async function loadUpstreamIntoCache(db: D1Database, envDefault: string | undefined): Promise<UpstreamCache> {
  const fromDB = await new SettingsModel(db).get('upstream_doh');
  const url = fromDB || envDefault || 'https://security.cloudflare-dns.com/dns-query';
  const cache: UpstreamCache = { url, at: Date.now(), refreshing: false };
  _upstreamCache = cache;
  return cache;
}

async function getCachedUpstream(db: D1Database, envDefault: string | undefined): Promise<string> {
  if (!_upstreamCache) {
    const c = await loadUpstreamIntoCache(db, envDefault);
    return c.url;
  }
  const stale = Date.now() - _upstreamCache.at > HOT_CACHE_TTL;
  if (stale && !_upstreamCache.refreshing) {
    _upstreamCache.refreshing = true;
    loadUpstreamIntoCache(db, envDefault).catch(() => { if (_upstreamCache) _upstreamCache.refreshing = false; });
  }
  return _upstreamCache.url;
}

// Invalidate hot caches — called after any write to rules/settings, and by
// "Sync Now". Setting to null forces the NEXT request to reload synchronously
// (still just one request pays the cost, not every request like before).
function invalidateHotCaches() {
  _rulesCache = null;
  _upstreamCache = null;
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get('X-Access-Key');
  if (!header) return false;
  const keyModel = new KeyModel(env.DB);
  const storedHash = await keyModel.getHash();
  if (!storedHash) return false;
  const inputHash = await KeyModel.hash(header);
  return inputHash === storedHash;
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

// ── Main fetch handler ─────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Auto-create tables on first request — safe for forked deployments
    await ensureDB(env.DB);

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/dns-query') {
      return handleDoH(request, env, ctx);
    }

    if (pathname === '/api/setup' && request.method === 'POST') {
      return handleSetup(request, env);
    }

    if (pathname === '/api/status' && request.method === 'GET') {
      const keyModel = new KeyModel(env.DB);
      const hash = await keyModel.getHash();
      return json({ initialized: hash !== null });
    }

    if (pathname.startsWith('/api/')) {
      if (!await isAuthenticated(request, env)) return unauthorized();
      return handleAPI(request, env, url);
    }

    // Static SPA fallback
    try {
      let response = await (env as any).ASSETS.fetch(request);
      if (response.status === 404) {
        response = await (env as any).ASSETS.fetch(new Request(url.origin + '/', request));
      }
      return response;
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },

  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    const { handleScheduled } = await import('./cron');
    await handleScheduled(event, env);
  }
};

// ── Setup Handler ─────────────────────────────────────────────────────────

async function handleSetup(_request: Request, env: Env): Promise<Response> {
  const keyModel = new KeyModel(env.DB);
  const existing = await keyModel.getHash();
  if (existing !== null) {
    return json({ error: 'Already initialized' }, 409);
  }
  const newKey = KeyModel.generateKey();
  const hash = await KeyModel.hash(newKey);
  await keyModel.setHash(hash);
  return json({ key: newKey });
}

// ── DoH Handler ───────────────────────────────────────────────────────────

async function handleDoH(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const query = await parseDNSQuery(request);
  if (!query) return new Response('Bad Request', { status: 400 });

  // Rules + upstream are served straight from RAM — never blocks on D1 here.
  // (Background refresh, if needed, happens inside getCachedRules/getCachedUpstream.)
  const rulesCache = await getCachedRules(env.DB);
  const upstreamUrl = await getCachedUpstream(env.DB, env.UPSTREAM_DOH);
  const upstreamEnv = { ...env, UPSTREAM_DOH: upstreamUrl };

  const result = await resolveDNS(query, rulesCache, upstreamEnv);

  if (result.action !== 'FAIL') {
    ctx.waitUntil(
      new LogModel(env.DB).add({
        timestamp: Math.floor(Date.now() / 1000),
        domain: query.name,
        record_type: query.type,
        action: result.action,
        reason: result.reason,
      }).catch(() => {})
    );
  }

  return new Response(result.answer, {
    headers: {
      'Content-Type': 'application/dns-message',
      'Cache-Control': `max-age=${result.ttl}`
    }
  });
}

// ── API Handler ───────────────────────────────────────────────────────────

async function handleAPI(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname, searchParams } = url;
  const ruleModel = new RuleModel(env.DB);
  const listModel = new ListModel(env.DB);
  const logModel = new LogModel(env.DB);

  if (pathname === '/api/rules' && request.method === 'GET') {
    return json(await ruleModel.getAll());
  }
  if (pathname === '/api/rules' && request.method === 'POST') {
    const { type, domain } = await parseBody<{ type: 'ALLOW' | 'BLOCK'; domain: string }>(request);
    if (!['ALLOW', 'BLOCK'].includes(type) || !domain) return json({ error: 'Invalid' }, 400);
    await ruleModel.add(type, domain);
    invalidateHotCaches();
    return json({ ok: true });
  }
  const ruleMatch = pathname.match(/^\/api\/rules\/(\d+)$/);
  if (ruleMatch && request.method === 'DELETE') {
    await ruleModel.remove(Number(ruleMatch[1]));
    invalidateHotCaches();
    return json({ ok: true });
  }

  if (pathname === '/api/lists' && request.method === 'GET') {
    return json(await listModel.getAll());
  }
  if (pathname === '/api/lists' && request.method === 'POST') {
    const { url: listUrl, name, type } = await parseBody<{ url: string; name: string; type?: 'block' | 'allow' }>(request);
    if (!listUrl || !name) return json({ error: 'Invalid' }, 400);
    await listModel.add(listUrl, name, type || 'block');
    return json({ ok: true });
  }
  const listDeleteMatch = pathname.match(/^\/api\/lists\/(\d+)$/);
  if (listDeleteMatch && request.method === 'DELETE') {
    await listModel.remove(Number(listDeleteMatch[1]));
    return json({ ok: true });
  }
  const listPatchMatch = pathname.match(/^\/api\/lists\/(\d+)$/);
  if (listPatchMatch && request.method === 'PATCH') {
    const { enabled } = await parseBody<{ enabled: boolean }>(request);
    await listModel.setEnabled(Number(listPatchMatch[1]), enabled);
    return json({ ok: true });
  }

  if (pathname === '/api/change-key' && request.method === 'POST') {
    const { currentKey, newKey } = await parseBody<{ currentKey: string; newKey: string }>(request);
    if (!newKey || newKey.length < 16) return json({ error: 'Key too short' }, 400);
    if (!currentKey) return json({ error: 'Current key required' }, 400);
    const keyModel = new KeyModel(env.DB);
    const storedHash = await keyModel.getHash();
    const currentHash = await KeyModel.hash(currentKey);
    if (currentHash !== storedHash) return json({ error: 'Current key is incorrect' }, 403);
    const hash = await KeyModel.hash(newKey);
    await keyModel.setHash(hash);
    return json({ ok: true });
  }

  if (pathname === '/api/sync' && request.method === 'POST') {
    const { handleScheduled } = await import('./cron');
    await handleScheduled({} as any, env);
    // "Sync Now" forces everything to take effect immediately: filter lists
    // (bloom) AND any allow/deny rule or upstream change the user made since
    // the last background refresh — the next DNS query reloads all of it.
    invalidateBloomCache();
    invalidateHotCaches();
    return json({ ok: true });
  }

  if (pathname === '/api/logs' && request.method === 'GET') {
    const limit = Math.min(Number(searchParams.get('limit') || '200'), 1000);
    return json(await logModel.getRecent(limit));
  }
  if (pathname === '/api/analytics' && request.method === 'GET') {
    const period = searchParams.get('period') || '24h';
    const periodMap: Record<string, number> = { '24h': 86400, '7d': 604800, '30d': 2592000 };
    const since = Math.floor(Date.now() / 1000) - (periodMap[period] || 86400);
    const stats = await logModel.getStats(since);
    const pct = stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) : 0;
    return json({ ...stats, percent_blocked: pct, period });
  }

  if (pathname === '/api/settings' && request.method === 'GET') {
    const settingsModel = new SettingsModel(env.DB);
    const upstream = await settingsModel.get('upstream_doh');
    return json({ upstream_doh: upstream || env.UPSTREAM_DOH || 'https://security.cloudflare-dns.com/dns-query' });
  }

  if (pathname === '/api/settings' && request.method === 'POST') {
    const { upstream_doh } = await parseBody<{ upstream_doh: string }>(request);
    if (!upstream_doh || !upstream_doh.startsWith('https://')) return json({ error: 'Invalid upstream URL' }, 400);
    const settingsModel = new SettingsModel(env.DB);
    await settingsModel.set('upstream_doh', upstream_doh);
    invalidateHotCaches();
    return json({ ok: true });
  }

  return json({ error: 'Not Found' }, 404);
}
