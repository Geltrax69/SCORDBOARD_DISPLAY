# ──────────────────────────────────────────────────────────────────────────────
#  Scoreboard Pro — Windows Launcher (PowerShell)
#  Usage:  .\run.ps1           → start everything (dev mode)
#          .\run.ps1 --stop    → stop all processes
#          .\run.ps1 --prod    → production mode via docker compose
#
#  Requirements: Docker Desktop for Windows  https://www.docker.com/products/docker-desktop/
#  Run once if blocked:  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# ──────────────────────────────────────────────────────────────────────────────
param([string]$Mode = "")

$ErrorActionPreference = "Stop"
$Root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend  = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Log  { param($m) Write-Host "  [run] $m"  -ForegroundColor Cyan   }
function Ok   { param($m) Write-Host "  [ ok] $m"  -ForegroundColor Green  }
function Warn { param($m) Write-Host " [warn] $m"  -ForegroundColor Yellow }
function Err  { param($m) Write-Host "  [err] $m"  -ForegroundColor Red    }
function Step { param($m) Write-Host "`n  -- $m" -ForegroundColor Blue }

function Refresh-Path {
  $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("PATH","User")
}

function Wait-For-Http {
  param([string]$Url, [int]$Retries = 40, [string]$Label = $Url)
  Log "Waiting for $Label…"
  for ($i = 0; $i -lt $Retries; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Detect-Compose {
  try   { docker compose version 2>&1 | Out-Null; return "docker compose" } catch {}
  try   { docker-compose version 2>&1 | Out-Null; return "docker-compose"  } catch {}
  return ""
}

function Invoke-Compose {
  param([string[]]$Args)
  $dc = Detect-Compose
  if ($dc -eq "docker compose") { docker compose @Args }
  elseif ($dc -eq "docker-compose") { docker-compose @Args }
  else { Err "Docker Compose not found."; exit 1 }
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║     🏆  Scoreboard Pro — Dev Run     ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ── --stop ────────────────────────────────────────────────────────────────────
if ($Mode -eq "--stop") {
  Log "Stopping all processes…"
  Get-Process -Name "go" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  try { Invoke-Compose @("stop","postgres") } catch {}
  Ok "Stopped."
  exit 0
}

Step "Checking prerequisites"

# ── 1. Docker ─────────────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Err "Docker not installed. Download Docker Desktop: https://www.docker.com/products/docker-desktop/"
  Start-Process "https://www.docker.com/products/docker-desktop/"
  exit 1
}

$dockerRunning = $false
try { docker info 2>&1 | Out-Null; $dockerRunning = $true } catch {}

if (-not $dockerRunning) {
  Warn "Docker Desktop is not running — attempting to start it…"
  $dockerPaths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  )
  foreach ($p in $dockerPaths) {
    if (Test-Path $p) { Start-Process $p; break }
  }
  Log "Waiting up to 90s for Docker to start…"
  $started = $false
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    try { docker info 2>&1 | Out-Null; $started = $true; break } catch {}
  }
  if (-not $started) {
    Err "Docker didn't start. Open Docker Desktop manually, then re-run this script."
    exit 1
  }
}
Ok "Docker is running: $(docker --version)"

# ── 2. Docker Compose ─────────────────────────────────────────────────────────
$dc = Detect-Compose
if ($dc -eq "") {
  Err "Docker Compose not found. Docker Desktop should include it — make sure it's up to date."
  exit 1
}
Ok "Docker Compose: $dc"

# ── --prod ────────────────────────────────────────────────────────────────────
if ($Mode -eq "--prod") {
  Step "Production Mode"
  Set-Location $Root
  Invoke-Compose @("up","--build","-d")
  Write-Host ""
  Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
  Write-Host "  ║    ✅  Production stack is running!      ║" -ForegroundColor Green
  Write-Host "  ╠══════════════════════════════════════════╣" -ForegroundColor Green
  Write-Host "  ║  App   → http://localhost                ║" -ForegroundColor Green
  Write-Host "  ║  Login : admin@scoreboard.local          ║" -ForegroundColor Green
  Write-Host "  ║  Pass  : Admin@1234                      ║" -ForegroundColor Green
  Write-Host "  ╠══════════════════════════════════════════╣" -ForegroundColor Green
  Write-Host "  ║  Stop: $dc down              ║" -ForegroundColor Green
  Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
  exit 0
}

# ── 3. Go ─────────────────────────────────────────────────────────────────────
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  Warn "Go not found. Installing via winget…"
  $wingetOk = $false
  try {
    winget install GoLang.Go --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    $wingetOk = $true
  } catch {}
  if (-not $wingetOk -or -not (Get-Command go -ErrorAction SilentlyContinue)) {
    Err "Go install failed. Download manually: https://go.dev/dl/"
    Start-Process "https://go.dev/dl/"
    exit 1
  }
}
Ok "Go: $(go version)"

