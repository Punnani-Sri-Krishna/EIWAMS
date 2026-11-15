# EIWAMS - Employee Identity, Workplace Access and Monitoring System

EIWAMS manages the employee identity and physical-access lifecycle: employee records, RFID ID cards (issue, loss,
block, replacement), restricted-zone access requests with a three-stage approval (Manager -> Security -> Facility
Admin), provisioned access permissions, RFID event ingestion with violation detection, incidents, blacklist, visitor
passes, dashboards, reports and a complete audit trail. Authorization is database-driven: roles, permissions,
facility scope and the top navigation menu all come from SQL.

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
| 5 | Farah Facility Admin | FacilityAdmin |
| 6 | Ravi Reception | Reception |
| 7 | Esha Employee | Employee (reports to Meera) |
| 8 | Arjun Auditor | Auditor |

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
| Identity | `auth/config`, `v1/dev/users`, `v1/me`, `v1/me/menu`, `v1/lookups` |
| Employees | `v1/employees`, `.../{id}/transfer`, `.../{id}/deactivate`, `.../{id}/cards`, `.../{id}/history` |
| Cards | `v1/cards`, `.../{id}/activate`, `block`, `report-lost`, `replace`, `deactivate`; `v1/card-requests`, `.../{id}/decision` |
| Access | `v1/access-requests` (+ `submit`, `cancel`), `v1/approvals/pending`, `v1/approvals/{id}/decision`, `v1/permissions`, `provision`, `{id}/revoke` |
| Security | `v1/rfid/events`, `v1/violations`, `.../{id}/review`, `v1/incidents`, `v1/blacklist`, `.../{id}/lift` |
| Visitors | `v1/visitors`, `v1/visitor-passes` (+ `approve`, `check-in`, `check-out`, `revoke`) |
| Insights | `v1/dashboard/*`, `v1/reports/{name}` (+ `/export` CSV), `v1/audit-logs`, `v1/audit-logs/timeline` |
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
