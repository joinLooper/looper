# Fixed W1B local runtime; no arbitrary path parameters.
& (Join-Path $PSScriptRoot 'w1b-pg-runtime.ps1') -Action reset
