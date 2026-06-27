# ZeroTrustDNS - Auto Setup Script (Windows)
# Run: .\setup.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ZeroTrustDNS - Auto Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check wrangler
Write-Host "[1/4] Checking wrangler..." -ForegroundColor Yellow
try {
    npx wrangler --version | Out-Null
} catch {
    Write-Host "Installing wrangler..." -ForegroundColor Gray
    npm install -g wrangler
}

# 2. Login Cloudflare
Write-Host ""
Write-Host "[2/4] Login to Cloudflare (browser will open)..." -ForegroundColor Yellow
npx wrangler login

# 3. Create D1 database
Write-Host ""
Write-Host "[3/4] Creating D1 database 'zerotrustdns_db'..." -ForegroundColor Yellow

$output = npx wrangler d1 create zerotrustdns_db 2>&1 | Out-String

# Check if already exists
if ($output -match "already exists") {
    Write-Host "Database already exists, fetching ID..." -ForegroundColor Gray
    $listOutput = npx wrangler d1 list 2>&1 | Out-String
    if ($listOutput -match "zerotrustdns_db\s+([a-f0-9\-]{36})") {
        $dbId = $matches[1]
    }
} elseif ($output -match "database_id\s*=\s*`"([a-f0-9\-]{36})`"") {
    $dbId = $matches[1]
}

if (-not $dbId) {
    # fallback: parse from list
    $listOutput = npx wrangler d1 list 2>&1 | Out-String
    if ($listOutput -match "([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})") {
        $dbId = $matches[1]
    }
}

if (-not $dbId) {
    Write-Host "ERROR: Could not get database_id. Run 'npx wrangler d1 list' manually." -ForegroundColor Red
    exit 1
}

Write-Host "Database ID: $dbId" -ForegroundColor Green

# 4. Update wrangler.toml
Write-Host ""
Write-Host "[4/4] Updating wrangler.toml..." -ForegroundColor Yellow

$toml = Get-Content wrangler.toml -Raw

if ($toml -match "database_id") {
    # Replace existing
    $toml = $toml -replace 'database_id\s*=\s*"[^"]*"', "database_id = `"$dbId`""
} else {
    # Insert after database_name line
    $toml = $toml -replace '(database_name\s*=\s*"zerotrustdns_db")', "`$1`ndatabase_id = `"$dbId`""
}

$toml | Set-Content wrangler.toml -NoNewline

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Now run to deploy:" -ForegroundColor Cyan
Write-Host "   npx wrangler deploy" -ForegroundColor White
Write-Host ""
Write-Host "Then run migration:" -ForegroundColor Cyan
Write-Host "   npx wrangler d1 execute zerotrustdns_db --remote --file=migrations/0000_init.sql" -ForegroundColor White
Write-Host ""
