# EIWAMS.API hosting (Azure Functions isolated worker, on-premises)

The API is an Azure Functions v4 app (.NET 10 isolated worker) with HTTP triggers only. On a Windows
server it runs under the Functions host from Azure Functions Core Tools, listening on
`http://127.0.0.1:7274`. IIS proxies `/api/*` to that port. Don't expose 7274 publicly.

## Publish

```powershell
cd EIWAMS
.\deploy\functions\Publish-Api.ps1                         # -> C:\EIWAMS\api (-OutputPath to change)
.\deploy\functions\Publish-Api.ps1 -SettingsFile C:\secure\eiwams.settings.json   # also copies settings
```

## Configure

Pick one approach:

* **Settings file**: copy [`local.settings.Production.sample.json`](local.settings.Production.sample.json),
  fill in real values, keep it outside the repo, and pass it as `-SettingsFile`. Core Tools reads
  `local.settings.json` from the folder it starts in.
* **Environment variables**: set them on the service (`nssm set EIWAMS-API AppEnvironmentExtra ...`) or
  machine-wide. Use `__` in place of `:` (for example `Auth__Mode=EntraId`).

The full list is in [`docs\ENVIRONMENT-VARIABLES.md`](../../docs/ENVIRONMENT-VARIABLES.md). `Auth:Mode` is
mandatory. The host fails at startup when it is missing or invalid, or when Entra values are incomplete.

## Run

Interactive (smoke test):

```powershell
cd C:\EIWAMS\api
func host start --port 7274
# during development, from EIWAMS.API after a build: func start --no-build
```

As a Windows service with [NSSM](https://nssm.cc) (optional):

```powershell
.\deploy\functions\Publish-Api.ps1 -SettingsFile C:\secure\eiwams.settings.json -InstallService -NssmPath C:\tools\nssm.exe
Get-Service EIWAMS-API
Invoke-RestMethod http://127.0.0.1:7274/api/auth/config
```

The service runs `func host start --port 7274` in the publish folder, starts automatically, and writes
rotated logs to `C:\EIWAMS\api\logs`. For SQL access with `Integrated Security=True`, run the service
under an account that has a SQL login (`nssm set EIWAMS-API ObjectName DOMAIN\svc-eiwams <password>`) and
grant that login `db_datareader`, `db_datawriter`, and `EXECUTE` on database `EIWAMS`.

## Update / rollback

```powershell
nssm stop EIWAMS-API
Copy-Item C:\EIWAMS\api C:\EIWAMS\api.prev -Recurse -Force   # keep the previous build for rollback
.\deploy\functions\Publish-Api.ps1 -SettingsFile C:\secure\eiwams.settings.json -InstallService
# rollback: nssm stop EIWAMS-API; Remove-Item C:\EIWAMS\api -Recurse; Rename-Item C:\EIWAMS\api.prev api; nssm start EIWAMS-API
```
