# ZeroTrustDNS
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cflover/zerotrustdns)
Self-hosted DNS-over-HTTPS filter on Cloudflare Workers + D1.  
No terminal. No config. Fork and deploy in under 2 minutes.

---

## Deploy

**1. Fork** this repo on GitHub

**2.** Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages → Create → Import a repository**  
Select your fork → click **Deploy**

> Cloudflare automatically builds the project, creates a D1 database, and binds it. No extra steps.

**3. Open your Worker URL**

On first visit, a 64-character access key is generated and shown **once only** — save it to a password manager. You'll be taken straight to the dashboard.

---

## DoH endpoint

```
https://YOUR_WORKER_URL/dns-query
```

Works on: iOS (Wi-Fi → DNS), Android (Private DNS), macOS, Windows, Firefox, Chrome.

---

## Dashboard

| Tab | Description |
|---|---|
| Privacy | Blocklist subscriptions (AdGuard + hostsVN on by default) |
| Allowlist | Always-allow domains + subdomains |
| Denylist | Always-block domains + subdomains |
| Analytics | Query counts, block rate, recent log |

Lists sync every 30 minutes automatically.

---

## Optional env vars

Override in **Workers → Settings → Variables** if needed:

| Variable | Default |
|---|---|
| `UPSTREAM_DOH` | `https://security.cloudflare-dns.com/dns-query` |
| `MAX_LOG_DAYS` | `30` |
| `SYNC_TIMEOUT_MS` | `30000` |
| `MAX_LIST_DOMAINS` | `500000` |
| `BLOOM_FALSE_POSITIVE_RATE` | `0.0001` |
