<#
.SYNOPSIS
    Publishes EIWAMS.API (Azure Functions, .NET 10 isolated) and optionally registers it as a Windows service.

.DESCRIPTION
    1. dotnet publish EIWAMS.API -c Release -o <OutputPath> (default C:\EIWAMS\api, outside the repo so
       Build-All.ps1 never wipes the folder a running service uses)
    2. Copies a production settings file (Core Tools local.settings.json format) into the output when supplied.
    3. With -InstallService, registers the Functions host as a Windows service through NSSM
       (https://nssm.cc) running `func host start --port <Port>` in the publish folder.
       Without it, prints the command to run the host interactively.

.EXAMPLE
    .\Publish-Api.ps1
    .\Publish-Api.ps1 -SettingsFile C:\secure\eiwams.local.settings.json -InstallService -NssmPath C:\tools\nssm.exe
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [string]$OutputPath = 'C:\EIWAMS\api',
    [string]$SettingsFile = '',
    [int]$Port = 7274,
    [switch]$InstallService,
    [string]$ServiceName = 'EIWAMS-API',
    [string]$NssmPath = 'nssm.exe'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$project = Join-Path $root 'EIWAMS.API\EIWAMS.API.csproj'
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

Write-Host "==> dotnet publish $project ($Configuration) -> $OutputPath"
& dotnet publish $project -c $Configuration -o $OutputPath --nologo
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

if ($SettingsFile) {
    if (-not (Test-Path $SettingsFile)) { throw "Settings file '$SettingsFile' not found." }
    Copy-Item $SettingsFile (Join-Path $OutputPath 'local.settings.json') -Force
    Write-Host '==> Copied settings file to local.settings.json (keep this folder ACL-restricted).'
} elseif (-not (Test-Path (Join-Path $OutputPath 'local.settings.json'))) {
    Write-Warning 'No local.settings.json in the publish folder. Supply -SettingsFile or set machine/service environment variables (see docs\ENVIRONMENT-VARIABLES.md).'
}

$publishedSettings = Join-Path $OutputPath 'local.settings.json'
if (Test-Path $publishedSettings) {
    $mode = (Get-Content $publishedSettings -Raw | ConvertFrom-Json).Values.'Auth:Mode'
    if ($mode -ne 'EntraId') {
        Write-Warning "Published local.settings.json has Auth:Mode='$mode'. Production must use EntraId (DevHeader trusts the X-User-Id header)."
    }
}

$func = Get-Command func -ErrorAction SilentlyContinue
if (-not $func) {
    throw 'Azure Functions Core Tools v4 (func) not found on PATH. Install: winget install Microsoft.Azure.FunctionsCoreTools'
}
# npm installs func.cmd; prefer the real executable for service hosting.
$funcExe = $func.Source
$candidate = Join-Path (Split-Path $funcExe) 'node_modules\azure-functions-core-tools\bin\func.exe'
if ($funcExe -like '*.cmd' -and (Test-Path $candidate)) { $funcExe = $candidate }

if (-not $InstallService) {
    Write-Host ''
    Write-Host 'Run the API host interactively:'
    Write-Host "  cd `"$OutputPath`"; func host start --port $Port"
    Write-Host "Probe: http://127.0.0.1:$Port/api/auth/config"
    return
}

if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue) -and -not (Test-Path $NssmPath)) {
    throw "NSSM not found ('$NssmPath'). Download from https://nssm.cc and pass -NssmPath."
}

Write-Host "==> Registering Windows service '$ServiceName' via NSSM"
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    & $NssmPath stop $ServiceName | Out-Null
} else {
    & $NssmPath install $ServiceName $funcExe | Out-Null
}
& $NssmPath set $ServiceName Application $funcExe | Out-Null
& $NssmPath set $ServiceName AppParameters "host start --port $Port" | Out-Null
& $NssmPath set $ServiceName AppDirectory $OutputPath | Out-Null
& $NssmPath set $ServiceName DisplayName 'EIWAMS API (Azure Functions host)' | Out-Null
& $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
$logDir = Join-Path $OutputPath 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
& $NssmPath set $ServiceName AppStdout (Join-Path $logDir 'stdout.log') | Out-Null
& $NssmPath set $ServiceName AppStderr (Join-Path $logDir 'stderr.log') | Out-Null
& $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
& $NssmPath set $ServiceName AppRotateBytes 10485760 | Out-Null
& $NssmPath start $ServiceName | Out-Null

Start-Sleep -Seconds 10
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/auth/config" -TimeoutSec 20
    Write-Host "==> API is up. Auth mode: $($resp.data.mode)"
} catch {
    Write-Warning "Service started but the probe failed: $($_.Exception.Message). Check $logDir."
}
