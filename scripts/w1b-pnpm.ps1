[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$oldPath=$env:PATH; $oldCorepack=$env:COREPACK_HOME
try {
  $env:COREPACK_HOME=Join-Path $repo '.runtime\corepack'
  $version=& corepack pnpm@10.13.1 --version
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne '10.13.1') { throw 'Pinned pnpm could not be loaded' }
  $cli=Join-Path $env:COREPACK_HOME 'v1\pnpm\10.13.1\bin\pnpm.cjs'
  if (!(Test-Path -LiteralPath $cli)) { throw 'Unexpected Corepack cache layout' }
  $toolchain=Join-Path $repo '.runtime\toolchain'
  New-Item -ItemType Directory -Force -Path $toolchain | Out-Null
  $node=(Get-Command node.exe).Source
  $shim='@"'+$node+'" "'+$cli+'" %*'
  [IO.File]::WriteAllText((Join-Path $toolchain 'pnpm.cmd'),$shim+"`r`n",[Text.Encoding]::Default)
  $env:PATH=$toolchain+';'+$oldPath
  Push-Location -LiteralPath $repo
  try { & pnpm.cmd @Arguments; $result=$LASTEXITCODE } finally { Pop-Location }
  if ($result -ne 0) { throw "pnpm 10.13.1 failed with exit code $result" }
} finally { $env:PATH=$oldPath; $env:COREPACK_HOME=$oldCorepack }
