# ============================================================
#  IELTS Study Space - One-Click Build Script
#  Usage (in Windows PowerShell):
#    powershell -ExecutionPolicy Bypass -File .\build.ps1
# ============================================================
$ErrorActionPreference = "Stop"

$Server = "http://124.223.86.48:3000/electron-pkg"
$Dir    = "C:\ielts-build"
$Files  = @(
    "package.json",
    "electron-main.js",
    "preload.js",
    "assets/icon.png"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  IELTS Study Space - Auto Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check Node.js ---
Write-Host "[1/5] Checking Node.js..."
try {
    $nv = & node -v 2>$null
    if ($nv) { Write-Host "    OK: $nv" -ForegroundColor Green }
    else { throw "Node.js not found" }
} catch {
    Write-Host "    ERROR: Node.js not detected" -ForegroundColor Red
    Write-Host "    Please install Node.js from https://nodejs.org/ (LTS version)" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# --- 2. Create directory and download ---
Write-Host "[2/5] Creating directory: $Dir"
New-Item -ItemType Directory -Force -Path "$Dir\assets" | Out-Null
Set-Location $Dir

Write-Host "[3/5] Downloading files from server..."
$Web = New-Object System.Net.WebClient
foreach ($f in $Files) {
    $url  = "$Server/$f"
    $path = "$Dir\$f"
    Write-Host "    Downloading $f ..."
    try {
        $Web.DownloadFile($url, $path)
        $szKB = [math]::Round((Get-Item $path).Length / 1024, 1)
        Write-Host "      OK ($szKB KB)" -ForegroundColor Green
    } catch {
        Write-Host "      ERROR: $_" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# --- 3. Install dependencies ---
Write-Host ""
Write-Host "[4/5] Installing npm dependencies (takes 2-5 min)..." -ForegroundColor Yellow
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ERROR: npm install failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "    Dependencies installed" -ForegroundColor Green

# --- 4. Build ---
Write-Host ""
Write-Host "[5/5] Building Windows installer (takes 3-5 min)..." -ForegroundColor Yellow
& npm run dist:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ERROR: Build failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# --- 5. Done ---
$Exe = Get-ChildItem "$Dir\dist\*.exe" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending |
       Select-Object -First 1

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SUCCESS - Build finished!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
if ($Exe) {
    $szMB = [math]::Round($Exe.Length / 1048576, 1)
    Write-Host "  Installer: $($Exe.FullName)" -ForegroundColor Cyan
    Write-Host "  Size: $szMB MB" -ForegroundColor Cyan
    Start-Process explorer $Exe.DirectoryName
} else {
    Write-Host "  Output folder: $Dir\dist\" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Send the .exe file to students - they double-click to install."
Write-Host ""
Read-Host "Press Enter to exit"
