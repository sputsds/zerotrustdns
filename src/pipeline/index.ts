import { Env, DNSQuery, ResolutionResult } from "../types";
import { BloomFilter } from "../utils/bloom";
import { BloomStorage } from "../models";
import { injectEcsIntoQuery } from "../utils/dns/injectEcs";
import { dnsCache } from "./cache";

// ── Rules cache type (mirrors the Set/Map index built in index.ts) ────────
// Using Set/Map gives O(1) exact-match lookup instead of an O(n) array .find()
// scan on every single DNS query — matters once a user has hundreds/thousands
// of allow/deny entries.
export interface RulesIndex {
  allowExact: Set<string>;
  blockExact: Set<string>;
}

function findAllowRule(domain: string, idx: RulesIndex): string | null {
  if (idx.allowExact.has(domain)) return domain;
  // Walk parent suffixes: a.b.example.com -> b.example.com -> example.com ...
  let check = domain;
  while (true) {
    const dot = check.indexOf('.');
    if (dot === -1) break;
    check = check.substring(dot + 1);
    if (idx.allowExact.has(check)) return check;
  }
  return null;
}

function findBlockRule(domain: string, idx: RulesIndex): string | null {
  if (idx.blockExact.has(domain)) return domain;
  let check = domain;
  while (true) {
    const dot = check.indexOf('.');
    if (dot === -1) break;
    check = check.substring(dot + 1);
    if (idx.blockExact.has(check)) return check;
  }
  return null;
}

// ── In-memory bloom cache ──────────────────────────────────────────────────
// Same non-blocking-refresh pattern as rules/upstream in index.ts: the bloom
// filter (built from AdGuard + hostsVN lists) is kept in RAM. Once loaded, a
// stale cache triggers a BACKGROUND reload, never a blocking one — so a DNS
// query is never delayed waiting on a D1 round-trip to fetch bloom chunks.

interface BloomCache { filter: BloomFilter; loadedAt: number; refreshing: boolean; }
let cachedBloom: BloomCache | null = null;
const BLOOM_MEM_TTL = 15 * 60 * 1000; // 15 minutes — matches rules TTL

async function loadBloomIntoCache(env: Env): Promise<BloomFilter | null> {
  const storage = new BloomStorage(env.DB);
  const meta = await storage.getMeta();
  if (!meta) { cachedBloom = null; return null; }
  const bits = await storage.loadChunks();
  if (!bits) { cachedBloom = null; return null; }
  const filter = new BloomFilter(meta.size, meta.hashes, bits);
  cachedBloom = { filter, loadedAt: Date.now(), refreshing: false };
  return filter;
}

async function getBloom(env: Env): Promise<BloomFilter | null> {
  if (!cachedBloom) {
    // Cold start only: nothing in RAM yet, must load once.
    return loadBloomIntoCache(env);
  }
  const stale = Date.now() - cachedBloom.loadedAt > BLOOM_MEM_TTL;
  if (stale && !cachedBloom.refreshing) {
    cachedBloom.refreshing = true;
    loadBloomIntoCache(env).catch(() => { if (cachedBloom) cachedBloom.refreshing = false; });
  }
  return cachedBloom.filter;
}

export function invalidateBloomCache() {
  cachedBloom = null;
}

// ── DNS wire format helpers ────────────────────────────────────────────────

function buildNXDOMAIN(query: Uint8Array): Uint8Array {
  const resp = new Uint8Array(query.length);
  resp.set(query);
  resp[2] = 0x81; // QR=1, Opcode=0, AA=0, TC=0, RD=1
  resp[3] = 0x83; // RA=1, RCODE=3 (NXDOMAIN)
  resp[6] = 0; resp[7] = 0; // ANCOUNT=0
  resp[8] = 0; resp[9] = 0; // NSCOUNT=0
  resp[10] = 0; resp[11] = 0; // ARCOUNT=0
  return resp;
}

