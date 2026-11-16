# EIWAMS deployment checklist (on-premises)

Target topology: SQL Server (`localhost`, database `EIWAMS`), the Azure Functions host as Windows service `EIWAMS-API`
on `127.0.0.1:7274`, IIS site `EIWAMS` on :80 (SPA plus `/api` proxy), and an optional Cloudflare Tunnel publishing
`https://eiwams.example.com`. Run commands from the repository root in an elevated PowerShell. For Azure (GitHub
Actions, Flex Consumption, App Service, Azure SQL) follow [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md).

## 0. Pre-flight

- [ ] .NET 10 SDK, Node 24, Azure Functions Core Tools 4, `sqlcmd`, IIS + URL Rewrite 2.1 + ARR 3.0, NSSM, optional `cloudflared`
- [ ] EIWAMS-Web and EIWAMS-API registered ([ENTRA-SETUP.md](ENTRA-SETUP.md)); the production origin is a SPA redirect URI
- [ ] Admin/service users are provisioned with roles and facility scope; employee accounts are linked from HRMS/Entra or JIT-provisioned on sign-in when an Active employee has a matching work email
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
- [ ] Verify: `sqlcmd -S localhost -E -C -d EIWAMS -Q "SELECT COUNT(*) FROM dbo.Roles; SELECT COUNT(*) FROM dbo.Permissions; SELECT COUNT(*) FROM dbo.Menus"` returns 11 roles and the seeded v2 permissions/menus
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

Use the seeded DevHeader users for local validation and test employees/locations for deployed environments.
Employees already exist in HRMS/Entra ID: there is no employee-creation UI. Record evidence (screenshots and
correlation IDs) and follow [API-CONTRACT.md](API-CONTRACT.md) for the full state/permission rules.

| # | Actor | Step | Expected |
|---|---|---|---|
| S1 | any seeded user | Sign in and inspect the top navigation | Menus match the user's database-driven permissions; Auditor is read-only and no employee create/edit controls or routes are exposed |
| S2 | Entra user with a matching Active employee `WorkEmail` | Sign in for the first time | JIT provisioning links the employee, grants Employee (and Manager when they have active direct reports), and records the audit event |
| S3 | Entra user with no matching Active employee | Sign in | Access denied; no employee is created |
| S4 | Kiran (14) | Complete My Profile, upload a valid photo, and raise a New ID card request | Profile fields save; photo is JPEG/PNG <= 1 MB; request starts at `PendingManager` |
| S5 | Sai (11) -> Hari (2) -> Isha (12) | Approve -> verify -> approve; mark printed; issue | `PendingManager` -> `PendingHR` -> `PendingIdCardTeam` -> `Printing` -> `ReadyToIssue` -> `Closed`; new card is Active and UID is masked |
| S6 | Kiran (14) -> Sai (11) -> Hari (2) -> Sanjay (4) -> Isha (12) | Raise and process a Lost request | Old card is blocked on request, proceeds through manager and HR to Security review, is deactivated at security approval, then the new card is printed and issued |
| S7 | Esha (7) -> Meera (3) -> Sai (11) -> Farah (5) | Submit a Building access request and approve each stage | Manager -> SecurityHead -> AccessControl; status becomes Approved, then provisioning makes it Provisioned (shown as “Completed”) |
| S8 | Esha (7) -> Meera (3) -> Sanjay (4) -> Farah (5) | Submit a Wing/Floor access request and approve each stage | Manager -> Security -> AccessControl; target wing/floor belongs to the selected building |
| S9 | Arvind (13) | Provision an approved access request; then revoke a permission | Provisioning succeeds; revocation is reflected in the permission record |
| S10 | any approver | Try to approve their own request; reject without a reason | Self-approval returns 403; rejection without comments is rejected |
| S11 | authorized test user | Exercise allowed and blocked RFID swipes, review the resulting violation, inspect audit history/timeline and export a report | Decisions and violations are correct; workflow steps and notifications are present; audit entries include correlation IDs and CSV export succeeds |
| S12 | - | Send `X-User-Id` to the production API | Rejected; DevHeader is local-development only |

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
