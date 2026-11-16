# EIWAMS - Employee Identity, Workplace Access and Monitoring System

EIWAMS is ID Card + Workplace Access Management for employees that already exist in HRMS / Microsoft Entra ID
(employees are not created in the UI; they sign in and are provisioned just-in-time, or arrive through
`POST v1/employees/sync`). Employees maintain their profile and photo, raise ID card requests (New, Lost, Damaged)
and building or wing/floor access requests, and track them under My Requests. Security modules (RFID monitor,
violations, incidents, blacklist, visitors), reports and a complete audit trail remain. Authorization is
database-driven: roles, permissions, facility scope and the top navigation menu all come from SQL.

Flows (exact states in [docs/API-CONTRACT.md](docs/API-CONTRACT.md) §5):

* **ID card request:** Manager approval -> HR verification -> (Lost only) Security review -> ID Card Team approval ->
  Printing -> Ready to Issue -> Issued/Closed. Lost cards are blocked immediately and deactivated at security review.
* **Access request:** Manager -> Security Head (Building) or Security Officer (Wing/Floor) -> Access Control Team,
  then provisioning (shown as Completed). Durations: 1 week, 1/3/6 months, 1 year, permanent, custom.
* Employee photos (JPEG/PNG, <= 1 MB, resized to 600x600 in the browser) are stored in SQL, not blob storage.

Roles: Employee, Manager, HRAdmin, SecurityTeam (Security Officer), SecurityHead, IdCardTeam, AccessControlTeam,
FacilityAdmin, Reception, SystemAdmin, Auditor.

| Layer | Technology | Folder |
|---|---|---|
| Web | Angular 22, Angular Material, Bootstrap 5, SCSS, Chart.js, MSAL | `EIWAMS.Web` |
| API | Azure Functions v4, .NET 10 isolated worker | `EIWAMS.API` |
| Domain | Services and workflow orchestration | `EIWAMS.Domain` |
| Application | DTOs, validators, response envelope, constants | `EIWAMS.Application` |
| Infrastructure | Dapper repositories, Entra token validation, SQL scripts | `EIWAMS.Infrastructure` |
| Database | SQL Server; stored procedures only | `EIWAMS.Infrastructure\SQL` (01..12) |
| Tests | xUnit + NSubstitute (unit and SQL integration) | `EIWAMS.Tests` |

## Prerequisites

* .NET 10 SDK
* Node.js 24 (npm 11)
* Azure Functions Core Tools 4 (`winget install Microsoft.Azure.FunctionsCoreTools`)
* SQL Server on `localhost` (default instance, Windows authentication) and `sqlcmd`
* Optional: Postman or VS Code REST Client

## Quick start (local, DevHeader mode)

```powershell
# 1. Database: creates/updates EIWAMS and applies EIWAMS.Infrastructure\SQL\01..12 (schema, procs, seed, demo data)
.\deploy\Deploy-Database.ps1

# 2. API -> http://localhost:7274/api
#    Copy EIWAMS.API\local.settings.sample.json to local.settings.json (git-ignored): Auth:Mode=DevHeader,
#    SqlConnectionString, Host.CORS=http://localhost:4200. See docs\ENVIRONMENT-VARIABLES.md.
cd EIWAMS.API
func start --port 7274

# 3. Web -> http://localhost:4200 (/api is proxied to http://127.0.0.1:7274 by proxy.conf.json)
cd ..\EIWAMS.Web
npm ci
npm start
```

Open http://localhost:4200. In **DevHeader** mode the sign-in page lists the seeded users from
`GET /api/v1/dev/users`; the SPA then sends `X-User-Id` on every call.

| Id | User | Role |
|---|---|---|
| 1 | System Administrator | SystemAdmin |
| 2 | Hari HR Admin | HRAdmin |
| 3 | Meera Manager | Manager |
| 4 | Sanjay Security | SecurityTeam |
| 5 | Farah Facility Admin | FacilityAdmin, AccessControlTeam |
| 6 | Ravi Reception | Reception |
| 7 | Esha Employee | Employee (reports to Meera) |
| 8 | Arjun Auditor | Auditor |
| 11 | Sai Sharanya (`sai.sharanya@eiwams.local`) | Employee, Manager, SecurityHead |
| 12 | Isha Card Desk (`idcard.team@eiwams.local`) | Employee, IdCardTeam |
| 13 | Arvind Access Control (`access.control@eiwams.local`) | Employee, AccessControlTeam |
| 14 | Kiran Das | Employee (reports to Sai) |
| 15 | Neha Joshi | Employee (reports to Sai) |

Use Microsoft Entra ID (`Auth:Mode=EntraId`) in every deployed environment. The EIWAMS-Web (SPA) and EIWAMS-API
registrations are not created yet; configuration uses the placeholder `00000000-0000-0000-0000-000000000000` until
they are ([docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md)).

