#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Creates the EIWAMS IIS application pool and web site that serve the Angular build and
    reverse-proxy /api to the local Azure Functions host.

.DESCRIPTION
    - Verifies IIS, URL Rewrite and Application Request Routing (ARR) are installed.
    - Enables the ARR proxy at server level (required for the /api rewrite to an absolute URL).
    - Creates/updates app pool 'EIWAMS' (No Managed Code, integrated pipeline, ApplicationPoolIdentity).
    - Creates/updates the site pointing at the Angular dist\browser output.
    - Copies deploy\iis\web.config into the site root when the build output has none.

.EXAMPLE
    .\Setup-IIS.ps1 -SitePath C:\inetpub\EIWAMS -HostName eiwams.example.com -Port 80
#>
[CmdletBinding()]
param(
    [string]$SiteName = 'EIWAMS',
    [string]$AppPoolName = 'EIWAMS',
    [string]$SitePath = 'C:\inetpub\EIWAMS',
    [string]$SourcePath = (Join-Path $PSScriptRoot '..\out\web'),
    [int]$Port = 80,
    [string]$HostName = '',
    [string]$ApiUpstream = 'http://127.0.0.1:7274'
)

$ErrorActionPreference = 'Stop'

function Assert-Feature([string]$Path, [string]$Name, [string]$Hint) {
    if (-not (Test-Path $Path)) {
        throw "$Name is not installed. $Hint"
    }
}

Write-Host '==> Checking prerequisites'
Assert-Feature "$env:SystemRoot\System32\inetsrv\appcmd.exe" 'IIS (Web Server role)' 'Run: Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,IIS-WebServer,IIS-StaticContent,IIS-DefaultDocument,IIS-HttpCompressionStatic -All'
Assert-Feature "$env:SystemRoot\System32\inetsrv\rewrite.dll" 'IIS URL Rewrite 2.1' 'Download: https://www.iis.net/downloads/microsoft/url-rewrite'
Assert-Feature "$env:ProgramFiles\IIS\Application Request Routing" 'Application Request Routing 3.0' 'Download: https://www.iis.net/downloads/microsoft/application-request-routing'

Import-Module WebAdministration

Write-Host '==> Enabling ARR reverse proxy'
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'preserveHostHeader' -Value 'True'
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'reverseRewriteHostInResponseHeaders' -Value 'False'

Write-Host "==> App pool '$AppPoolName'"
if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
    New-WebAppPool -Name $AppPoolName | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedPipelineMode -Value 'Integrated'
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name startMode -Value 'AlwaysRunning'

Write-Host "==> Site content -> $SitePath"
New-Item -ItemType Directory -Path $SitePath -Force | Out-Null
if (Test-Path $SourcePath) {
    Copy-Item -Path (Join-Path $SourcePath '*') -Destination $SitePath -Recurse -Force
} else {
    Write-Warning "Source '$SourcePath' not found. Run deploy\Build-All.ps1 first or copy EIWAMS.Web\dist\EIWAMS.Web\browser manually."
}

$webConfig = Join-Path $SitePath 'web.config'
if (-not (Test-Path $webConfig)) {
    Copy-Item (Join-Path $PSScriptRoot 'web.config') $webConfig
}
$upstream = $ApiUpstream.TrimEnd('/')
if ($upstream -ne 'http://127.0.0.1:7274') {
    (Get-Content $webConfig -Raw).Replace('http://127.0.0.1:7274', $upstream) | Set-Content $webConfig -Encoding UTF8
}

& icacls $SitePath /grant "IIS AppPool\$($AppPoolName):(OI)(CI)RX" /T /Q | Out-Null

Write-Host "==> Site '$SiteName' on port $Port"
if (Test-Path "IIS:\Sites\$SiteName") {
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $SitePath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $AppPoolName
} else {
    New-Website -Name $SiteName -PhysicalPath $SitePath -ApplicationPool $AppPoolName -Port $Port -HostHeader $HostName | Out-Null
}

Start-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
Start-Website -Name $SiteName -ErrorAction SilentlyContinue

$probeHost = if ($HostName) { $HostName } else { 'localhost' }
Write-Host "Done. Browse http://$($probeHost):$Port/  |  API probe: http://$($probeHost):$Port/api/auth/config"
