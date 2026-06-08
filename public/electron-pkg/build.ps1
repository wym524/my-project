# ============================================================
#  雅思学习空间 - 一键下载并打包脚本
#  用法：在 Windows PowerShell 里运行：
#      iwr http://124.223.86.48:3000/electron-pkg/build.ps1 -OutFile build.ps1 ; .\build.ps1
# ============================================================
$ErrorActionPreference = "Stop"

$Server = "http://124.223.86.48:3000/electron-pkg"
$Dir    = "C:\雅思学习空间-打包"
$Files  = @(
    "package.json",
    "electron-main.js",
    "preload.js",
    "assets/icon.png"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  雅思学习空间 一键打包" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. 检查 Node.js ---
Write-Host "[1/5] 检查 Node.js..."
try {
    $nv = node -v 2>$null
    if ($nv) { Write-Host "    OK: $nv" -ForegroundColor Green }
    else { throw "未检测到 Node.js，请先安装 https://nodejs.org/" }
} catch {
    Write-Host "    ❌ 未检测到 Node.js" -ForegroundColor Red
    Write-Host "    请访问 https://nodejs.org/ 下载安装（LTS 版本）后重新运行本脚本。" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# --- 2. 创建目录并下载文件 ---
Write-Host "[2/5] 创建目录: $Dir"
New-Item -ItemType Directory -Force -Path "$Dir\assets" | Out-Null
Set-Location $Dir

Write-Host "[3/5] 从服务器下载打包文件..."
$Web = New-Object System.Net.WebClient
foreach ($f in $Files) {
    $url  = "$Server/$f"
    $path = "$Dir\$f"
    Write-Host "    下载 $f ..."
    try {
        $Web.DownloadFile($url, $path)
        Write-Host "      OK ($([math]::Round((Get-Item $path).Length / 1KB, 1)) KB)" -ForegroundColor Green
    } catch {
        Write-Host "      ❌ 下载失败: $_" -ForegroundColor Red
        Read-Host "按回车退出"
        exit 1
    }
}

# --- 3. 安装依赖 ---
Write-Host ""
Write-Host "[4/5] 安装 npm 依赖（约 2-5 分钟，请耐心等待）..." -ForegroundColor Yellow
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ❌ npm install 失败，请检查网络" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "    依赖安装完成" -ForegroundColor Green

# --- 4. 打包 ---
Write-Host ""
Write-Host "[5/5] 开始打包 Windows 安装包（约 3-5 分钟）..." -ForegroundColor Yellow
npm run dist:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ❌ 打包失败" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# --- 5. 完成 ---
$Exe = Get-ChildItem "$Dir\dist\*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 打包完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
if ($Exe) {
    Write-Host "  安装包位置: $($Exe.FullName)" -ForegroundColor Cyan
    Write-Host "  文件大小: $([math]::Round($Exe.Length / 1MB, 1)) MB" -ForegroundColor Cyan
    explorer $Exe.DirectoryName
} else {
    Write-Host "  打包产物在 $Dir\dist\ 目录下" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "把 .exe 发给学生，双击安装即可使用。"
Write-Host ""
Read-Host "按回车退出"
