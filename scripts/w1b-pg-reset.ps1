[CmdletBinding()]
param()
# Fixed W1B local runtime; no arbitrary path parameters.
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'w1b-pg-runtime.ps1') -Action reset
