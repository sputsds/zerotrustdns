let accessKey = '';

export function setKey(key: string) { accessKey = key; }
export function getKey() { return accessKey; }

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Key': accessKey,
      ...options.headers,
    },
  });
}

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Rule { id: number; type: 'ALLOW' | 'BLOCK'; domain: string; }
export interface List { id: number; url: string; name: string; type: 'block' | 'allow'; enabled: boolean; last_synced_at?: number; domain_count?: number; sync_error?: string | null; }
export interface QueryLog { id: number; timestamp: number; domain: string; record_type: string; action: 'PASS' | 'BLOCK'; reason?: string; }
export interface Analytics { total: number; blocked: number; percent_blocked: number; period: string; }

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  // Setup / auth
  getStatus: () => fetch('/api/status').then(r => r.json()) as Promise<{ initialized: boolean }>,
  setup: () => fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json()) as Promise<{ key?: string; error?: string }>,

  checkAuth: async () => {
    const res = await apiFetch('/api/rules');
    return res.ok;
  },

  // Rules
  getRules: () => get<Rule[]>('/api/rules'),
  addRule: (type: 'ALLOW' | 'BLOCK', domain: string) => post('/api/rules', { type, domain }),
  deleteRule: (id: number) => del(`/api/rules/${id}`),

  // Lists
  getLists: () => get<List[]>('/api/lists'),
  addList: (url: string, name: string, type: 'block' | 'allow' = 'block') => post('/api/lists', { url, name, type }),
  deleteList: (id: number) => del(`/api/lists/${id}`),
  toggleList: (id: number, enabled: boolean) => patch(`/api/lists/${id}`, { enabled }),

  // Logs & Analytics
  getLogs: (limit = 200) => get<QueryLog[]>(`/api/logs?limit=${limit}`),
  getAnalytics: (period = '24h') => get<Analytics>(`/api/analytics?period=${period}`),
};
