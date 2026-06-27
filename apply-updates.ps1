# Chạy script này từ thư mục zerotrustdns
# PS C:\Users\Chung\Desktop\zerotrustdns> .\apply-updates.ps1

$files = @(
  @{ src = "api.ts";         dst = "web\src\services\api.ts" },
  @{ src = "App.tsx";        dst = "web\src\App.tsx" },
  @{ src = "Layout.tsx";     dst = "web\src\components\Layout.tsx" },
  @{ src = "LoginScreen.tsx";dst = "web\src\components\LoginScreen.tsx" },
  @{ src = "PrivacyView.tsx";dst = "web\src\views\PrivacyView\index.tsx" },
  @{ src = "RulesView.tsx";  dst = "web\src\views\RulesView.tsx" },
  @{ src = "index.ts";       dst = "src\index.ts" }
)

$downloadDir = "$env:USERPROFILE\Downloads\zerotrustdns-fix"

foreach ($f in $files) {
  $src = Join-Path $downloadDir $f.src
  $dst = $f.dst
  Copy-Item $src $dst -Force
  Write-Host "Updated $dst"
}

git add -A
git commit -m "Apply UI updates: auto-login, Setup tab, iOS profile, change key, minimal nav"
git push

Write-Host "`nDone! Cloudflare will redeploy automatically."
