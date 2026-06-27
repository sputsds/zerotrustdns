import { Env, Rule } from "./types";
import { RuleModel, ListModel, LogModel, KeyModel, SettingsModel } from "./models";
import { resolveDNS, parseDNSQuery, invalidateBloomCache } from "./pipeline";

// ── In-memory caches for hot path (rules + upstream URL) ──────────────────
// These avoid D1 queries on every DNS request.
// TTL: 60s — rule changes in the UI propagate within 1 minute.

interface RulesCache { rules: Rule[]; at: number; }
interface UpstreamCache { url: string; at: number; }

let _rulesCache: RulesCache | null = null;
let _upstreamCache: UpstreamCache | null = null;
const HOT_CACHE_TTL = 60_000; // 60 seconds

async function getCachedRules(db: D1Database): Promise<Rule[]> {
  if (_rulesCache && Date.now() - _rulesCache.at < HOT_CACHE_TTL) {
    return _rulesCache.rules;
  }
  const rules = await new RuleModel(db).getAll();
  _rulesCache = { rules, at: Date.now() };
  return rules;
}

async function getCachedUpstream(db: D1Database, envDefault: string | undefined): Promise<string> {
  if (_upstreamCache && Date.now() - _upstreamCache.at < HOT_CACHE_TTL) {
    return _upstreamCache.url;
  }
  const fromDB = await new SettingsModel(db).get('upstream_doh');
  const url = fromDB || envDefault || 'https://security.cloudflare-dns.com/dns-query';
  _upstreamCache = { url, at: Date.now() };
  return url;
}

// Invalidate hot caches — called after any write to rules or settings
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
    // NOTE: bootstrapDB() removed from hot path.
    // Run migrations once via: wrangler d1 execute zerotrustdns_db --file=migrations/0000_init.sql --remote

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

  // Use cached rules + upstream — no D1 query on hot path unless cache is stale
  const rules = await getCachedRules(env.DB);
  const upstreamUrl = await getCachedUpstream(env.DB, env.UPSTREAM_DOH);
  const upstreamEnv = { ...env, UPSTREAM_DOH: upstreamUrl };

  const result = await resolveDNS(query, rules, upstreamEnv);

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
    invalidateHotCaches(); // rule mới → clear cache ngay
    return json({ ok: true });
  }
  const ruleMatch = pathname.match(/^\/api\/rules\/(\d+)$/);
  if (ruleMatch && request.method === 'DELETE') {
    await ruleModel.remove(Number(ruleMatch[1]));
    invalidateHotCaches(); // rule bị xoá → clear cache ngay
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
    invalidateBloomCache(); // bloom vừa rebuild → clear
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
    invalidateHotCaches(); // upstream đổi → clear cache ngay
    return json({ ok: true });
  }

  return json({ error: 'Not Found' }, 404);
}
