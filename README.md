# ZeroTrustDNS

Self-hosted DNS-over-HTTPS filter on Cloudflare Workers + D1.
No terminal. No config. Fork and deploy in under 2 minutes.

---

## Deploy

**1. Fork** this repo (top-right Fork button)

**2.** Go to [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages -> Create -> Connect to Git**
Select your fork -> click **Deploy**

> Cloudflare automatically builds the project, creates a D1 database, and binds it.

**3. Open your Worker URL**

On first visit, a 64-character access key is shown once only -- save it to a password manager.

---

## DoH endpoint

https://YOUR_WORKER_URL/dns-query

Works on: iOS, Android, macOS, Windows, Firefox, Chrome.
See setup instructions in the **Privacy -> Set up** tab on the dashboard.

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

Override in **Workers -> Settings -> Variables** if needed:

| Variable | Default |
|---|---|
| UPSTREAM_DOH | https://security.cloudflare-dns.com/dns-query |
| MAX_LOG_DAYS | 30 |
| SYNC_TIMEOUT_MS | 30000 |
| MAX_LIST_DOMAINS | 500000 |
| BLOOM_FALSE_POSITIVE_RATE | 0.0001 |
