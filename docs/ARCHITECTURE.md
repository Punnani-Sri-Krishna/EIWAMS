# EIWAMS architecture

EIWAMS (Employee Identity, Workplace Access and Monitoring System) is a modular monolith. An Angular SPA calls an
Azure Functions (.NET 10 isolated) HTTP API. SQL Server stored procedures, called through Dapper, enforce every
business rule. Routes, DTOs, permissions and menus are defined in [API-CONTRACT.md](API-CONTRACT.md), which is the
single source of truth; this document explains how the pieces fit together.

```
Angular 22 SPA (EIWAMS.Web)            top navigation, Lab Spectrum theme, MSAL (EntraId) or user picker (DevHeader)
   | HTTPS  /api/v1/...   Authorization: Bearer (EntraId) | X-User-Id (DevHeader), X-Correlation-Id
   v
IIS (static + ARR /api proxy)  ->  Azure Functions host :7274 (EIWAMS.API)
or Azure App Service (SPA)  ->  Flex Consumption Function App (Azure)
                                     |  Middleware: exception -> request context (auth, correlation) -> permission map
                                     |  Functions: thin HTTP adapters (bind, validate, envelope)
                                     v
                                   EIWAMS.Domain          services, workflow rules (access request, card, visitor pass)
                                     v
                                   EIWAMS.Application     DTOs, validators, ApiResponse, AppException/ErrorType, constants
                                     v
                                   EIWAMS.Infrastructure  Dapper repositories, SqlDbConnectionFactory, Entra token validation
                                     v
                                   SQL Server (EIWAMS)    tables, views, functions, usp_* procedures (SQL\01..12)
```

RFID readers or a gateway/simulator post normalized events to `POST /api/v1/rfid/events` (permission `Rfid.Ingest`).
There are no background jobs, queues, timers, SignalR hubs, caches or e-mail: every state change happens inside an
HTTP request and a SQL transaction, and users are informed through in-app `Notifications`.

## Layers

| Project | Responsibility |
|---|---|
| `EIWAMS.Web` | Standalone components, signals. Session (`v1/me`), DB-driven top navigation (`v1/me/menu`), guards, interceptors (auth, correlation id, errors), Chart.js dashboard. UI visibility never replaces server authorization. |
| `EIWAMS.API` | HTTP triggers under `v1/...`, middleware, request binding, response envelope, CSV export. No business logic. |
| `EIWAMS.Domain` | Services: input validation, workflow orchestration, calls to repositories. |
| `EIWAMS.Application` | Contracts: DTOs (camelCase JSON), validators, `ApiResponse<T>`, `PagedResult<T>`, `AppException`, `ErrorType`, constants (permission codes, statuses). |
| `EIWAMS.Infrastructure` | Dapper repositories (`RepositoryBase` maps SQL errors), connection factory, Entra JWT validation, SQL scripts `SQL\01..12`. |
| `EIWAMS.Tests` | xUnit + NSubstitute unit tests (validators, permission map coverage, workflow, middleware) and SQL integration tests against `EIWAMS_Test` (skipped when unavailable). |

## Request pipeline

1. **Exception middleware** converts any exception into `{ success:false, message, errors, correlationId }`.
   `AppException(ErrorType)` maps to 400/403/404/409/422; anything unexpected maps to 500 without details.
2. **Request context middleware** reads or creates `X-Correlation-Id` (echoed back) and authenticates the caller:
   * `DevHeader`: `X-User-Id` -> user context from SQL (local development only).
   * `EntraId`: validates the JWT (signature, issuer, audience, lifetime, `scp` contains `access_as_user`, optional
     group gate), then resolves the EIWAMS user by Entra object ID or e-mail. `X-User-Id` is rejected.
3. **Permission middleware** looks up the function name in a static permission map (contract section 6) and returns 403
   when the user lacks every listed code. Only `auth/config` and `v1/dev/users` are anonymous. Unmapped functions are
   denied (a unit test asserts full coverage).
4. **Function -> service -> repository -> stored procedure.** Every mutating procedure takes
   `@ActorUserId, @CorrelationId, @IpAddress`, re-checks row and facility scope, writes `AuditLogs` and in-app
   `Notifications` in the same transaction.
5. SQL errors map as `THROW 50400/50403/50404/50409/50422` -> 400/403/404/409/422, 2601/2627 -> 409, 547 -> 400.

## Authorization model

* **Roles** (8): Employee, Manager, HRAdmin, SecurityTeam, FacilityAdmin, Reception, SystemAdmin, Auditor.
* **Permissions** (`Module.Action`, for example `Cards.Block`, `Approvals.Decide`) granted through `RolePermissions`.
  Users can hold several roles. Changes apply on the next request; no token refresh or redeploy.
* **Facility scope**: `Users.AllFacilities` or `UserFacilityScopes`; a scope on a parent location covers its
  descendants (`fn_UserCanAccessLocation`). Out-of-scope rows return 404 (concealed).
* **Self/team scope**: `Employees.View` without `Employees.ViewAll` returns self and direct reports only.
* **Menus**: `Menus` + `MenuPermissions` drive the top navigation sections (contract section 4).

## Workflows (summary)

| Entity | States |
|---|---|
| Access request | Draft -> Submitted -> PendingApproval (Manager -> Security -> FacilityAdmin) -> Approved -> Provisioned; Returned, Rejected, Cancelled, Expired |
| Card | Requested -> Active -> Lost / Blocked / Damaged / Expired / Deactivated (report lost blocks immediately) |
| Card request | Submitted -> VerificationPending -> Approved -> Issued; Rejected, Cancelled |
| Violation / incident | Open -> UnderReview -> Confirmed / FalsePositive -> Closed |
| Visitor pass | PendingApproval -> Approved -> Active -> CheckedOut; Expired, Revoked |

RFID ingest (`usp_RfidEvent_Ingest`) deduplicates on `(ReaderId, ExternalEventId)`, evaluates employee, card, permission
(location or ancestor) and blacklist, writes `AccessLogs` and raises `AccessViolations`. Controller sync is simulated
(`ControllerCommands`, `Pending -> Synced`).

## Data protection

* Card UIDs are never returned in full (`maskedCardUid`), and never logged.
* Tokens, secrets and visitor contact details are not logged. Audit rows are append-only for application roles.
* All SQL is parameterized (stored procedures only, no inline SQL, no EF Core).

## Hosting options

| Option | Web | API | Database | Docs |
|---|---|---|---|---|
| On-premises | IIS site `EIWAMS` (SPA + ARR `/api` proxy) | Functions host service `EIWAMS-API` on `127.0.0.1:7274` | SQL Server `EIWAMS` | [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) |
| Public access | Cloudflare Tunnel -> IIS | same origin | - | [deploy/cloudflare](../deploy/cloudflare/README.md) |
| Azure | App Service `eiwams-web-<env>` | Flex Consumption `eiwams-func-<env>` | Azure SQL `eiwams-sql-<env>/EIWAMS` | [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md) |

## Out of scope by design

E-mail/SMTP, mail templates, reminder and escalation engines, storage accounts for application data, blobs, queues,
file uploads, microservices, event/service bus, Redis, background jobs/timers, Hangfire and SignalR.
