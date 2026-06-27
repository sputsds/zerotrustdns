import { Env, DNSQuery, ResolutionResult, Rule } from "../types";
import { BloomFilter } from "../utils/bloom";
import { LogModel, BloomStorage } from "../models";

// ── In-memory bloom cache ──────────────────────────────────────────────────

let cachedBloom: { filter: BloomFilter; loadedAt: number } | null = null;
const BLOOM_MEM_TTL = 10 * 60 * 1000; // 10 minutes

async function getBloom(env: Env): Promise<BloomFilter | null> {
  if (cachedBloom && Date.now() - cachedBloom.loadedAt < BLOOM_MEM_TTL) {
    return cachedBloom.filter;
  }
  const storage = new BloomStorage(env.DB);
  const meta = await storage.getMeta();
  if (!meta) return null;
  const bits = await storage.loadChunks();
  if (!bits) return null;
  const filter = new BloomFilter(meta.size, meta.hashes, bits);
  cachedBloom = { filter, loadedAt: Date.now() };
  return filter;
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

async function forwardToUpstream(query: Uint8Array, upstreamUrl: string, timeoutMs = 5000): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  rules: Rule[],
  env: Env
): Promise<ResolutionResult> {
  const domain = query.name.toLowerCase();
  const upstream = env.UPSTREAM_DOH || 'https://security.cloudflare-dns.com/dns-query';

  // 1. Allow rules (exact + subdomain)
  const allowRule = rules.find(r => r.type === 'ALLOW' && (domain === r.domain || domain.endsWith(`.${r.domain}`)));
  if (allowRule) {
    try {
      const answer = await forwardToUpstream(query.raw, upstream);
      return { answer, ttl: 60, action: 'PASS', reason: `Allowlist: ${allowRule.domain}` };
    } catch {
      return { answer: new Uint8Array(), ttl: 0, action: 'FAIL', reason: 'Upstream error' };
    }
  }

  // 2. Block rules (exact + subdomain)
  const blockRule = rules.find(r => r.type === 'BLOCK' && (domain === r.domain || domain.endsWith(`.${r.domain}`)));
  if (blockRule) {
    return { answer: buildNXDOMAIN(query.raw), ttl: 60, action: 'BLOCK', reason: `Denylist: ${blockRule.domain}` };
  }

  // 3. Bloom filter check (external lists)
  const bloom = await getBloom(env);
  if (bloom) {
    let check = domain;
    while (check) {
      if (bloom.test(check)) {
        return { answer: buildNXDOMAIN(query.raw), ttl: 60, action: 'BLOCK', reason: `Filter list: ${check}` };
      }
      const dot = check.indexOf('.');
      if (dot === -1) break;
      check = check.substring(dot + 1);
    }
  }

  // 4. Forward
  try {
    const answer = await forwardToUpstream(query.raw, upstream);
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

    return { name, type, raw };
  } catch {
    return null;
  }
}
