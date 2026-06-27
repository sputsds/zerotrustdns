# DEPLOY.md — ZeroTrustDNS Deployment Guide

> **For AI coding assistants** (Cursor, Copilot, Claude, etc.)
>
> This is the canonical deployment guide for **ZeroTrustDNS** — a self-hosted DNS-over-HTTPS filter running on Cloudflare Workers + D1.
> Walk the user through the option they choose. Never jump straight to steps without confirming which option they want.

---

## ORIENTATION — Read this to the user first

**What is ZeroTrustDNS?**
ZeroTrustDNS is a self-hosted DNS-over-HTTPS (DoH) resolver that runs entirely on Cloudflare's free tier. It consists of:
- A **Cloudflare Worker** — handles DNS queries, applies blocklists/allowlists, logs queries
- A **D1 SQLite database** — stores lists, rules, bloom filter, and query logs
- A **dashboard** (bundled into the Worker) — manage Privacy / Allowlist / Denylist / Analytics

Once deployed, your DoH endpoint is:
```
https://YOUR_WORKER_URL/dns-query
```

Compatible with iOS, Android, macOS, Windows, Firefox, and Chrome.

---

**Ask the user which option they want:**

| | Option 1 — One-click Deploy | Option 2 — Fork and Deploy |
|---|---|---|
| **Terminal required** | No | No |
| **D1 database** | Created automatically | Created on Cloudflare dashboard |
| **Future updates** | ❌ Not possible | ✅ Sync fork → auto-redeploy |
| **Best for** | Just trying it out | Long-term self-hosting |

---

## OPTION 1 — One-click Deploy

> No terminal. No GitHub account needed. D1 is created automatically.
> **Limitation:** you cannot receive future updates from this project.

### Steps

1. Click this button or go to the URL below:

   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cflover/zerotrustdns)

   `https://deploy.workers.cloudflare.com/?url=https://github.com/cflover/zerotrustdns`

2. Log in or create a free Cloudflare account if prompted.
3. Follow the on-screen steps. Cloudflare will automatically create the D1 database and deploy the Worker.
4. When finished, you'll see your Worker URL.

### After deploy

Open the Worker URL in your browser → go to **Privacy → Set up** to configure DoH on your devices.

---

## OPTION 2 — Fork and Deploy (recommended)

> No terminal needed. You connect your GitHub fork to Cloudflare — every future update is a one-click **Sync fork**.

### STEP 1 — Fork the repository

Go to [https://github.com/cflover/zerotrustdns](https://github.com/cflover/zerotrustdns) and click **Fork**. Keep all default settings and confirm.

---

### STEP 2 — Create the D1 database on Cloudflare

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com) and log in (or create a free account).
2. In the left sidebar, click **Storage & Databases → D1 SQL Database**.
3. Click **Create database**.
4. Set the name to exactly: `zerotrustdns_db`
5. Click **Create** and wait for the database to be ready.
6. On the database page, copy the **Database ID** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). You will need this in the next step.

---

### STEP 3 — Add the database ID to your fork

1. Go to your forked repo on GitHub.
2. Open the file `wrangler.toml` and click the **Edit (pencil)** icon.
3. Find this section:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "zerotrustdns_db"
   ```
4. Add your Database ID on the next line:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "zerotrustdns_db"
   database_id = "YOUR_DATABASE_ID_HERE"
   ```
5. Commit the change directly to `main`.

---

### STEP 4 — Deploy via Cloudflare dashboard

1. In the Cloudflare dashboard, go to **Workers & Pages**.
2. Click **Create** → **Import a Worker / Git repository**.
3. Connect your GitHub account if not already connected, then select your forked `zerotrustdns` repo.
4. On the build settings page:
   - **Build command:** `npm run build` *(pre-filled from wrangler.toml, leave as-is)*
   - **Output directory:** leave blank (Worker deployment, not Pages)
5. Click **Save and Deploy**. Cloudflare will build and deploy automatically.
6. When finished, you'll see your Worker URL (e.g. `https://zerotrustdns.YOUR_ACCOUNT.workers.dev`).

---

### STEP 5 — Run the database migration

The D1 database needs its tables created once after the first deploy.

1. In the Cloudflare dashboard, go to **Storage & Databases → D1 SQL Database**.
2. Click on `zerotrustdns_db`.
3. Click the **Console** tab.
4. Copy and paste the contents of `migrations/0000_init.sql` from your fork, then click **Execute**.

This creates the tables: `lists`, `rules`, `bloom_chunks`, `bloom_meta`, `logs`, `kv`.

> ✅ The migration uses `CREATE TABLE IF NOT EXISTS` — safe to run again if needed.

---

### After deploy

Open your Worker URL in a browser → go to **Privacy → Set up** to get the DoH endpoint and setup instructions for your devices.

---

### Getting future updates

1. Go to your fork on GitHub.
2. Click **Sync fork** → **Update branch**.
3. Cloudflare detects the new commit and **redeploys automatically** — nothing else needed.

---

## Optional environment variables

These have sensible defaults. Override them in `wrangler.toml` under `[vars]`:

| Variable | Default | Description |
|---|---|---|
| `UPSTREAM_DOH` | `https://security.cloudflare-dns.com/dns-query` | Upstream DNS resolver |
| `MAX_LOG_DAYS` | `30` | Days of query logs to retain |
| `SYNC_TIMEOUT_MS` | `30000` | Blocklist sync timeout (ms) |
| `MAX_LIST_DOMAINS` | `500000` | Max domains per blocklist |
| `BLOOM_FALSE_POSITIVE_RATE` | `0.0001` | Bloom filter accuracy vs. size |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Cloudflare deploy fails at build | Check that `database_id` is set in `wrangler.toml` in your fork |
| Dashboard returns 404 after deploy | Wait 1–2 minutes and refresh; the first build can be slow |
| D1 tables missing (dashboard errors) | Re-run the migration SQL in the D1 Console tab |
| DoH queries not working | Confirm the Worker URL and use `/dns-query` as the endpoint path |
| Want to apply manual file updates | Use `apply-updates.ps1` (Windows) — commits and pushes to your fork, Cloudflare redeploys automatically |
