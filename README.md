# [ZeroTrustDNS](https://github.com/cflover/zerotrustdns)

> 🇬🇧 English | 🇻🇳 [Tiếng Việt](README.vi.md)

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

1. Fork the repo to your account
2. Go to Cloudflare Workers & Pages → Create → connect your forked repo
3. Change the **Deploy command** to `npx wrangler deploy --x-provision`
4. Click **Deploy** → D1 is created automatically, Worker deploys itself
5. Later, click **Sync fork** → Cloudflare will automatically redeploy the latest version

---

## DoH endpoint

https://YOUR_WORKER_URL/dns-query

Works on: iOS, Android, macOS, Windows, Firefox, Chrome.
See setup instructions in the Privacy → Set up tab on the dashboard.

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