# ── 4. Node.js ────────────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn "Node.js not found. Installing via winget…"
  $wingetOk = $false
  try {
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    $wingetOk = $true
  } catch {}
  if (-not $wingetOk -or -not (Get-Command node -ErrorAction SilentlyContinue)) {
    Err "Node.js install failed. Download manually: https://nodejs.org/"
    Start-Process "https://nodejs.org/"
    exit 1
  }
}
Ok "Node.js: $(node --version)"

# ── 5. .env ───────────────────────────────────────────────────────────────────
$EnvFile    = Join-Path $Backend ".env"
$EnvExample = Join-Path $Root    ".env.example"
if (-not (Test-Path $EnvFile)) {
  Warn "backend\.env missing — copying from .env.example"
  Copy-Item $EnvExample $EnvFile
  Ok "Created backend\.env"
}

# ── 6. Postgres ───────────────────────────────────────────────────────────────
Step "Starting Postgres (Docker)"
Set-Location $Root
Invoke-Compose @("up","postgres","-d")

Log "Waiting for Postgres…"
$pgReady = $false
for ($i = 0; $i -lt 40; $i++) {
  $result = Invoke-Compose @("exec","-T","postgres","pg_isready","-U","scoreboard","-d","scoreboard","-q") 2>&1
  if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $pgReady) { Err "Postgres didn't start. Run: $dc logs postgres"; exit 1 }
Ok "Postgres is ready"

# ── 7. Backend — new window ───────────────────────────────────────────────────
Step "Starting Backend (Go)"
$backendCmd = "Set-Location '$Backend'; Write-Host '[backend] Starting Go server...' -ForegroundColor Magenta; go run ./cmd/server"
$BackendProc = Start-Process powershell -ArgumentList "-NoExit","-Command",$backendCmd -PassThru

if (-not (Wait-For-Http "http://localhost:8080/health" 40 "backend :8080")) {
  Err "Backend didn't start. Check the backend window for errors."
  Stop-Process -Id $BackendProc.Id -ErrorAction SilentlyContinue
  exit 1
}
Ok "Backend ready → http://localhost:8080"

# ── 8. Frontend — new window ──────────────────────────────────────────────────
Step "Starting Frontend (Vite / React)"
Set-Location $Frontend
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
  Warn "node_modules missing — running npm install… (this may take a minute)"
  npm install --legacy-peer-deps --silent
  Ok "npm install done"
}

$frontendCmd = "Set-Location '$Frontend'; Write-Host '[frontend] Starting Vite...' -ForegroundColor Yellow; npm run dev -- --host 0.0.0.0"
$FrontendProc = Start-Process powershell -ArgumentList "-NoExit","-Command",$frontendCmd -PassThru

if (-not (Wait-For-Http "http://localhost:3000" 40 "frontend :3000")) {
  Err "Frontend didn't start. Check the frontend window for errors."
  Stop-Process -Id $FrontendProc.Id -ErrorAction SilentlyContinue
  exit 1
}

# ── Ready ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║          ✅  Everything is running!                ║" -ForegroundColor Green
Write-Host "  ╠════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Admin Dashboard  → http://localhost:3000          ║" -ForegroundColor Green
Write-Host "  ║  Display Screen   → http://localhost:3000/display  ║" -ForegroundColor Green
Write-Host "  ║  Scorer Connect   → http://localhost:3000/connect  ║" -ForegroundColor Green
Write-Host "  ║  Backend API      → http://localhost:8080/api      ║" -ForegroundColor Green
Write-Host "  ╠════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Default login:  admin@scoreboard.local            ║" -ForegroundColor Green
Write-Host "  ║  Password:       Admin@1234                        ║" -ForegroundColor Green
Write-Host "  ╠════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Backend + Frontend are in their own windows.      ║" -ForegroundColor Green
Write-Host "  ║  Close all PowerShell windows to stop.             ║" -ForegroundColor Green
Write-Host "  ╚════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Open browser automatically
Start-Process "http://localhost:3000"

Write-Host "  Press Enter to stop everything..." -ForegroundColor Yellow
Read-Host | Out-Null

Stop-Process -Id $BackendProc.Id  -ErrorAction SilentlyContinue
Stop-Process -Id $FrontendProc.Id -ErrorAction SilentlyContinue
Invoke-Compose @("stop","postgres")
Write-Host "  Stopped. Bye!" -ForegroundColor Cyan
