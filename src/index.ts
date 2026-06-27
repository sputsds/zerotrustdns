import { Env } from "./types";
import { RuleModel, ListModel, LogModel, KeyModel } from "./models";
import { resolveDNS, parseDNSQuery } from "./pipeline";

// ── DB Bootstrap (runs CREATE TABLE IF NOT EXISTS on first request) ────────

const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('ALLOW', 'BLOCK')) NOT NULL,
  domain TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS bloom_chunks (
  chunk_index INTEGER PRIMARY KEY,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bloom_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  action TEXT CHECK(action IN ('PASS', 'BLOCK')) NOT NULL,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain);
CREATE INDEX IF NOT EXISTS idx_rules_domain ON rules(domain);
`;

let bootstrapped = false;

async function bootstrapDB(env: Env): Promise<void> {
  if (bootstrapped) return;
  // D1 doesn't support multi-statement exec, split on semicolons
  const stmts = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of stmts) {
    await env.DB.prepare(sql).run();
  }
  bootstrapped = true;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    // Bootstrap DB schema on every cold start (idempotent)
    await bootstrapDB(env);

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/dns-query') {
      return handleDoH(request, env);
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
    await bootstrapDB(env);
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

async function handleDoH(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const query = await parseDNSQuery(request);
  if (!query) return new Response('Bad Request', { status: 400 });

  const ruleModel = new RuleModel(env.DB);
  const logModel = new LogModel(env.DB);
  const rules = await ruleModel.getAll();
  const result = await resolveDNS(query, rules, env);

  if (result.action !== 'FAIL') {
    logModel.add({
      timestamp: Math.floor(Date.now() / 1000),
      domain: query.name,
      record_type: query.type,
      action: result.action,
      reason: result.reason,
    }).catch(() => {});
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
    return json({ ok: true });
  }
  const ruleMatch = pathname.match(/^\/api\/rules\/(\d+)$/);
  if (ruleMatch && request.method === 'DELETE') {
    await ruleModel.remove(Number(ruleMatch[1]));
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
    const { newKey } = await parseBody<{ newKey: string }>(request);
    if (!newKey || newKey.length < 16) return json({ error: 'Key too short' }, 400);
    const keyModel = new KeyModel(env.DB);
    const hash = await KeyModel.hash(newKey);
    await keyModel.setHash(hash);
    return json({ ok: true });
  }

  if (pathname === '/api/sync' && request.method === 'POST') {
    const { handleScheduled } = await import('./cron');
    await handleScheduled({} as any, env);
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

  return json({ error: 'Not Found' }, 404);
}
