<#
.SYNOPSIS
    Builds, tests and packages EIWAMS into deploy\out.

.DESCRIPTION
    1. dotnet restore/build EIWAMS.API.slnx (Release)
    2. dotnet test (unless -SkipTests). Integration tests skip themselves when EIWAMS_Test is unavailable.
    3. dotnet publish EIWAMS.API -> deploy\out\api
    4. npm ci; npx ng build (production) in EIWAMS.Web -> deploy\out\web
    5. Copies deploy\iis\web.config into deploy\out\web when the Angular output has none.

.EXAMPLE
    .\deploy\Build-All.ps1
    .\deploy\Build-All.ps1 -SkipTests -SkipWeb
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [switch]$SkipTests,
    [switch]$SkipWeb,
    [switch]$SkipApi
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = Join-Path $PSScriptRoot 'out'
$solution = Join-Path $root 'EIWAMS.API.slnx'
$webDir = Join-Path $root 'EIWAMS.Web'

function Invoke-Step([string]$Title, [scriptblock]$Action) {
    Write-Host "`n==> $Title" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$Title failed (exit $LASTEXITCODE)." }
}

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

if (-not $SkipApi) {
    Invoke-Step 'dotnet build' { dotnet build $solution -c $Configuration --nologo }

    if (-not $SkipTests) {
        Invoke-Step 'dotnet test' { dotnet test $solution -c $Configuration --no-build --nologo }
    }

    Invoke-Step 'dotnet publish EIWAMS.API' {
        dotnet publish (Join-Path $root 'EIWAMS.API\EIWAMS.API.csproj') -c $Configuration -o (Join-Path $out 'api') --nologo
    }
}

if (-not $SkipWeb) {
    Push-Location $webDir
    try {
        Invoke-Step 'npm ci' { npm ci --no-audit --no-fund }
        Invoke-Step 'ng build (production)' { npx ng build --configuration production }
    } finally {
        Pop-Location
    }

    $browser = Join-Path $webDir 'dist\EIWAMS.Web\browser'
    if (-not (Test-Path $browser)) { throw "Angular output not found at $browser." }
    Copy-Item $browser (Join-Path $out 'web') -Recurse
    if (-not (Test-Path (Join-Path $out 'web\web.config'))) {
        Copy-Item (Join-Path $PSScriptRoot 'iis\web.config') (Join-Path $out 'web\web.config')
    }
}

Write-Host "`nBuild complete:" -ForegroundColor Green
Get-ChildItem $out | ForEach-Object { Write-Host "  $($_.FullName)" }
Write-Host 'Next: deploy\Deploy-Database.ps1, deploy\functions\Publish-Api.ps1 -InstallService, deploy\iis\Setup-IIS.ps1'
