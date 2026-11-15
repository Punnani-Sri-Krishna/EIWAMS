<#
.SYNOPSIS
    Applies the EIWAMS SQL scripts (EIWAMS.Infrastructure/SQL) to a database with checksum tracking.

.DESCRIPTION
    Cross-platform runner (Windows PowerShell 5.1 or PowerShell 7) used by the "Deploy database" GitHub workflow; also usable locally.
    Every applied script is recorded in dbo.SchemaMigrations (name, SHA-256 checksum, time, principal, run id).

      plan      Read-only. Lists each script as Pending (never applied), Changed (checksum differs) or Applied.
      apply     Runs Pending and Changed scripts in order and records them. All scripts are idempotent.
      baseline  Records scripts as applied WITHOUT running them (database already deployed by hand).

    Script set: 01..11 always; 13_Grant_Admin_Users.sql with -IncludeAdminProvisioning;
    12_DemoData.sql with -IncludeDemoData (development only).

    Requires sqlcmd (go-sqlcmd recommended; the ODBC sqlcmd works for SQL / Windows authentication).

.EXAMPLE
    # GitHub Actions after azure/login (Entra token from the Azure CLI)
    ./deploy/sql/Invoke-DbMigrations.ps1 -Server eiwams-sql-dev.database.windows.net -Database EIWAMSDB -Action plan -Authentication ActiveDirectoryDefault

.EXAMPLE
    # Local SQL Server with Windows authentication
    ./deploy/sql/Invoke-DbMigrations.ps1 -Server . -Database EIWAMS -Action apply -Authentication Integrated -TrustServerCertificate -IncludeAdminProvisioning -IncludeDemoData
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Server,
    [Parameter(Mandatory)] [string] $Database,
    [ValidateSet('plan', 'apply', 'baseline')] [string] $Action = 'plan',
    # ActiveDirectoryDefault: Azure CLI / environment token (go-sqlcmd). SqlPassword: SQLCMDUSER + SQLCMDPASSWORD env vars. Integrated: Windows auth.
    [ValidateSet('ActiveDirectoryDefault', 'SqlPassword', 'Integrated')] [string] $Authentication = 'ActiveDirectoryDefault',
    [switch] $IncludeAdminProvisioning,
    [switch] $IncludeDemoData,
    # Defaults to <repo>\EIWAMS.Infrastructure\SQL (resolved below; $PSScriptRoot is empty in param defaults on Windows PowerShell 5.1).
    [string] $ScriptsPath,
    [string] $RunId = $(if ($env:GITHUB_RUN_ID) { "$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)" } else { "local-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" }),
    [string] $Sqlcmd = 'sqlcmd',
    # Local development only: trust a self-signed SQL Server certificate.
    [switch] $TrustServerCertificate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw "Invalid database name '$Database'." }
if ($RunId -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw "Invalid run id '$RunId'." }
if (-not (Get-Command $Sqlcmd -ErrorAction SilentlyContinue)) { throw "sqlcmd was not found ('$Sqlcmd')." }
if ($Authentication -eq 'SqlPassword' -and (-not $env:SQLCMDUSER -or -not $env:SQLCMDPASSWORD)) {
    throw 'SqlPassword authentication needs the SQLCMDUSER and SQLCMDPASSWORD environment variables.'
}
if ($IncludeDemoData -and $Database -match '(?i)prod') { throw 'Demo data must never be loaded into a production database.' }

if (-not $ScriptsPath) { $ScriptsPath = Join-Path (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'EIWAMS.Infrastructure') 'SQL' }
$ScriptsPath = (Resolve-Path $ScriptsPath).Path
$selected = Get-ChildItem -Path $ScriptsPath -Filter '*.sql' -File |
    Where-Object { $_.Name -match '^\d{2}_[A-Za-z0-9_]+\.sql$' } |
    Where-Object {
        switch -Regex ($_.Name) {
            '^13_' { [bool]$IncludeAdminProvisioning; break }
            '^12_' { [bool]$IncludeDemoData; break }
            default { $true }
        }
    } |
    Sort-Object Name
if (-not $selected) { throw "No SQL scripts found in $ScriptsPath." }

function Get-ScriptChecksum([string] $Path) {
    # Line endings are normalized so Windows (CRLF) and Linux (LF) checkouts produce the same checksum.
    $text = [IO.File]::ReadAllText($Path).TrimStart([char]0xFEFF) -replace "`r`n", "`n"
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) } finally { $sha.Dispose() }
    ([BitConverter]::ToString($hash) -replace '-', '').ToUpperInvariant()
}

function Invoke-Sqlcmd2 {
    param([string] $File, [string] $Query, [switch] $Raw)
    $sqlArgs = @('-S', $Server, '-d', $Database, '-b', '-I', '-l', '60')
    switch ($Authentication) {
        'ActiveDirectoryDefault' { $sqlArgs += @('--authentication-method', 'ActiveDirectoryDefault') }
        'SqlPassword' { $sqlArgs += @('-U', $env:SQLCMDUSER) }  # password comes from SQLCMDPASSWORD, never the command line
        'Integrated' { $sqlArgs += '-E' }
    }
    if ($TrustServerCertificate) { $sqlArgs += '-C' }
    if ($Raw) { $sqlArgs += @('-h', '-1', '-W') }
    if ($File) { $sqlArgs += @('-i', $File) } else { $sqlArgs += @('-Q', $Query) }

    $output = & $Sqlcmd @sqlArgs 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        $output | ForEach-Object { Write-Host "    $_" }
        throw "sqlcmd failed (exit $code) on $(if ($File) { Split-Path $File -Leaf } else { 'query' })."
    }
    , @($output | ForEach-Object { "$_" })
}

