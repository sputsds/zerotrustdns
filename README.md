# [ZeroTrustDNS](https://github.com/cflover/zerotrustdns)

Self-hosted DNS-over-HTTPS filter on Cloudflare Workers + D1.
No terminal. No config. Deploy in under 2 minutes.

---

## Option 1 — One-click Deploy (no updates)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cflover/zerotrustdns)

No setup needed. D1 database is created automatically.
You will NOT be able to receive future updates.

---

## Option 2 — Fork and Deploy (recommended)

Get future updates with one click via Sync fork.
Follow the step-by-step guide: [DEPLOY.md](./DEPLOY.md)

---

## DoH endpoint

https://YOUR_WORKER_URL/dns-query

Works on: iOS, Android, macOS, Windows, Firefox, Chrome.
See setup instructions in the Privacy -> Set up tab on the dashboard.

---

## Dashboard

| Tab | Description |
|---|---|
| Privacy | Blocklists + DoH setup guide |
| Allowlist | Always-allow domains |
| Denylist | Always-block domains |
| Analytics | Query stats and block rate |

---

## Optional env vars

| Variable | Default |
|---|---|
| UPSTREAM_DOH | https://security.cloudflare-dns.com/dns-query |
| MAX_LOG_DAYS | 30 |
| SYNC_TIMEOUT_MS | 30000 |
| MAX_LIST_DOMAINS | 500000 |
| BLOOM_FALSE_POSITIVE_RATE | 0.0001 |
