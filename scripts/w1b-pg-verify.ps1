$ErrorActionPreference='Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repo
$runtime=Join-Path $repo '.runtime\postgres17'
$marker=Join-Path $runtime 'cluster-owner.json'
$checks=[ordered]@{}
& './scripts/w1b-pg-status.ps1'; if (!$?) { throw 'Initial status failed' }; $checks.initialStatus='PASS'
& './scripts/w1b-pg-stop.ps1'; if (!$?) { throw 'Stop failed' }; $checks.stop='PASS'
if (@(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue).Count) { throw 'Listener remains after stop' }; $checks.portReleased='PASS'
& './scripts/w1b-pg-start.ps1'; if (!$?) { throw 'Restart failed' }; $checks.restart='PASS'
$beforePid=Get-Content -LiteralPath (Join-Path $runtime 'data\postmaster.pid') -TotalCount 1
$original=[IO.File]::ReadAllBytes($marker)
$rejected=$false
try {
  $bad=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
  $bad.data='C:\Program Files\PostgreSQL\data'
  $bad | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
  try { & './scripts/w1b-pg-runtime.ps1' -Action reset } catch { if ($_.Exception.Message -notmatch 'FAIL CLOSED: cluster ownership mismatch') { throw }; $rejected=$true }
} finally { [IO.File]::WriteAllBytes($marker,$original) }
if (!$rejected -or (Get-Content -LiteralPath (Join-Path $runtime 'data\postmaster.pid') -TotalCount 1) -ne $beforePid) { throw 'Ownership guard failed' }; $checks.invalidOwnerResetRejectedWithoutStopping='PASS'
$sentinel=Join-Path $runtime 'data\r0-reset-sentinel.txt'
Set-Content -LiteralPath $sentinel -Value 'R0 reset verification only'
& './scripts/w1b-pg-reset.ps1'; if (!$?) { throw 'Reset failed' }
if (Test-Path -LiteralPath $sentinel) { throw 'Reset did not recreate data' }; $checks.resetFreshCluster='PASS'
& './scripts/w1b-pg-status.ps1'; if (!$?) { throw 'Final status failed' }; $checks.finalStatus='PASS'
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort 55432 | Select-Object LocalAddress,LocalPort)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected network listener' }; $checks.loopbackOnly='PASS'
$size = { param($path) (Get-ChildItem -LiteralPath $path -File -Recurse | Measure-Object Length -Sum).Sum }
$evidence=[ordered]@{observedAt=[DateTime]::UtcNow.ToString('o');checks=$checks;listeners=$listeners;binaryBytes=(& $size (Join-Path $runtime 'binary'));clusterBytes=(& $size (Join-Path $runtime 'data'));diskFreeBytes=(Get-PSDrive C).Free;windowsServices=@(Get-Service | Where-Object {$_.Name -match 'postgres'} | Select-Object Name,Status)}
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'lifecycle-evidence.json') -Encoding UTF8
$evidence | ConvertTo-Json -Depth 6

