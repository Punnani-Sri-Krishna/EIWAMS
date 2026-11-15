# EIWAMS deployment checklist (on-premises)

Target topology: SQL Server (`localhost`, database `EIWAMS`), the Azure Functions host as Windows service `EIWAMS-API`
on `127.0.0.1:7274`, IIS site `EIWAMS` on :80 (SPA plus `/api` proxy), and an optional Cloudflare Tunnel publishing
`https://eiwams.example.com`. Run commands from the repository root in an elevated PowerShell. For Azure (GitHub
Actions, Flex Consumption, App Service, Azure SQL) follow [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md).

## 0. Pre-flight

- [ ] .NET 10 SDK, Node 24, Azure Functions Core Tools 4, `sqlcmd`, IIS + URL Rewrite 2.1 + ARR 3.0, NSSM, optional `cloudflared`
- [ ] EIWAMS-Web and EIWAMS-API registered ([ENTRA-SETUP.md](ENTRA-SETUP.md)); the production origin is a SPA redirect URI
- [ ] Production users are provisioned in EIWAMS (`Admin > Users`) with roles and facility scope
- [ ] Production settings file filled in and stored outside the repo ([ENVIRONMENT-VARIABLES.md](ENVIRONMENT-VARIABLES.md)), `Auth:Mode=EntraId`
- [ ] Release build is green: `.\deploy\Build-All.ps1` (build, tests, publish API, Angular build into `deploy\out`)

## 1. Back up (needed for rollback)

```powershell
New-Item -ItemType Directory -Force C:\EIWAMS\backup | Out-Null
sqlcmd -S localhost -E -C -Q "BACKUP DATABASE EIWAMS TO DISK = N'C:\EIWAMS\backup\EIWAMS_$(Get-Date -f yyyyMMdd_HHmm).bak' WITH COPY_ONLY, INIT"
Copy-Item C:\EIWAMS\api     C:\EIWAMS\api.prev     -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item C:\inetpub\EIWAMS C:\inetpub\EIWAMS.prev -Recurse -Force -ErrorAction SilentlyContinue
```

## 2. Database

- [ ] `.\deploy\Deploy-Database.ps1` (parameters in the script header). It applies `EIWAMS.Infrastructure\SQL\01..12`
      in name order; scripts are idempotent. Skip demo data in production (see the script's switches).
- [ ] Or with checksum tracking: `.\deploy\sql\Invoke-DbMigrations.ps1 -Server localhost -Database EIWAMS -Action plan -Authentication Integrated -TrustServerCertificate`, then `-Action apply`
- [ ] Verify: `sqlcmd -S localhost -E -C -d EIWAMS -Q "SELECT COUNT(*) FROM dbo.Roles; SELECT COUNT(*) FROM dbo.Permissions; SELECT COUNT(*) FROM dbo.Menus"` returns 8 roles and the seeded permissions/menus
- [ ] The API login has `db_datareader`, `db_datawriter` and `EXECUTE` only

## 3. API (Azure Functions host)

- [ ] `.\deploy\functions\Publish-Api.ps1 -SettingsFile C:\secure\eiwams.settings.json -InstallService -NssmPath C:\tools\nssm.exe`
- [ ] `Get-Service EIWAMS-API` is **Running**
- [ ] `Invoke-RestMethod http://127.0.0.1:7274/api/auth/config` returns `data.mode = EntraId` (not DevHeader) and the EIWAMS-Web `spaClientId`
- [ ] `Invoke-WebRequest http://127.0.0.1:7274/api/v1/dev/users` returns 404 (DevHeader disabled)
- [ ] `C:\EIWAMS\api\logs\stderr.log` has no startup exceptions

## 4. Web (IIS)

- [ ] `.\deploy\iis\Setup-IIS.ps1 -SourcePath .\deploy\out\web -SitePath C:\inetpub\EIWAMS -Port 80 -HostName eiwams.example.com`
- [ ] `http://localhost/` loads the SPA; the deep link `http://localhost/access-requests` also loads (SPA fallback)
- [ ] `http://localhost/api/auth/config` returns JSON (ARR proxy works)

## 5. Cloudflare Tunnel (optional)

- [ ] `C:\ProgramData\cloudflared\config.yml` based on [`deploy\cloudflare\config.yml`](../deploy/cloudflare/config.yml)
- [ ] `cloudflared tunnel ingress validate` passes; `Get-Service cloudflared` is Running
- [ ] `https://eiwams.example.com/api/auth/config` returns 200 over HTTPS

## 6. Smoke journey

SDD 16.3 / TC-25: sign-in -> employee -> card issue/loss -> access request -> approvals -> permission -> RFID event ->
audit/report. Use a test employee in a test location and record evidence (screenshots, correlation IDs).

| # | Actor | Step | Expected |
|---|---|---|---|
| S1 | any | Open the site | Microsoft sign-in, then Dashboard with the top navigation filtered by role |
| S2 | non-provisioned account | Sign in | 403, no data |
| S3 | HR Admin | People > Employees > create employee (test department/location, manager) | Employee saved, history row |
| S4 | HR Admin | People > ID Cards > issue card, activate | Card `Active`, UID masked, `controllerSyncStatus` Synced |
| S5 | Employee | Report the card lost | Card `Blocked` immediately, Lost card request created |
| S6 | HR Admin / Security | Issue a replacement card | Old card deactivated, new card Active |
| S7 | Employee | Access > Access Requests > request a restricted zone, submit | `PendingApproval`, stage Manager |
| S8 | Manager -> Security -> Facility Admin | Access > Approvals > approve | Request `Approved`; in-app notifications created |
| S9 | Facility Admin | Provision permission | Permission `Active`, request `Provisioned` |
| S10 | Security | `POST /api/v1/rfid/events` (reader in the zone) | `Granted`; replaying the same `externalEventId` returns `isDuplicate: true`; the blocked old card is `Denied` with a violation |
| S11 | Auditor | Insights > Audit Trail, Reports > export CSV | All actions above listed with correlation IDs; CSV downloads |
| S12 | - | Send `X-User-Id` to the production API | Rejected |

## 7. Rollback

| Layer | Action |
|---|---|
| Web | `Remove-Item C:\inetpub\EIWAMS -Recurse; Rename-Item C:\inetpub\EIWAMS.prev EIWAMS` |
| API | `nssm stop EIWAMS-API; Remove-Item C:\EIWAMS\api -Recurse; Rename-Item C:\EIWAMS\api.prev api; nssm start EIWAMS-API` |
| Database | Scripts are forward-only. Take the API offline, then `RESTORE DATABASE EIWAMS FROM DISK = N'...bak' WITH REPLACE`. Data written after the backup is lost. |
| Tunnel | Restore the previous `config.yml`, `Restart-Service cloudflared`; stop the service to take the site offline |

## 8. Sign-off

- [ ] Smoke journey S1-S12 passed; build version, date and tester recorded
- [ ] Release-scope cases in [TEST-CASES.md](TEST-CASES.md) executed; no open Critical/High defects
- [ ] `.prev` folders deleted after the stabilization period
