# deploy.ps1 - Upload alle MeldGeluidsoverlast files naar ZXCS via SCP
#
# Gebruik:
#   1. Open PowerShell
#   2. cd "$env:USERPROFILE\Documents\meldgeluidsoverlast"
#   3. .\deploy.ps1

# === Configuratie ===
$SshHost = "web0105.zxcs.nl"
$SshPort = 7685
$SshUser = "u59093p57980"
$Webroot = "/home/u59093p57980/domains/meldgeluidsoverlast.nl/public_html/"

$Files = @(
    "klacht-eindhoven.user.js",
    "manifest-binnen.json",
    "manifest-buiten.json",
    "manifest-slaap.json",
    "binnen.html",
    "buiten.html",
    "slaap.html",
    "install.html",
    "start.html",
    "index.html",
    "klacht.html",
    "robots.txt",
    "sitemap.xml",
    "og-image.svg",
    "qr-install.svg",
    "style.css",
    "notify.js",
    "opensky.php",
    ".htaccess"
)
# NOTE: proxy.py wordt NIET gedeployed — dat is een lokale CORS-proxy voor dev only.
#       Op productie regelt opensky.php (PHP) hetzelfde via /api/opensky rewrite.

# === Header ===
Write-Host ""
Write-Host "=== MeldGeluidsoverlast Deploy ===" -ForegroundColor Cyan
Write-Host "Target: $SshUser@$SshHost`:$Webroot" -ForegroundColor Gray
Write-Host ""

# === Check files exist locally ===
$Missing = @()
foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        $Missing += $f
    }
}
if ($Missing.Count -gt 0) {
    Write-Host "FOUT: deze files ontbreken in $(Get-Location):" -ForegroundColor Red
    $Missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# === Upload via scp ===
Write-Host "Uploading $($Files.Count) files..." -ForegroundColor Yellow
$Target = "${SshUser}@${SshHost}:${Webroot}"
$ScpArgs = @("-P", $SshPort) + $Files + $Target

& scp @ScpArgs
$ExitCode = $LASTEXITCODE

Write-Host ""
if ($ExitCode -eq 0) {
    Write-Host "=== Deploy gelukt ===" -ForegroundColor Green
    Write-Host "Live op: https://meldgeluidsoverlast.nl/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Test: open https://meldgeluidsoverlast.nl/binnen.html" -ForegroundColor Gray
} else {
    Write-Host "=== Deploy mislukt (exit code $ExitCode) ===" -