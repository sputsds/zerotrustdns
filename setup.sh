#!/bin/bash
# ZeroTrustDNS - Auto Setup Script (Mac/Linux)
# Run: bash setup.sh

set -e

echo ""
echo "========================================"
echo "   ZeroTrustDNS - Auto Setup"
echo "========================================"
echo ""

# 1. Check wrangler
echo "[1/5] Checking wrangler..."
if ! command -v npx &> /dev/null; then
    echo "ERROR: Node.js/npm not found. Install from https://nodejs.org"
    exit 1
fi

# 2. Login Cloudflare
echo ""
echo "[2/5] Login to Cloudflare (browser will open)..."
npx wrangler login

# 3. Create D1 database
echo ""
echo "[3/5] Creating D1 database 'zerotrustdns_db'..."

OUTPUT=$(npx wrangler d1 create zerotrustdns_db 2>&1 || true)

if echo "$OUTPUT" | grep -q "already exists"; then
    echo "Database already exists, fetching ID..."
    DB_ID=$(npx wrangler d1 list 2>&1 | grep -oE "zerotrustdns_db\s+[a-f0-9-]{36}" | grep -oE "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
else
    DB_ID=$(echo "$OUTPUT" | grep -oE 'database_id = "[a-f0-9-]{36}"' | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}')
fi

if [ -z "$DB_ID" ]; then
    # fallback
    DB_ID=$(npx wrangler d1 list 2>&1 | grep -oE "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" | head -1)
fi

if [ -z "$DB_ID" ]; then
    echo "ERROR: Could not get database_id. Run 'npx wrangler d1 list' manually."
    exit 1
fi

echo "Database ID: $DB_ID"

# 4. Update wrangler.toml
echo ""
echo "[4/5] Updating wrangler.toml..."

if grep -q "database_id" wrangler.toml; then
    sed -i.bak "s/database_id = \"[^\"]*\"/database_id = \"$DB_ID\"/" wrangler.toml
else
    sed -i.bak "/database_name = \"zerotrustdns_db\"/a\\
database_id = \"$DB_ID\"" wrangler.toml
fi

rm -f wrangler.toml.bak

# 5. Run migration against remote D1
echo ""
echo "[5/5] Running database migration..."
npx wrangler d1 execute zerotrustdns_db --remote --file=migrations/0000_init.sql
echo "Migration complete."

echo ""
echo "========================================"
echo "   Setup complete!"
echo "========================================"
echo ""
echo "Now deploy with:"
echo "   npx wrangler deploy"
echo ""
