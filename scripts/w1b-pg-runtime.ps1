[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('init','start','stop','status','reset')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required; this helper does not change execution policy or install a shell' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Join-Path $repo '.runtime\postgres17'
$data = Join-Path $runtime 'data'
$bin = Join-Path $runtime 'binary\pgsql\bin'
$markerPath = Join-Path $runtime 'cluster-owner.json'
$credentialsPath = Join-Path $runtime 'credentials.json'
$port = 55432

# Nonpersistent DOS-device alias for PostgreSQL's Windows non-ASCII path limitation.
# Data and deletion guards always use the real project-local absolute path.
$alias = 'W:'
$pgData = 'W:\data'
$pgBin = 'W:\binary\pgsql\bin'
if (!('W1BDosDevice' -as [type])) {
  Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W1BDosDevice {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint QueryDosDevice(string name,StringBuilder buffer,int size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool DefineDosDevice(uint flags,string name,string target);
}
"@
}
function Get-AliasTarget {
  $buffer=New-Object Text.StringBuilder 4096
  if ([W1BDosDevice]::QueryDosDevice($alias,$buffer,4096)) { return $buffer.ToString() }
  $code=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($code -ne 2) { throw "DOS-device query failed: $code" }
  return $null
}
function Ensure-Alias {
  Assert-LocalPaths
  $target=Get-AliasTarget
  if ($target) {
    if ($target -cne ('\??\'+$runtime)) { throw 'FAIL CLOSED: W: is already assigned to another target' }
  } elseif (![W1BDosDevice]::DefineDosDevice(8,$alias,$runtime)) { throw 'Cannot create nonpersistent project-local DOS alias' }
  if ((Get-AliasTarget) -cne ('\??\'+$runtime)) { throw 'FAIL CLOSED: alias target verification failed' }
}
function Remove-Alias {
  $target=Get-AliasTarget
  if ($target -cne ('\??\'+$runtime)) { throw 'FAIL CLOSED: refusing to remove foreign DOS alias' }
  if (![W1BDosDevice]::DefineDosDevice(15,$alias,$target)) { throw 'Could not remove exact owned DOS alias' }
}

$utf8 = New-Object Text.UTF8Encoding($false)
function Write-Utf8([string]$Path,[string]$Value) { [IO.File]::WriteAllText($Path,$Value,$utf8) }
function Assert-LocalPaths {
  if ([IO.Path]::GetFullPath($runtime) -cne (Join-Path $repo '.runtime\postgres17') -or [IO.Path]::GetFullPath($data) -cne (Join-Path $repo '.runtime\postgres17\data')) { throw 'FAIL CLOSED: runtime path mismatch' }
  foreach ($path in @((Join-Path $repo '.runtime'),$runtime,$data,(Join-Path $runtime 'binary'),(Join-Path $runtime 'temp'),(Join-Path $runtime 'logs'),(Join-Path $runtime 'binary\pgsql'),$bin,$markerPath,$credentialsPath,(Join-Path $runtime 'temp\pgpass.conf'),(Join-Path $runtime 'temp\command.sql'),(Join-Path $runtime 'temp\initdb-password.txt'))) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'FAIL CLOSED: runtime reparse point' }
  }
}
function Assert-Owner {
  Assert-LocalPaths
  if (!(Test-Path -LiteralPath $markerPath)) { throw 'FAIL CLOSED: missing cluster ownership marker' }
  $owner = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($owner.purpose -cne 'looper-w1b-test-only' -or $owner.repository -cne $repo -or $owner.data -cne $data -or $owner.port -ne $port) { throw 'FAIL CLOSED: cluster ownership mismatch' }
  if (Test-Path -LiteralPath $data) {
    if ((Get-Content -LiteralPath (Join-Path $data 'PG_VERSION') -Raw).Trim() -ne '17') { throw 'FAIL CLOSED: unexpected cluster major' }
    $links = @(Get-ChildItem -LiteralPath $data -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($links.Count) { throw 'FAIL CLOSED: linked cluster entry' }
  }
}
function Invoke-Pg([string]$Name,[string[]]$Arguments) {
  Ensure-Alias
  if ($Name -eq 'pg_ctl' -and $Arguments[0] -eq 'start') {
    # Do not pipe pg_ctl start through PowerShell's native output capture: its
    # daemon inherits the pipe and prevents a redirected caller from returning.
    # Wait for pg_ctl itself, not Start-Process -Wait's entire descendant tree.
    $launchArgs = @($Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } })
    $launcher = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $launchArgs -WindowStyle Hidden -PassThru
    $launcher.WaitForExit()
    if ($launcher.ExitCode -ne 0) { throw "pg_ctl failed with exit code $($launcher.ExitCode)" }
    Write-Output 'PostgreSQL start command completed'
    return
  }
  # Explicit pipes avoid PowerShell native-command encoding/capture edge cases
  # when this helper's entire output is redirected by an automated QA caller.
  $process = [Diagnostics.Process]::new()
  $process.StartInfo.FileName = Join-Path $pgBin "$Name.exe"
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  $process.StartInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
  $process.StartInfo.StandardErrorEncoding = [Text.Encoding]::UTF8
  foreach ($argument in $Arguments) { $process.StartInfo.ArgumentList.Add($argument) }
  try {
    if (!$process.Start()) { throw "Could not start $Name" }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $output = $stdout.GetAwaiter().GetResult()
    $errors = $stderr.GetAwaiter().GetResult()
    if ($output) { Write-Output $output.TrimEnd() }
    if ($process.ExitCode -ne 0) { throw "$Name failed with exit code $($process.ExitCode): $errors" }
    if ($errors) { Write-Output $errors.TrimEnd() }
  } finally { $process.Dispose() }
}
function Test-Running {
  Ensure-Alias
  & (Join-Path $pgBin 'pg_ctl.exe') status -D $pgData *> $null
  return ($LASTEXITCODE -eq 0)
}
function New-Password {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($bytes) -replace '-','').ToLowerInvariant()
}
function Invoke-Sql([string]$Role,[string]$Database,[string]$Sql) {
  $oldPass = $env:PGPASSFILE; $oldOptions = $env:PGOPTIONS; $oldPassword = $env:PGPASSWORD
  $sqlPath = Join-Path $runtime 'temp\command.sql'
  try {
    $env:PGPASSFILE = 'W:\temp\pgpass.conf'; $env:PGOPTIONS = $null; $env:PGPASSWORD = $null
    Write-Utf8 $sqlPath $Sql
    Invoke-Pg 'psql' @('-X','-w','-h','127.0.0.1','-p',"$port",'-U',$Role,'-d',$Database,'-v','ON_ERROR_STOP=1','-At','-f','W:\temp\command.sql')
  } finally {
    $env:PGPASSFILE = $oldPass; $env:PGOPTIONS = $oldOptions; $env:PGPASSWORD = $oldPassword
    if (Test-Path -LiteralPath $sqlPath) { Remove-Item -LiteralPath $sqlPath -Force }
  }
}
function Initialize-Cluster {
  Assert-LocalPaths
  if (Test-Path -LiteralPath $data) { Assert-Owner; return }
  Invoke-Pg 'postgres' @('--version')
  foreach ($directory in @('temp','logs')) { New-Item -ItemType Directory -Force -Path (Join-Path $runtime $directory) | Out-Null }
  if (!(Test-Path -LiteralPath $credentialsPath)) {
    Write-Utf8 $credentialsPath (@{host='127.0.0.1';port=$port;database='looper_w1b';user='looper_w1b_test';password=(New-Password);bootstrapUser='w1b_bootstrap';bootstrapPassword=(New-Password)} | ConvertTo-Json)
  }
  $credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
  $pwfile = Join-Path $runtime 'temp\initdb-password.txt'
  Write-Utf8 $pwfile ($credentials.bootstrapPassword + "`n")
  try { Invoke-Pg 'initdb' @('-D',$pgData,'--encoding=UTF8','--locale=C','--username=w1b_bootstrap','--auth=scram-sha-256','--pwfile=W:\temp\initdb-password.txt') } finally { Remove-Item -LiteralPath $pwfile -Force }
  Write-Utf8 (Join-Path $data 'postgresql.conf') @"
# W1B test-only portable cluster. No public or LAN listener.
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = ''
password_encryption = 'scram-sha-256'
timezone = 'UTC'
log_timezone = 'UTC'
max_connections = 30
shared_buffers = '32MB'
"@
  Write-Utf8 (Join-Path $data 'pg_hba.conf') "host all all 127.0.0.1/32 scram-sha-256`n"
  Write-Utf8 $markerPath (@{purpose='looper-w1b-test-only';repository=$repo;data=$data;port=$port;major=17} | ConvertTo-Json)
  Write-Utf8 (Join-Path $runtime 'temp\pgpass.conf') ("127.0.0.1:${port}:*:w1b_bootstrap:" + $credentials.bootstrapPassword + "`n127.0.0.1:${port}:looper_w1b:looper_w1b_test:" + $credentials.password + "`n")
}
function Start-Cluster {
  Initialize-Cluster
  Assert-Owner
  if (!(Test-Running)) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
    try { $listener.Start() } finally { $listener.Stop() }
    Invoke-Pg 'pg_ctl' @('start','-w','-t','30','-D',$pgData,'-l','W:\logs\postgres.log','-o','-h 127.0.0.1 -p 55432')
  }
  $credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
  if (!(Test-Path -LiteralPath (Join-Path $data 'w1b-bootstrap-complete'))) {
    Invoke-Sql 'w1b_bootstrap' 'postgres' ("CREATE ROLE looper_w1b_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + $credentials.password + "';`nCREATE DATABASE looper_w1b OWNER looper_w1b_test ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';`nREVOKE CONNECT ON DATABASE looper_w1b FROM PUBLIC;`nGRANT CONNECT ON DATABASE looper_w1b TO looper_w1b_test;")
    Write-Utf8 (Join-Path $data 'w1b-bootstrap-complete') 'test-only'
  }
  Invoke-Sql 'looper_w1b_test' 'looper_w1b' "SELECT json_build_object('version',version(),'database',current_database(),'user',current_user,'serverAddress',inet_server_addr(),'port',inet_server_port(),'encoding',current_setting('server_encoding'),'locale',(SELECT datcollate FROM pg_database WHERE datname=current_database()),'timezone',current_setting('TimeZone'));"
}
Assert-LocalPaths
switch ($Action) {
  init { Initialize-Cluster }
  start { Start-Cluster }
  stop { Assert-Owner; if (Test-Running) { Invoke-Pg 'pg_ctl' @('stop','-w','-t','300','-m','fast','-D',$pgData) } else { Write-Output 'W1B PostgreSQL is stopped' }; Remove-Alias }
  status { Assert-Owner; Invoke-Pg 'pg_ctl' @('status','-D',$pgData); Invoke-Sql 'looper_w1b_test' 'looper_w1b' "SELECT json_build_object('version',version(),'database',current_database(),'serverAddress',inet_server_addr(),'port',inet_server_port());" }
  reset {
    Assert-Owner
    if (Test-Running) { Invoke-Pg 'pg_ctl' @('stop','-w','-t','300','-m','fast','-D',$pgData) }
    # Re-check the absolute fixed target and ownership immediately before deletion.
    Assert-Owner
    Remove-Item -LiteralPath $data -Recurse -Force
    Start-Cluster
  }
}
