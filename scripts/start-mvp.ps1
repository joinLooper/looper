$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

Write-Host "[Looper] Checking pnpm..."
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
  $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
}
if (-not $pnpmCommand) {
  throw "pnpm was not found. Install Node.js LTS and pnpm 10.13.1 first."
}

Write-Host "[Looper] Installing dependencies..."
Invoke-CheckedCommand -FilePath $pnpmCommand.Source -Arguments @("install", "--no-frozen-lockfile") -FailureMessage "Dependency installation failed."

Write-Host "[Looper] Running the MVP verification flow..."
Invoke-CheckedCommand -FilePath $pnpmCommand.Source -Arguments @("test:mvp") -FailureMessage "The MVP verification flow failed. Startup was stopped."

Write-Host "[Looper] Starting Web, Admin, Merchant, and API..."
$process = Start-Process -FilePath $pnpmCommand.Source -ArgumentList @("dev") -PassThru -NoNewWindow

$healthUrl = "http://localhost:4000/health"
$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    if ($process.HasExited) {
      throw "pnpm dev exited before the API became ready."
    }
  }
}

if (-not $ready) {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  throw "The Looper API did not become ready within 30 seconds."
}

$urls = @(
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3001"
)

foreach ($url in $urls) {
  Start-Process $url
}

Write-Host ""
Write-Host "Looper MVP is running:"
Write-Host "Player     http://localhost:3000"
Write-Host "Merchant   http://localhost:3002"
Write-Host "Admin      http://localhost:3001"
Write-Host "API        http://localhost:4000/health"
Write-Host ""
Write-Host "Press Ctrl+C to stop waiting, then stop the pnpm dev process if it is still running."

Wait-Process -Id $process.Id
