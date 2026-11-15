<#
.SYNOPSIS
    Deploys the EIWAMS database (schema, procedures, reference data and demo data) to a local SQL Server.

.DESCRIPTION
    Applies EIWAMS.Infrastructure\SQL\01..12 in order using Windows authentication. 11 is required reference data,
    12 is dev-only demo data (skip it with -SkipSeed) and 13 provisions named administrators
    (-IncludeAdminProvisioning). All scripts are idempotent. For Azure SQL use deploy\sql\Invoke-DbMigrations.ps1
    (checksum-tracked) or the "Deploy database" GitHub workflow.

.EXAMPLE
    .\Deploy-Database.ps1
    .\Deploy-Database.ps1 -Database EIWAMS_Test
    .\Deploy-Database.ps1 -Server '.\SQLEXPRESS' -SkipSeed
#>
[CmdletBinding()]
param(
    [string]$Server = 'localhost',
    [string]$Database = 'EIWAMS',
    [switch]$SkipSeed,
    [switch]$IncludeAdminProvisioning,
    [string]$ScriptsPath = (Join-Path $PSScriptRoot '..\EIWAMS.Infrastructure\SQL')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    throw 'sqlcmd was not found on PATH. Install the SQL Server command line utilities.'
}
if ($Database -notmatch '^[A-Za-z0-9_]+$') {
    throw "Invalid database name '$Database'."
}
if (-not $SkipSeed -and $Database -match '(?i)prod') {
    throw 'Demo data must never be loaded into a production database. Use -SkipSeed.'
}

$ScriptsPath = (Resolve-Path $ScriptsPath).Path

function Invoke-Sql {
    param([string]$Db, [string]$File, [string]$Query)
    $sqlArgs = @('-S', $Server, '-E', '-C', '-b', '-I', '-d', $Db)
    if ($File) { $sqlArgs += @('-i', $File) } else { $sqlArgs += @('-Q', $Query) }
    $output = & sqlcmd @sqlArgs 2>&1
    $code = $LASTEXITCODE
    $output | Where-Object { $_ -match '^(Msg |Demo |Warning)' -or $code -ne 0 } | ForEach-Object { Write-Host "    $_" }
    if ($code -ne 0) {
        throw "sqlcmd failed (exit $code) on $(if ($File) { Split-Path $File -Leaf } else { 'query' })."
    }
}

Write-Host "Deploying EIWAMS to [$Server].[$Database]" -ForegroundColor Cyan

Write-Host '  Ensuring database exists...'
Invoke-Sql -Db 'master' -Query "IF DB_ID(N'$Database') IS NULL CREATE DATABASE [$Database];"

$scripts = Get-ChildItem -Path $ScriptsPath -Filter '*.sql' |
    Where-Object { $_.Name -match '^\d{2}_[A-Za-z0-9_]+\.sql$' } |
    Sort-Object Name |
    Where-Object {
        switch -Regex ($_.Name) {
            '^12_' { -not $SkipSeed; break }
            '^13_' { [bool]$IncludeAdminProvisioning; break }
            default { $true }
        }
    }

foreach ($script in $scripts) {
    Write-Host "  Running $($script.Name)"
    Invoke-Sql -Db $Database -File $script.FullName
}

Write-Host "Database [$Database] deployed successfully." -ForegroundColor Green
