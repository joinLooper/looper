#requires -Version 5.1
<#
Looper Windows Local Audit: READ ONLY. No admin, installs, benchmark, network, or writes except tiny reports to Desktop.
The report excludes host/user names, email, IP/MAC, serial numbers, tokens, and full local paths.
#>
[CmdletBinding()] param([string]$OutputDirectory = "")
$ErrorActionPreference = "Stop"
function SafeCim($class) { try { @(Get-CimInstance -ClassName $class -ErrorAction Stop) } catch { @() } }
function GiB($n) { if ($null -eq $n) { return $null }; [math]::Round(([double]$n / 1073741824),2) }
function HasCmd($n) { [bool](Get-Command $n -ErrorAction SilentlyContinue | Select-Object -First 1) }
function HasFolder($p) { [bool]($p -and (Test-Path -LiteralPath $p -ErrorAction SilentlyContinue)) }
$sys = SafeCim "Win32_ComputerSystem" | Select-Object -First 1
$os = SafeCim "Win32_OperatingSystem" | Select-Object -First 1
$cpu = SafeCim "Win32_Processor" | Select-Object -First 1
$gpu = @(SafeCim "Win32_VideoController" | ForEach-Object {
    [ordered]@{Name=[string]$_.Name; Driver=[string]$_.DriverVersion;
      WmiReportedVramGiB=(GiB $_.AdapterRAM)}
})
$drives = @(SafeCim "Win32_DiskDrive" | ForEach-Object {
    [ordered]@{Model=[string]$_.Model; Interface=[string]$_.InterfaceType;
      MediaTypeAsReported=[string]$_.MediaType; CapacityGiB=(GiB $_.Size)}
})
$volumes = @(SafeCim "Win32_LogicalDisk" | Where-Object {$_.DriveType -eq 3} | ForEach-Object {
    [ordered]@{Letter=[string]$_.DeviceID; CapacityGiB=(GiB $_.Size);
      FreeGiB=(GiB $_.FreeSpace);
      FreePercent=if ($_.Size) {[math]::Round(100*[double]$_.FreeSpace/[double]$_.Size,1)} else {$null}}
})
$modules = @(SafeCim "Win32_PhysicalMemory" | ForEach-Object {
    [ordered]@{CapacityGiB=(GiB $_.Capacity); SpeedMHz=$_.Speed}
})
$programFiles = [Environment]::GetFolderPath("ProgramFiles")
$programFiles86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$unityPath = Join-Path $programFiles "Unity\Hub\Editor"
$toolchain = [ordered]@{
    UnityHub=(HasFolder (Join-Path $programFiles "Unity Hub\Unity Hub.exe"))
    UnityEditorVersions=if (HasFolder $unityPath) {
        @(Get-ChildItem -LiteralPath $unityPath -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    } else { @() }
    BlenderFolder=(HasFolder (Join-Path $programFiles "Blender Foundation"))
    AndroidStudioFolder=(HasFolder (Join-Path $programFiles "Android\Android Studio"))
    CursorFolder=(HasFolder (Join-Path $localAppData "Programs\cursor"))
    VisualStudioFolder=((HasFolder (Join-Path $programFiles "Microsoft Visual Studio")) -or
      (HasFolder (Join-Path $programFiles86 "Microsoft Visual Studio")))
    Git=(HasCmd "git.exe"); Node=(HasCmd "node.exe"); Pnpm=(HasCmd "pnpm.cmd")
    Python=((HasCmd "python.exe") -or (HasCmd "py.exe"))
    DotNet=(HasCmd "dotnet.exe"); ADB=(HasCmd "adb.exe")
    Java=(HasCmd "java.exe"); BlenderCLI=(HasCmd "blender.exe")
    GodotCLI=(HasCmd "godot.exe"); Docker=(HasCmd "docker.exe")
    WSL=(HasCmd "wsl.exe"); NvidiaSMI=(HasCmd "nvidia-smi.exe")
}
$nvidia = @()
if ($toolchain.NvidiaSMI) {
    try {
        foreach ($line in @(& nvidia-smi.exe "--query-gpu=name,memory.total,driver_version" "--format=csv,noheader,nounits" 2>$null)) {
            $parts = ([string]$line).Split(",")
            if ($parts.Count -ge 3) {
                $nvidia += [ordered]@{Name=$parts[0].Trim(); VramMiB=$parts[1].Trim(); Driver=$parts[2].Trim()}
            }
        }
    } catch {}
}
$allowedProgramNames = @()
foreach ($key in @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                   "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
                   "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
    try {
        foreach ($x in @(Get-ItemProperty -Path $key -ErrorAction SilentlyContinue)) {
            $name = [string]$x.DisplayName
            if ($name -match "^(Unity|Blender|Godot|Android Studio|Microsoft Visual Studio|Visual Studio Code|Cursor|Docker Desktop|Git|Python |Krita|Adobe Substance)") {
                $allowedProgramNames += $name.Trim()
            }
        }
    } catch {}
}
$ramTotal = if ($sys) { GiB $sys.TotalPhysicalMemory } else { $null }
$ramFree = if ($os) { [math]::Round(([double]$os.FreePhysicalMemory/1048576),2) } else { $null }
$warnings = @()
if ($ramTotal -lt 16) { $warnings += "RAM_BELOW_16_GIB" }
if ($null -ne $ramFree -and $ramFree -lt 2) { $warnings += "AVAILABLE_RAM_BELOW_2_GIB" }
foreach ($v in $volumes) {
    if ($v.Letter -eq "C:") {
        if ($v.FreeGiB -lt 10) {$warnings += "CRITICAL_C_FREE_BELOW_10_GIB"}
        elseif ($v.FreeGiB -lt 30) {$warnings += "C_FREE_BELOW_30_GIB"}
    }
}
if ($drives | Where-Object {$_.Model -match "Optane|HDD|WD10SPZX"}) {
    $warnings += "CHECK_HDD_OPTANE_NOT_PURE_SSD"
}
$report = [ordered]@{
    Audit=[ordered]@{Version="1.0.0"; TimeLocal=(Get-Date -Format "yyyy-MM-dd HH:mm:ss");
        Privacy="No usernames, computer hostnames, addresses, serials, tokens or full paths"}
    Computer=[ordered]@{Manufacturer=[string]$sys.Manufacturer; Model=[string]$sys.Model;
        OS=[string]$os.Caption; Build=[string]$os.BuildNumber;
        BatteryDetected=(@(SafeCim "Win32_Battery").Count -gt 0)}
    CPU=[ordered]@{Model=[string]$cpu.Name;Cores=$cpu.NumberOfCores;
        LogicalThreads=$cpu.NumberOfLogicalProcessors;
        VirtualizationFirmwareEnabled=$cpu.VirtualizationFirmwareEnabled}
    RAM=[ordered]@{InstalledGiB=$ramTotal;FreeGiBNow=$ramFree;Modules=$modules}
    GPU=[ordered]@{Adapters=$gpu;NvidiaSmi=$nvidia;
        Note="Windows WMI GPU memory can be inaccurate; prefer nvidia-smi for Nvidia"}
    Storage=[ordered]@{PhysicalDisks=$drives;Volumes=$volumes}
    Toolchain=[ordered]@{Detection=$toolchain;
        InstalledProgramNamesAllowlisted=@($allowedProgramNames | Sort-Object -Unique)}
    OneDriveEnvironmentFound=(-not [string]::IsNullOrWhiteSpace([string]$env:OneDrive))
    Warnings=@($warnings)
    NotMeasured=@("GPU benchmarks","actual Unity and Blender performance","SDK/NDK/JDK versions",
        "iPhone build/signing","project location","App artistic approval")
}
if (-not $OutputDirectory) { $OutputDirectory=[Environment]::GetFolderPath("Desktop") }
if (-not (Test-Path -LiteralPath $OutputDirectory)) { $OutputDirectory=(Get-Location).Path }
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$jsonPath=Join-Path $OutputDirectory "Looper-Local-Health-$stamp.json"
$txtPath=Join-Path $OutputDirectory "Looper-Local-Health-$stamp.txt"
$report | ConvertTo-Json -Depth 12 | Out-File -FilePath $jsonPath -Encoding utf8 -Force
$summary=@("LOOPER LOCAL HARDWARE AUDIT - READ ONLY",
    "Model: $($report.Computer.Manufacturer) $($report.Computer.Model)",
    "OS: $($report.Computer.OS) Build $($report.Computer.Build)",
    "CPU: $($report.CPU.Model)",
    "RAM: $ramTotal GiB total / $ramFree GiB available",
    "GPU: $(($gpu | ForEach-Object {$_.Name}) -join '; ')",
    "VOLUMES:")
foreach ($v in $volumes) {
    $summary += "$($v.Letter) $($v.FreeGiB) GiB free / $($v.CapacityGiB) GiB total"
}
$summary += "WARNINGS: $(($warnings) -join ', ')"
$summary += "Technical apps: $(($report.Toolchain.InstalledProgramNamesAllowlisted) -join ', ')"
$summary += "This does not validate artistic quality or iPhone runtime."
$summary | Out-File -FilePath $txtPath -Encoding utf8 -Force
Write-Host "Looper read-only audit saved:"
Write-Host $jsonPath
Write-Host $txtPath
Write-Host "Upload the .json report to this ChatGPT conversation."
