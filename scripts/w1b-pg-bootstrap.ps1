[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Join-Path $repo '.runtime\postgres17'
foreach ($path in @((Join-Path $repo '.runtime'),$runtime,(Join-Path $runtime 'temp'),(Join-Path $runtime 'binary'))) {
  if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'FAIL CLOSED: linked runtime directory' }
}
$filename = 'postgresql-17.11-5-windows-x64-binaries.zip'
$url = 'https://get.enterprisedb.com/postgresql/' + $filename
$expected = '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f'
$zipPath = Join-Path $runtime "temp\$filename"
$binaryPath = Join-Path $runtime 'binary'
New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'temp'),$binaryPath | Out-Null
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($repo))
$initialFree = $drive.AvailableFreeSpace
if (!(Test-Path -LiteralPath $zipPath)) {
  if ($initialFree -lt 2GB) { throw 'Insufficient disk space before download (minimum 2 GiB)' }
  & curl.exe --fail --location --silent --show-error --output $zipPath $url
  if ($LASTEXITCODE -ne 0) { throw 'Official ZIP download failed' }
}
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -cne $expected) { throw 'Official archive SHA-256 mismatch' }
$official = (Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256").Content.Trim()
if (($official -split '\s+')[0] -cne $expected) { throw 'Supplier checksum does not match the pinned artifact' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $extractedBytes = ($zip.Entries | Measure-Object Length -Sum).Sum
  foreach ($entry in $zip.Entries) {
    $target = [IO.Path]::GetFullPath((Join-Path $binaryPath $entry.FullName))
    if (!$target.StartsWith($binaryPath + '\',[StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')) { throw 'FAIL CLOSED: ZIP path escapes binary directory' }
  }
} finally { $zip.Dispose() }
if (!(Test-Path -LiteralPath (Join-Path $binaryPath 'pgsql\bin\postgres.exe'))) {
  if (@(Get-ChildItem -LiteralPath $binaryPath -Force).Count) { throw 'FAIL CLOSED: partial extraction requires inspection; will not overwrite' }
  if ($drive.AvailableFreeSpace -lt ($extractedBytes + 768MB)) { throw 'Insufficient disk space for extraction, cluster, and safety reserve' }
  [IO.Compression.ZipFile]::ExtractToDirectory($zipPath,$binaryPath)
}
$version = & (Join-Path $binaryPath 'pgsql\bin\postgres.exe') --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^postgres \(PostgreSQL\) 17\.11$') { throw 'Unexpected PostgreSQL executable version' }
$evidence = [ordered]@{observedAt=[DateTime]::UtcNow.ToString('o');officialWindowsPage='https://www.postgresql.org/download/windows/';officialArchivePage='https://www.enterprisedb.com/download-postgresql-binaries';officialDownloadLink='https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616';sourceUrl=$url;filename=$filename;version=$version;sha256=$hash;officialChecksumUrl="$url.sha256";officialChecksum=$official;checksumVerified=$true;zipBytes=(Get-Item -LiteralPath $zipPath).Length;archiveExtractedBytes=$extractedBytes;freeBytesBefore=$initialFree;freeBytesAfter=$drive.AvailableFreeSpace}
$evidence | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'download-evidence.json') -Encoding UTF8
$evidence | ConvertTo-Json
