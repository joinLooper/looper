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

function Wait-ForHttp200 {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [int]$MaxAttempts = 45
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        return $true
      }
    } catch {
      if ($Process.HasExited) {
        throw "pnpm dev exited before $Url became ready."
      }
    }
  }

  return $false
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

Write-Host "[Looper] Clearing stale Next.js development caches..."
$nextCachePaths = @(
  "apps/web/.next",
  "apps/admin/.next",
  "apps/merchant/.next"
)
foreach ($cachePath in $nextCachePaths) {
  if (Test-Path $cachePath) {
    Remove-Item -Path $cachePath -Recurse -Force
  }
}

Write-Host "[Looper] Starting Web, Admin, Merchant, and API..."
$process = Start-Process -FilePath $pnpmCommand.Source -ArgumentList @("dev") -PassThru -NoNewWindow

$requiredUrls = @(
  "http://localhost:4000/health",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3002/apply"
)

foreach ($url in $requiredUrls) {
  Write-Host "[Looper] Waiting for $url ..."
  $ready = Wait-ForHttp200 -Url $url -Process $process
  if (-not $ready) {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    throw "$url did not return HTTP 200 within the startup timeout."
  }
}

$urlsToOpen = @(
  "http://localhost:3000",
  "http://localhost:3002/apply",
  "http://localhost:3002",
  "http://localhost:3001"
)

foreach ($url in $urlsToOpen) {
  Start-Process $url
}

Write-Host ""
Write-Host "Looper MVP is running:"
Write-Host "Player             http://localhost:3000"
Write-Host "Merchant Apply     http://localhost:3002/apply"
Write-Host "Merchant Dashboard http://localhost:3002"
Write-Host "Admin              http://localhost:3001"
Write-Host "API                http://localhost:4000/health"
Write-Host ""
Write-Host "All required routes returned HTTP 200."
Write-Host "Press Ctrl+C to stop waiting, then stop the pnpm dev process if it is still running."

Wait-Process -Id $process.Id