Tests: `dotnet test EIWAMS.API.slnx` (integration tests target `EIWAMS_Test` and skip when it is unavailable;
override with `EIWAMS_TEST_CONNECTION`) and `npx ng test --watch=false` in `EIWAMS.Web`. Postman samples are in
`postman\`.

## API at a glance

All routes are under `/api`; business routes under `/api/v1`. Responses use the envelope
`{ success, message, data, errors, correlationId }`; paged data is `{ items, totalCount, page, pageSize }`.
The full contract (routes, permissions, DTOs, states) is [docs/API-CONTRACT.md](docs/API-CONTRACT.md).

| Area | Routes |
|---|---|
| Identity | `auth/config`, `v1/dev/users`, `v1/me`, `v1/me/menu`, `v1/me/profile`, `v1/me/photo`, `v1/lookups` |
| Employees | `v1/employees`, `.../{id}/photo`, `.../{id}/transfer`, `.../{id}/deactivate`, `.../{id}/cards`, `.../{id}/history`, `v1/employees/sync` |
| Cards | `v1/cards`, `.../{id}/activate`, `block`, `report-lost`, `replace`, `deactivate`; `v1/card-requests`, `.../queue`, `.../{id}`, `.../{id}/decision` |
| Access | `v1/access-requests` (+ `submit`, `cancel`), `v1/approvals/pending`, `v1/approvals/team`, `v1/approvals/{id}/decision`, `v1/permissions`, `provision`, `{id}/revoke` |
| Security | `v1/rfid/events`, `v1/violations`, `.../{id}/review`, `v1/incidents`, `v1/blacklist`, `.../{id}/lift` |
| Visitors | `v1/visitors`, `v1/visitor-passes` (+ `approve`, `check-in`, `check-out`, `revoke`) |
| Insights | `v1/dashboard/home`, `v1/dashboard/*`, `v1/reports/{name}` (+ `/export` CSV), `v1/audit-logs`, `v1/audit-logs/timeline` |
| Notifications | `v1/notifications`, `unread-count`, `{id}/read`, `read-all` |
| Admin | `v1/admin/users`, `roles`, `roles/{id}/permissions`, `permissions`, `settings`; `v1/departments`, `v1/locations`, `v1/readers` |

## Solution layout

```
EIWAMS/
  EIWAMS.API.slnx
  EIWAMS.API/              Functions, middleware, Program.cs, local.settings.sample.json
  EIWAMS.Application/      DTOs, validators, ApiResponse, AppException, constants
  EIWAMS.Domain/           Services, workflow
  EIWAMS.Infrastructure/   Repositories, data access, Auth (Entra), SQL\01..12 scripts
  EIWAMS.Tests/            Unit and integration tests
  EIWAMS.Web/              Angular SPA (top navigation, Lab Spectrum theme), public\web.config
  .github/workflows/       ci, deploy-infra, deploy-database, deploy-api, deploy-web
  .github/agents/          eiwams-api, eiwams-web, eiwams-coordinator agent definitions
  deploy/                  Build-All.ps1, Deploy-Database.ps1, sql\, iis\, functions\, cloudflare\
  infra/                   Bicep (foundation + apps), parameters per environment, one-time SQL identity scripts
  docs/                    Contract, architecture, Entra, environment, deployment, test cases
  postman/                 Postman collection and environment
```

## Documentation

* [API contract](docs/API-CONTRACT.md): single source of truth for routes, DTOs, permissions, menus and workflows
* [Architecture](docs/ARCHITECTURE.md): layers, request pipeline, authorization model, workflows, hosting
* [Microsoft Entra ID setup](docs/ENTRA-SETUP.md): registering EIWAMS-Web and EIWAMS-API, `access_as_user`, user mapping
* [Environment variables](docs/ENVIRONMENT-VARIABLES.md): every API setting (dev and prod) and the Angular environments
* [Deployment checklist](docs/DEPLOYMENT-CHECKLIST.md): SQL, Functions host, IIS, Cloudflare Tunnel, smoke journey, rollback
* [Azure deployment](docs/AZURE-DEPLOYMENT.md): GitHub Actions (OIDC), Bicep, Flex Consumption API, App Service web, Azure SQL migrations
* [Test cases](docs/TEST-CASES.md): TC-01..TC-25, UI cases, role matrix, E2E flows, UAT
* Hosting notes: [IIS](deploy/iis/README.md), [Functions](deploy/functions/README.md), [Cloudflare Tunnel](deploy/cloudflare/README.md)

## Production build

```powershell
.\deploy\Build-All.ps1        # build + test + publish API + Angular build -> deploy\out\{api,web}
```

Then follow [docs/DEPLOYMENT-CHECKLIST.md](docs/DEPLOYMENT-CHECKLIST.md) (on-premises) or
[docs/AZURE-DEPLOYMENT.md](docs/AZURE-DEPLOYMENT.md) (Azure).
