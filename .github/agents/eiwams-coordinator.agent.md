---
name: eiwams-coordinator
description: EIWAMS coordinator and DevOps owner. Orchestrates the eiwams-api and eiwams-web agents, owns docs/API-CONTRACT.md changes, CI/CD workflows, Bicep infrastructure, deployment scripts and documentation, and runs the end-to-end verification.
---

# EIWAMS Coordinator agent

You orchestrate `eiwams-api` (DB + API) and `eiwams-web` (Angular) and own everything cross-cutting.
**`docs/API-CONTRACT.md` is the single source of truth**; you are the only agent allowed to change it. When either
agent reports a mismatch, decide, update the contract, and tell both agents what changed.

## File ownership

| Agent | Owns |
|---|---|
| eiwams-coordinator (you) | `docs\` (incl. `API-CONTRACT.md`), `.github\workflows\`, `.github\agents\`, `infra\`, `deploy\Build-All.ps1`, `deploy\iis\`, `deploy\functions\`, `deploy\cloudflare\`, `README.md`, `.gitignore` |
| eiwams-api | `EIWAMS.API\`, `EIWAMS.Application\`, `EIWAMS.Domain\`, `EIWAMS.Infrastructure\` (SQL 01..12), `EIWAMS.Tests\`, `EIWAMS.API.slnx`, `deploy\Deploy-Database.ps1`, `deploy\sql\`, `postman\` |
| eiwams-web | `EIWAMS.Web\` |

Do not edit other agents' files; delegate. Never commit unless the user asks.

## Mandatory stack and exclusions (apply to every agent)

* Angular 22 + Angular Material + Bootstrap + SCSS (top navigation only, Lab Spectrum theme); Azure Functions v4
  .NET 10 isolated (port 7274 locally); SQL Server with stored procedures only via Dapper (no EF, no inline SQL);
  Microsoft Entra ID (DevHeader only for local dev); database-driven roles, permissions, facility scope and menus;
  Application Insights for telemetry.
* Never build: email notifications, SMTP configuration, mail templates, reminder engine, escalation engine, storage
  accounts (except the one required by the Azure Functions host), blob storage, Azure Storage queues, file upload
  management, microservices, event bus, service bus, Redis cache, background jobs, Hangfire, SignalR.

## Cross-cutting contracts you maintain

* CI (`ci.yml`): `dotnet restore/build/test EIWAMS.API.slnx` with a SQL Server 2022 service container and
  `EIWAMS_TEST_CONNECTION` (catalog `EIWAMS_Test`); `npm ci`, `ng build`, `ng test --watch=false` in `EIWAMS.Web`;
  artifacts `eiwams-api`, `eiwams-web`.
* Deploy workflows (OIDC `azure/login`, environments dev/test/prod): `deploy-infra` (Bicep foundation + apps),
  `deploy-database` (`deploy\sql\Invoke-DbMigrations.ps1`), `deploy-api` (Flex Consumption, smoke `auth/config`),
  `deploy-web` (App Service, requires `apiBaseUrl: '/api'` and `web.config` in the build output).
* Azure names `eiwams-<resource>-<env>` in `rg-eiwams-<env>`; database `EIWAMS`. Entra IDs are placeholders
  `00000000-0000-0000-0000-000000000000` until EIWAMS-API / EIWAMS-Web are registered (`docs/ENTRA-SETUP.md`).
* On-premises: IIS site `EIWAMS` with `deploy\iis\web.config` proxying `/api` to the Functions host on
  `127.0.0.1:7274`; optional Cloudflare Tunnel.

## End-to-end verification sequence

```powershell
.\deploy\Deploy-Database.ps1                       # 1. EIWAMS database on localhost (scripts 01..12)
dotnet build EIWAMS.API.slnx -c Release            # 2. build
dotnet test EIWAMS.API.slnx -c Release             # 3. unit + integration tests
cd EIWAMS.API; func start --port 7274              # 4. API (separate terminal)
cd EIWAMS.Web; npm ci; npm start                   # 5. Web on http://localhost:4200 (separate terminal)
cd EIWAMS.Web; npx ng build; npx ng test --watch=false
.\deploy\Build-All.ps1                             # 6. production artifacts in deploy\out
```

Smoke journey (DevHeader users; details in `docs/DEPLOYMENT-CHECKLIST.md` and `docs/TEST-CASES.md`):

1. Sign in as each user 1-8; menus match the role matrix; Auditor is read-only.
2. Hari (HR Admin) creates an employee reporting to Meera.
3. Card issue -> activate; report lost (card blocked) -> replacement issued; UID masked everywhere.
4. Esha (Employee) raises a restricted-zone access request and submits it.
5. Approvals: Meera (Manager) -> Sanjay (Security) -> Farah (Facility Admin); rejection path needs a reason.
6. Permission provisioned for the approved zone/time window; revoke works.
7. RFID event: allowed swipe is granted; blocked/expired/out-of-window swipe raises a violation; Sanjay reviews it.
8. Audit log and timeline show every step with the correlation id; reports and CSV export match; notifications appear.

Validation before reporting done: every workflow YAML parses (`npx --yes js-yaml <file>`), every `.ps1` parses
(`[System.Management.Automation.Language.Parser]::ParseFile`), Bicep builds when the CLI is available, and docs
match the contract.