async function forwardToUpstream(query: Uint8Array, upstreamUrl: string, timeoutMs = 5000, clientIp?: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Inject ECS nếu có client IP
  if (clientIp) {
    const isV6 = clientIp.includes(':');
    const cidr = isV6 ? clientIp + '/48' : clientIp.split('.').slice(0, 3).join('.') + '.0/24';
    query = injectEcsIntoQuery(query, cidr);
  }

  try {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/dns-message', 'Accept': 'application/dns-message' },
      body: query,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// ── Main resolve function ──────────────────────────────────────────────────

export async function resolveDNS(
  query: DNSQuery,
  rules: RulesIndex,
  env: Env
): Promise<ResolutionResult> {
  const domain = query.name.toLowerCase();
  const upstream = env.UPSTREAM_DOH || 'https://qi0w15q016.cloudflare-gateway.com/dns-query';

  // 0. DNS response cache — skip all processing if we've seen this domain recently
  const cacheKey = `${domain}:${query.type}`;
  const cached = dnsCache.get(cacheKey);
  if (cached) {
    return { answer: cached.answer, ttl: 60, action: cached.action, reason: cached.reason };
  }

  // 1. Allow rules (exact + subdomain) — O(1) Set lookups, no array scan
  const allowMatch = findAllowRule(domain, rules);
  if (allowMatch) {
    try {
      const answer = await forwardToUpstream(query.raw, upstream, 5000, query.clientIp);
      const result: ResolutionResult = { answer, ttl: 60, action: 'PASS', reason: `Allowlist: ${allowMatch}` };
      dnsCache.set(cacheKey, { answer, action: 'PASS', reason: result.reason }, 60);
      return result;
    } catch {
      return { answer: new Uint8Array(), ttl: 0, action: 'FAIL', reason: 'Upstream error' };
    }
  }

  // 2. Block rules (exact + subdomain)
  const blockMatch = findBlockRule(domain, rules);
  if (blockMatch) {
    const answer = buildNXDOMAIN(query.raw);
    const reason = `Denylist: ${blockMatch}`;
    dnsCache.set(cacheKey, { answer, action: 'BLOCK', reason }, 60);
    return { answer, ttl: 60, action: 'BLOCK', reason };
  }

  // 3. Bloom filter check (external lists)
  const bloom = await getBloom(env);
  if (bloom) {
    let check = domain;
    while (check) {
      if (bloom.test(check)) {
        const answer = buildNXDOMAIN(query.raw);
        const reason = `Filter list: ${check}`;
        dnsCache.set(cacheKey, { answer, action: 'BLOCK', reason }, 300);
        return { answer, ttl: 60, action: 'BLOCK', reason };
      }
      const dot = check.indexOf('.');
      if (dot === -1) break;
      check = check.substring(dot + 1);
    }
  }

  // 4. Forward
  try {
    const answer = await forwardToUpstream(query.raw, upstream, 5000, query.clientIp);
    dnsCache.set(cacheKey, { answer, action: 'PASS' }, 60);
    return { answer, ttl: 60, action: 'PASS' };
  } catch {
    return { answer: new Uint8Array(), ttl: 0, action: 'FAIL', reason: 'Upstream error' };
  }
}

// ── Parse raw DoH request ──────────────────────────────────────────────────

const TYPE_NAMES: Record<number, string> = { 1: 'A', 28: 'AAAA', 5: 'CNAME', 15: 'MX', 16: 'TXT', 33: 'SRV', 255: 'ANY' };

export async function parseDNSQuery(request: Request): Promise<DNSQuery | null> {
  try {
    let raw: Uint8Array;
    if (request.method === 'POST') {
      raw = new Uint8Array(await request.arrayBuffer());
    } else {
      const dns = new URL(request.url).searchParams.get('dns');
      if (!dns) return null;
      const bin = atob(dns.replace(/-/g, '+').replace(/_/g, '/'));
      raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
    }
    if (raw.length < 12) return null;

    // Parse question section
    let offset = 12;
    let name = '';
    while (offset < raw.length) {
      const len = raw[offset++];
      if (len === 0) break;
      if (name) name += '.';
      name += new TextDecoder().decode(raw.slice(offset, offset + len));
      offset += len;
    }
    const typeNum = (raw[offset] << 8) | raw[offset + 1];
    const type = TYPE_NAMES[typeNum] || String(typeNum);

    const clientIp = request.headers.get("CF-Connecting-IP") || undefined;
    return { name, type, raw, clientIp };
  } catch {
    return null;
  }
}