function Write-Summary([string] $Markdown) {
    if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $Markdown }
}

$trackingDdl = @"
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL
    CREATE TABLE dbo.SchemaMigrations
    (
        ScriptName   NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
        Checksum     CHAR(64)      NOT NULL,
        AppliedAtUtc DATETIME2(0)  NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAtUtc DEFAULT SYSUTCDATETIME(),
        AppliedBy    NVARCHAR(256) NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedBy DEFAULT SUSER_SNAME(),
        RunId        NVARCHAR(64)  NULL,
        Baselined    BIT           NOT NULL CONSTRAINT DF_SchemaMigrations_Baselined DEFAULT 0
    );
"@

Write-Host "EIWAMS database migrations: action=$Action server=$Server database=$Database auth=$Authentication run=$RunId"
$who = Invoke-Sqlcmd2 -Raw -Query "SET NOCOUNT ON; SELECT CONCAT(N'Connected as ', SUSER_SNAME(), N' to ', DB_NAME(), N' (', CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128)), N' ', CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)), N')');"
Write-Host ($who | Where-Object { $_ } | Select-Object -First 1)

$state = Invoke-Sqlcmd2 -Raw -Query "SET NOCOUNT ON; IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NOT NULL SELECT ScriptName + N'|' + Checksum FROM dbo.SchemaMigrations;"
$applied = @{}
foreach ($line in $state) {
    if ($line -match '^(?<name>[^|\s]+)\|(?<sum>[0-9A-Fa-f]{64})$') { $applied[$Matches.name] = $Matches.sum.ToUpperInvariant() }
}

$plan = foreach ($script in $selected) {
    $sum = Get-ScriptChecksum $script.FullName
    $status = if (-not $applied.ContainsKey($script.Name)) { 'Pending' } elseif ($applied[$script.Name] -ne $sum) { 'Changed' } else { 'Applied' }
    [pscustomobject]@{ Script = $script.Name; Status = $status; Checksum = $sum; Path = $script.FullName }
}

$plan | Format-Table Script, Status, @{ n = 'Checksum'; e = { $_.Checksum.Substring(0, 12) } } -AutoSize | Out-String | Write-Host
$summary = "### Database migrations ($Action)`n`nServer ``$Server`` / database ``$Database```n`n| Script | Status |`n|---|---|`n"
$summary += ($plan | ForEach-Object { "| $($_.Script) | $($_.Status) |" }) -join "`n"
Write-Summary ($summary + "`n")

$work = @($plan | Where-Object Status -ne 'Applied')
if ($Action -eq 'plan') {
    Write-Host "$($work.Count) script(s) would run. Plan only: nothing was changed."
    return
}
if ($work.Count -eq 0) {
    Write-Host 'Database is up to date.'
    return
}

if ($Action -eq 'baseline') {
    $exists = Invoke-Sqlcmd2 -Raw -Query "SET NOCOUNT ON; SELECT CASE WHEN OBJECT_ID(N'dbo.Users', N'U') IS NULL THEN 'EMPTY' ELSE 'SCHEMA' END;"
    if (-not ($exists -contains 'SCHEMA')) { throw 'Baseline refused: dbo.Users does not exist. Use apply for an empty database.' }
}

Invoke-Sqlcmd2 -Query $trackingDdl | Out-Null

foreach ($item in $work) {
    if ($Action -eq 'apply') {
        Write-Host "==> Applying $($item.Script) ($($item.Status))"
        $out = Invoke-Sqlcmd2 -File $item.Path
        $out | Where-Object { $_ -match '^(Msg |Demo data|Warning|Created )' } | ForEach-Object { Write-Host "    $_" }
    }
    else {
        Write-Host "==> Baselining $($item.Script) (not executed)"
    }
    $baselined = [int]($Action -eq 'baseline')
    $record = @"
SET NOCOUNT ON;
MERGE dbo.SchemaMigrations AS t
USING (SELECT N'$($item.Script)' AS ScriptName, '$($item.Checksum)' AS Checksum) AS s ON t.ScriptName = s.ScriptName
WHEN MATCHED THEN UPDATE SET Checksum = s.Checksum, AppliedAtUtc = SYSUTCDATETIME(), AppliedBy = SUSER_SNAME(), RunId = N'$RunId', Baselined = $baselined
WHEN NOT MATCHED THEN INSERT (ScriptName, Checksum, RunId, Baselined) VALUES (s.ScriptName, s.Checksum, N'$RunId', $baselined);
"@
    Invoke-Sqlcmd2 -Query $record | Out-Null
}

Write-Host "$($work.Count) script(s) $(if ($Action -eq 'apply') { 'applied' } else { 'baselined' })."
Write-Summary "`n$($work.Count) script(s) $(if ($Action -eq 'apply') { 'applied' } else { 'baselined' }) by run ``$RunId``.`n"

