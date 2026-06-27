import { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  ASSETS: any;
  UPSTREAM_DOH?: string; // e.g. https://security.cloudflare-dns.com/dns-query
  MAX_LOG_DAYS?: string;
  SYNC_TIMEOUT_MS?: string;
  MAX_LIST_DOMAINS?: string;
  BLOOM_FALSE_POSITIVE_RATE?: string;
}

export interface Rule {
  id: number;
  type: 'ALLOW' | 'BLOCK';
  domain: string;
}

export interface List {
  id: number;
  url: string;
  name: string;
  type: 'block' | 'allow';
  enabled: boolean;
  last_synced_at?: number;
  domain_count?: number;
  sync_error?: string | null;
}

export interface DNSQuery {
  name: string;
  type: string;
  raw: Uint8Array;
}

export interface ResolutionResult {
  answer: Uint8Array;
  ttl: number;
  action: 'PASS' | 'BLOCK' | 'FAIL';
  reason?: string;
}

export interface QueryLog {
  id?: number;
  timestamp: number;
  domain: string;
  record_type: string;
  action: 'PASS' | 'BLOCK';
  reason?: string;
}

export interface BloomMeta {
  size: number;
  hashes: number;
  chunks: number;
}
