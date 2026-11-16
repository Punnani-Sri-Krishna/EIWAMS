# EIWAMS shared implementation contract

Single source of truth shared by the API, Web, and DevOps work streams (v2: revised ID card / access flow). Change it only through the coordinator, and keep
the API, SQL, and Angular code in sync with it.

## 1. Solution layout

```
EIWAMS/
  EIWAMS.API.slnx
  EIWAMS.API/              Azure Functions v4, .NET 10 isolated (port 7274). Functions\, Middleware\, Helpers\, Program.cs
  EIWAMS.Application/      Models\DTOs\<Module>\, Constants\, Common\ (ApiResponse, AppException, ErrorType, PagedResult), Validators\, Abstractions\
  EIWAMS.Domain/           Services\Interfaces\, Services\Implementations\, Workflow\
  EIWAMS.Infrastructure/   Repositories\Interfaces\, Repositories\Implementations\, DataAccessLayer\ (IDbConnectionFactory, SqlDbConnectionFactory, RepositoryBase), Auth\ (Entra), SQL\01..NN_*.sql
  EIWAMS.Tests/            xUnit + NSubstitute: Unit\, Integration\ (EIWAMS_Test database, skippable)
  EIWAMS.Web/              Angular 22 SPA (port 4200, /api proxied to http://127.0.0.1:7274)
  .github/workflows/       ci.yml, deploy-api.yml, deploy-database.yml, deploy-infra.yml, deploy-web.yml
  .github/agents/          eiwams-api, eiwams-web, eiwams-coordinator agent definitions
  deploy/  infra/  docs/  postman/
```

Reference implementation: `DLQTS\` (read-only, to be deleted later). Never reference, copy-link, or modify DLQTS files.
Copy patterns, not names: everything is `EIWAMS`.

Stack: Angular + Angular Material + Bootstrap 5 + SCSS + Chart.js + MSAL; Azure Functions (.NET 10 isolated);
Dapper; SQL Server stored procedures only (no EF Core, no inline SQL); Microsoft Entra ID; DB-driven roles/permissions/menus.
Out of scope (do not build): email/SMTP, mail templates, reminder/escalation engines, blob/storage queues, file upload management (the only binary data is the employee photo,
stored in SQL `VARBINARY` and sent as base64 JSON, see §5.5),
service bus/event bus, Redis, background jobs/timers, Hangfire, SignalR, microservices.

## 2. Local environment

| Item | Value |
|---|---|
| SQL Server | `localhost` (default instance, Windows auth) |
| Databases | `EIWAMS` (app), `EIWAMS_Test` (integration tests) |
| Connection | `Server=localhost;Database=EIWAMS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True` |
| API | `http://localhost:7274/api` (`func start --port 7274`) |
| Web | `http://localhost:4200`, `proxy.conf.json` maps `/api` to `http://127.0.0.1:7274` |
| Auth (local) | `Auth:Mode=DevHeader`, SPA sends `X-User-Id` |

`EIWAMS.API\local.settings.json` (git-ignored) and `local.settings.sample.json` (committed) use the DLQTS keys:
`Auth:Mode`, `Auth:Entra:TenantId`, `Auth:Entra:ClientId`, `Auth:Entra:SpaClientId`, `Auth:Entra:Audience`,
`Auth:Entra:RequiredScope` (`access_as_user`), `Auth:Entra:ApiScope`, `Auth:Entra:RequiredGroupId`, `SqlConnectionString`,
`Host.CORS=http://localhost:4200`. EIWAMS Entra IDs are placeholders `00000000-0000-0000-0000-000000000000` until registered.

The existing `EIWAMS` database contains a throw-away sample `dbo.Employees (Id, Name, Email)`. Script `01` drops it
when it lacks the `EmployeeNumber` column.

## 3. HTTP conventions

* Routes: `auth/config` (anonymous), `v1/dev/users` (anonymous, DevHeader only), every business route under `v1/...`.
* Envelope: `{ success, message, data, errors?, correlationId? }`. Paged data: `{ items, totalCount, page, pageSize }`.
  Query `page` (default 1) and `pageSize` (default 20, max 100), optional `search`, `sortBy`, `sortDir`.
* JSON is camelCase. Timestamps are UTC ISO 8601 with the `Utc` suffix in names. Dates are `yyyy-MM-dd`.
* Concurrency: mutable rows expose `version` (base64 rowversion). Updates send it back; stale returns 409.
* Errors: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found/concealed, 409 conflict/duplicate/invalid
  transition, 422 business rule, 429 rate limit, 500 generic. SQL `THROW 50400/50403/50404/50409/50422` map to these.
  2601/2627 map to 409, 547 to 400.
* Headers: `Authorization: Bearer` (EntraId) or `X-User-Id` (DevHeader), and `X-Correlation-Id` (client or generated,
  echoed back).
* Card UIDs are never returned in full. Lists return `maskedCardUid` (`****` + last 4).
* Every mutating stored procedure takes `@ActorUserId, @CorrelationId, @IpAddress`, writes `AuditLogs`, and writes in-app
  `Notifications` in the same transaction where applicable.

## 4. Roles, permissions, menus (seeded)

EIWAMS is ID Card + Workplace Access Management for employees that already exist in HRMS / Entra ID. Employees are
**not created in the EIWAMS UI** (HR sync / admin API only). No AI, agent or chatbot features in the product.

Roles (11): `Employee`, `Manager`, `HRAdmin`, `SecurityTeam` (UI label "Security Officer"), `SecurityHead`,
`IdCardTeam`, `AccessControlTeam`, `FacilityAdmin`, `Reception`, `SystemAdmin`, `Auditor`.

Permission codes (`Module.Action`; **new in v2** marked with *):

| Module | Codes |
|---|---|
| Dashboard | `Dashboard.View` |
| Employees | `Employees.View` (self/team), `Employees.ViewAll`, `Employees.Manage`, `Employees.Transfer`, `Employees.Deactivate`, `Employees.Sync`* |
| Cards | `Cards.View`, `Cards.ViewAll`, `Cards.Request`, `Cards.Verify` (legacy, kept in seed, unused by the v2 flow and menus), `Cards.Issue`, `Cards.Block`, `Cards.ManagerApprove`*, `Cards.HrVerify`*, `Cards.SecurityReview`*, `Cards.Process`* |
| Access | `AccessRequests.View`, `AccessRequests.ViewAll`, `AccessRequests.Create`, `Approvals.Decide`, `Approvals.Team`* |
| Permissions | `Permissions.View`, `Permissions.Provision`, `Permissions.Revoke` |
| RFID | `Rfid.View`, `Rfid.Ingest` |
| Security | `Violations.View`, `Violations.Review`, `Incidents.View`, `Incidents.Manage`, `Blacklist.View`, `Blacklist.Manage` |
| Visitors | `Visitors.View`, `Visitors.Manage`, `Visitors.Approve` |
| Reports | `Reports.View`, `Reports.Export`, `Audit.View` |
| Admin | `Users.Manage`, `Roles.Manage`, `Reference.Manage`, `Settings.Manage` |

Role grants (seeded with MERGE; existing grants are kept, v2 additions marked *):

| Role | Grants |
|---|---|
| Employee | `Dashboard.View`, `Employees.View`, `Cards.View`, `Cards.Request`, `AccessRequests.View`, `AccessRequests.Create` |
| Manager | Employee grants + `Approvals.Decide`, `Permissions.View`, `Reports.View`, `Approvals.Team`*, `Cards.ManagerApprove`* |
| HRAdmin | Employee grants + `Employees.ViewAll/Manage/Transfer/Deactivate`, `Cards.ViewAll/Issue`, `Reports.View/Export`, `Cards.HrVerify`*, `Employees.Sync`* |
| SecurityTeam | Employee grants + `Cards.ViewAll/Verify/Block/Issue`, `Approvals.Decide`, `Permissions.View/Revoke`, `Rfid.View/Ingest`, `Violations.*`, `Incidents.*`, `Blacklist.*`, `Visitors.View`, `Reports.View/Export`, `Audit.View`, `Cards.SecurityReview`* |
| SecurityHead* | `Dashboard.View`, `AccessRequests.View`, `Approvals.Decide`, `Cards.SecurityReview`, `Reports.View` |
| IdCardTeam* | `Dashboard.View`, `Cards.Process`, `Cards.ViewAll`, `Employees.View` |
| AccessControlTeam* | `Dashboard.View`, `AccessRequests.View`, `AccessRequests.ViewAll`, `Approvals.Decide`, `Permissions.View`, `Permissions.Provision` |
| FacilityAdmin | Employee grants + `Approvals.Decide`, `Permissions.*`, `Rfid.View`, `Visitors.View/Approve`, `Reference.Manage`, `Reports.View` (unchanged) |
| Reception | `Dashboard.View`, `Employees.View`, `Visitors.*`, `Rfid.View` (unchanged) |
| SystemAdmin | every code (including all new codes) |
| Auditor | `Dashboard.View`, every `*.View`/`*.ViewAll`, `Reports.*`, `Audit.View` (read-only; no new action codes) |

Automatic role grants (in `usp_User_ResolveEntra` and `usp_Employee_Sync`): every user linked to an Active employee
holds `Employee`; a user whose employee has at least one Active direct report (`Employees.ManagerEmployeeId`) is granted
`Manager`. Roles are only added automatically, never removed automatically.

Facility scope: `Users.AllFacilities` bit plus `UserFacilityScopes(UserId, LocationId)`. A scope on a parent location covers
all descendants (`fn_UserCanAccessLocation`). SystemAdmin, Auditor, Sai Sharanya and Arvind Access Control have
AllFacilities. Approver lookup for the stage roles `SecurityHead`, `SecurityTeam`, `AccessControlTeam` uses facility scope
when the user has scopes, and treats `AllFacilities=1` as covering everything.

### Menus

`Menus` + `MenuPermissions` drive the **top navigation** (seeded via MERGE keyed on `Route`). `section` is the top-level
item; a section with one entry renders as a link, more than one as a dropdown. Menu rows not listed below are set
`IsActive = 0` (not deleted) — this deactivates the old `/access-requests` and `/approvals` entries. `v1/me/menu`
returns only active rows the caller has any listed permission for, ordered by `sectionOrder, sortOrder`.

| Section (sectionOrder) | sortOrder | Label | Route | Icon | Permission (any) |
|---|---|---|---|---|---|
| Home (1) | 1 | Home | `/dashboard` | `home` | Dashboard.View |
| My Profile (2) | 1 | My Profile | `/profile` | `account_circle` | Dashboard.View |
| Requests (3) | 1 | Raise ID Card Request | `/cards/requests/new` | `badge` | Cards.Request |
| Requests | 2 | Raise Access Request | `/access-requests/new` | `vpn_key` | AccessRequests.Create |
| Requests | 3 | My Requests | `/my-requests` | `assignment` | Cards.View |
| Approvals (4) | 1 | Pending Approvals | `/approvals/manager` | `pending_actions` | Cards.ManagerApprove |
| Approvals | 2 | Team Requests | `/approvals/team` | `groups` | Approvals.Team |
| Approvals | 3 | HR Verification Queue | `/approvals/hr` | `fact_check` | Cards.HrVerify |
| Approvals | 4 | ID Card Processing Queue | `/approvals/id-card` | `print` | Cards.Process |
| Approvals | 5 | Security Approvals | `/approvals/security` | `shield` | Cards.SecurityReview |
| Approvals | 6 | Access Requests Review | `/approvals/access` | `task_alt` | Approvals.Decide |
| Approvals | 7 | Access Provisioning | `/permissions/provision` | `lock_open` | Permissions.Provision |
| Notifications (5) | 1 | Notifications | `/notifications` | `notifications` | Dashboard.View |
| Directory (6) | 1 | Employees | `/employees` | `contacts` | Employees.View, Employees.ViewAll |
| Directory | 2 | Cards | `/cards` | `contactless` | Cards.ViewAll |
| Directory | 3 | Permissions | `/permissions` | `verified_user` | Permissions.View |
| Security (7) | 1 | RFID Monitor | `/rfid-monitor` | `sensors` | Rfid.View |
| Security | 2 | Violations | `/violations` | `gpp_maybe` | Violations.View |
| Security | 3 | Incidents | `/incidents` | `policy` | Incidents.View |
| Security | 4 | Blacklist | `/blacklist` | `block` | Blacklist.View |
| Security | 5 | Visitors | `/visitors` | `person_pin_circle` | Visitors.View |
| Insights (8) | 1 | Reports | `/reports` | `analytics` | Reports.View |
| Insights | 2 | Audit Trail | `/audit` | `history` | Audit.View |
| Admin (9) | 1 | Users | `/admin/users` | `manage_accounts` | Users.Manage |
| Admin | 2 | Roles & Permissions | `/admin/roles` | `admin_panel_settings` | Roles.Manage |
| Admin | 3 | Departments | `/admin/departments` | `apartment` | Reference.Manage |
| Admin | 4 | Locations & Zones | `/admin/locations` | `location_city` | Reference.Manage |
| Admin | 5 | RFID Readers | `/admin/readers` | `settings_input_antenna` | Reference.Manage |
| Admin | 6 | Settings | `/admin/settings` | `tune` | Settings.Manage |

### Seed and demo users

DevHeader picker users (fixed `UserId`s; employees by `EmployeeNumber`):

| UserId | Display name | Email | Roles | Employee |
|---|---|---|---|---|
| 1 | System Administrator | `admin@eiwams.local` | SystemAdmin | - |
| 2-10 | existing seed/demo users (Hari HR, Meera Manager, Sanjay Security, Farah Facility Admin, Ravi Reception, Esha Employee, Arjun Auditor, Vikram, Priya) | existing | existing roles; **Farah (5) additionally gets AccessControlTeam** | existing |
| 11 | Sai Sharanya | `sai.sharanya@eiwams.local` | Employee, Manager, SecurityHead (AllFacilities=1) | EMP0011, ENG, "Engineering Manager" |
| 12 | Isha Card Desk | `idcard.team@eiwams.local` | Employee, IdCardTeam | EMP0012, HR, "ID Card Officer" |
| 13 | Arvind Access Control | `access.control@eiwams.local` | Employee, AccessControlTeam (AllFacilities=1) | EMP0013, SEC, "Access Control Officer" |
| 14 | Kiran Das | `kiran.das@eiwams.local` | Employee (reports to Sai) | EMP0014, ENG, "Software Engineer" |
| 15 | Neha Joshi | `neha.joshi@eiwams.local` | Employee (reports to Sai) | EMP0015, ENG, "QA Engineer" |

(Decision: the spec's EMP0012/EMP0013 for Kiran/Neha are reassigned to EMP0014/EMP0015 so every demo user has an
employee record; ids 11-15 are free in the current seed. If a fixed id is taken in an existing database, the demo
script skips that row rather than failing.) Every employee gets a `Designation`; a few get profile fields.

Demo locations (under the existing `BLR` campus; codes are unique keys):

| Code | Name | Type | Parent | Restricted |
|---|---|---|---|---|
| `BLR-BA` | Building A | Building | BLR | 0 |
| `BLR-BA-F1` | Floor 1 | Floor | BLR-BA | 0 |
| `BLR-BA-WE` | East Wing | Wing | BLR-BA | 0 |
| `BLR-BA-WW` | West Wing | Wing | BLR-BA | 0 |
| `BLR-BB` | Building B | Building | BLR | 0 |
| `BLR-BB-F1` / `BLR-BB-F2` | Floor 1 / Floor 2 | Floor | BLR-BB | 0 |
| `BLR-CO` | Corporate Office | Building | BLR | 0 |
| `BLR-CO-F1` | Floor 1 | Floor | BLR-CO | 0 |
| `BLR-CO-EXE` | Executive Wing | Wing | BLR-CO | 1 |
| `BLR-DCB` | Data Center | Building | BLR | 1 |
| `BLR-DCB-H1` | Server Hall 1 | Zone | BLR-DCB | 1 |

`Locations.LocationType` CHECK becomes `Campus, Building, Floor, Wing, Zone` (also in `usp_Location_Save` validation).
Demo card requests exist in every v2 status and access requests in every stage, created through the SPs in a separate
run-once block keyed on a marker (`SystemSettings` key `Demo.V2Seeded`) so it also runs on existing dev databases.

## 5. Workflows

### 5.1 Card request (v2)

Types stored: `New`, `Lost`, `Damaged`, `Replacement`, `Temporary`. The UI and `POST v1/card-requests` accept only
`New`, `Lost`, `Damaged` (others return 400). Statuses (exact strings; replace the CHECK constraint):

| Status | Stage key | UI label | Chip tone | Open? |
|---|---|---|---|---|
| `PendingManager` | `Manager` | Pending Manager | warning | yes |
| `PendingHR` | `HR` | HR Verification | warning | yes |
| `PendingSecurity` | `Security` | Security Review | warning | yes |
| `PendingIdCardTeam` | `IdCardTeam` | ID Card Team | warning | yes |
| `Printing` | `IdCardTeam` | Printing | info (teal) | yes |
| `ReadyToIssue` | `IdCardTeam` | Ready to Issue | info (teal) | yes |
| `Closed` | - | Issued | success | no |
| `Rejected` | - | Rejected | danger | no |
| `Cancelled` | - | Cancelled | neutral | no |

Data migration (guarded, idempotent): `Submitted -> PendingManager`, `VerificationPending -> PendingHR`,
`Approved -> Printing`, `Issued -> Closed`; `Rejected`/`Cancelled` unchanged.

Flow: `PendingManager -> PendingHR -> [Lost only: PendingSecurity] -> PendingIdCardTeam -> Printing -> ReadyToIssue -> Closed`.

Actions (exact strings, body of `POST v1/card-requests/{id}/decision` is `{ action, comments, version }`):

| From status | Actor (re-checked in SP) | action | To status | Side effects |
|---|---|---|---|---|
| PendingManager | the employee's manager's active user; if none, any active holder of `Cards.ManagerApprove`; SystemAdmin always | `Approve` | PendingHR | |
| PendingManager | same | `Reject` | Rejected | |
| PendingHR | `Cards.HrVerify` | `Verify` | PendingSecurity (Lost) / PendingIdCardTeam (others) | |
| PendingHR | `Cards.HrVerify` | `Reject` | Rejected | |
| PendingSecurity | `Cards.SecurityReview` | `Approve` | PendingIdCardTeam | old card -> `Deactivated` (permanent) |
| PendingSecurity | `Cards.SecurityReview` | `Reject` | Rejected | old card stays `Blocked` |
| PendingIdCardTeam | `Cards.Process` | `Approve` | Printing | |
| PendingIdCardTeam | `Cards.Process` | `Reject` | Rejected | |
| Printing | `Cards.Process` | `MarkPrinted` | ReadyToIssue | new `RFIDCards` row: `Status=Requested`, `CardType=Permanent`, generated UID (16 upper-case hex chars from `NEWID()`), `CardRequestId` set; `CardRequests.NewCardId` set |
| ReadyToIssue | `Cards.Process` | `Issue` | Closed | new card -> `Active`, `IssuedAtUtc = ActivatedAtUtc = now`, `ExpiresAtUtc = now + 3 years`; Lost/Damaged old card -> `Deactivated` if not already; `ClosedAtUtc = now` |
| PendingManager, PendingHR | requester (`RequestedByUserId`) or the employee's own user | `Cancel` | Cancelled | |

Rules and errors (SQL `THROW` number -> HTTP):

| Rule | Error |
|---|---|
| `action` not valid for the current status | 50409 -> 409 "Action '<a>' is not allowed in status '<s>'." |
| caller is not an actor for the current stage | 50403 -> 403 |
| self-approval: caller's linked employee = request employee (all actions except `Cancel`) | 50403 -> 403 "You cannot act on your own request." |
| `Reject` without comments (1..1000 chars after trim) | 400 (validator) |
| `comments` > 1000 chars | 400 |
| stale `version` | 50409 -> 409 |
| request not visible to caller | 50404 -> 404 |
| create: an open request already exists for the employee | 50409 -> 409 "An open card request already exists." |
| create `New`: employee already has an `Active` card | 50409 -> 409 |
| create `Lost`: no `Active` or `Blocked` card | 50422 -> 422 |
| create `Damaged`: no `Active` card | 50422 -> 422 |
| create `New` without photo when the employee has no `EmployeePhotos` row | 50422 -> 422 "A photo is required for a new ID card." |
| employee not Active | 50422 -> 422 |

Create side effects: status `PendingManager`; contact snapshot columns stored on `CardRequests` and written back to the
`Employees` profile; photo (if supplied) upserted into `EmployeePhotos`; for `Lost` the old card is immediately `Blocked`
(BR-03, `BlockReason = 'Reported lost: <requestNumber>'`); `OldCardId` = the Active card (Damaged) or Active/Blocked card
(Lost); `requestNumber` format unchanged (`CR-yyyy-nnnnn`).

Every create and transition writes a `CardRequestHistory` row (`HistoryId, CardRequestId, FromStatus (NULL on create),
ToStatus, Action ('Submit' on create), Comments, ActorUserId, CreatedAtUtc`), an `AuditLogs` row (entityType
`CardRequest`, action `CardRequest.<Action>`, e.g. `CardRequest.Submit`, `CardRequest.MarkPrinted`) and `Notifications`
(type `CardRequest`, route `/cards/requests/{id}`): the requester on every transition, plus the next-stage actors on
entering PendingManager (manager user, else all `Cards.ManagerApprove` holders), PendingHR (`Cards.HrVerify`),
PendingSecurity (`Cards.SecurityReview`), PendingIdCardTeam (`Cards.Process`). ReadyToIssue notifies the requester
"Your ID card is ready for collection".

`availableActions` (computed by the detail SP for the caller, in this order, only the applicable ones):
1. Primary stage action (`Approve` for PendingManager/PendingSecurity/PendingIdCardTeam, `Verify` for PendingHR,
   `MarkPrinted` for Printing, `Issue` for ReadyToIssue) — when the caller is an actor of the current stage and not the
   request's employee.
2. `Reject` — same condition, statuses PendingManager, PendingHR, PendingSecurity, PendingIdCardTeam.
3. `Cancel` — caller is the requester or the employee's user and status is PendingManager or PendingHR.
Terminal statuses return `[]`.

Stepper (web computes it from `requestType` + `status` + `history`): New/Damaged/Replacement/Temporary:
`Submitted, Manager, HR, ID Card Team, Printing, Ready to Issue, Issued`; Lost: `Submitted, Manager, HR, Security,
ID Card Team, Printing, Ready to Issue, Issued`. Steps before the current one are done; Rejected/Cancelled mark the
step where it stopped.

### 5.2 Card lifecycle

`Requested -> Active -> Lost | Blocked | Damaged | Expired | Deactivated` (unchanged). Reporting lost blocks immediately
(BR-03). One active Permanent card per employee; CardUid unique. Controller sync simulated (`Pending -> Synced`).

### 5.3 Access request (v2)

New columns on `AccessRequests` (guarded): `AccessType NVARCHAR(20) NOT NULL DEFAULT 'Building'` CHECK
`('Building','WingFloor')`, `BuildingLocationId INT NULL` FK `Locations`, `DurationCode NVARCHAR(20) NULL` CHECK
`('OneWeek','OneMonth','ThreeMonths','SixMonths','OneYear','Permanent','Custom')`.

Target rules: `Building` -> `locationId = buildingLocationId` and that location's type is `Building`. `WingFloor` ->
`locationId` is a strict descendant of `buildingLocationId` with type `Floor`, `Wing` or `Zone`. Violations -> 400.

Duration: `validFromUtc` defaults to now (must not be earlier than now - 5 minutes, else 400). `validToUtc` is computed
server-side: OneWeek +7 days, OneMonth +1 month, ThreeMonths +3 months, SixMonths +6 months, OneYear +1 year,
Permanent +10 years (stored value; UI shows "Permanent"). `Custom` requires `validToUtc` > `validFromUtc` and at most
1 year later; for non-Custom codes a supplied `validToUtc` is ignored.

Statuses unchanged: `Draft, Submitted, PendingApproval, Approved, Provisioned, Returned, Rejected, Cancelled, Expired`
(UI label for `Provisioned` is **"Completed"**). Approval stages (exact strings): `Manager`, `SecurityHead`, `Security`,
`AccessControl`:

| AccessType | stageOrder 1 | stageOrder 2 | stageOrder 3 |
|---|---|---|---|
| Building | `Manager` | `SecurityHead` | `AccessControl` |
| WingFloor | `Manager` | `Security` | `AccessControl` |

Approvers: Manager = the employee's manager's active user (fallback: users with role Manager in scope); SecurityHead =
users with role SecurityHead; Security = users with role SecurityTeam; AccessControl = users with role AccessControlTeam
(fallback SystemAdmin). Facility scope as in §4. Data migration: stored stage `FacilityAdmin -> AccessControl`;
stage CHECK = `('Manager','SecurityHead','Security','AccessControl')`; existing rows default `AccessType='Building'`.
Return/Reject require comments; the requester's employee cannot approve. After the final `AccessControl` approval the
status is `Approved`; an `AccessControlTeam` user then provisions (`POST v1/permissions/provision`) -> `Provisioned`.
Optional shortcut: decision body `provisionNow: true` at the `AccessControl` stage (caller must hold
`Permissions.Provision`) approves and provisions atomically. Notifications go to the requester and next-stage approvers
(route `/access-requests/{id}`).

### 5.4 Other workflows (unchanged)

* RFID ingest (`usp_RfidEvent_Ingest`): dedupe on `(ReaderId, ExternalEventId)` (duplicates return the original
  result), resolve card, evaluate employee status, card status/expiry, active in-date permission for the reader location
  or an ancestor (or the location is not restricted), and the blacklist. It persists `AccessLogs` and creates
  `AccessViolations` (BlockedCard, ExpiredPermission, UnauthorizedZone, RepeatedDenied when 3+ denials in 10 minutes,
  unknown card leads to EventAnomaly with Review status).
* Violation: `Open -> UnderReview -> Confirmed | FalsePositive -> Closed`. Incident has the same states plus assignment.
* Visitor pass: `PendingApproval -> Approved -> Active (check-in) -> CheckedOut`, or `Expired` / `Revoked`.
* Employee transfer: updates department/manager/location, writes `EmployeeHistory`, and suspends permissions outside the
  new location subtree for review. Deactivate (Exited/Inactive) blocks new requests, deactivates cards, and revokes
  permissions.

### 5.5 Identity, profile and photos

* JIT provisioning (`usp_User_ResolveEntra`): if no `Users` row matches the Entra object id or email but an Active
  `Employees` row has `WorkEmail = email`, create the user (`IsActive=1`), set `Employees.UserId`, grant `Employee`
  (+ `Manager` when the employee has Active direct reports), write `AuditLogs` (`User.JitProvision`), then continue.
* New `Employees` columns (guarded, all NULL): `Designation NVARCHAR(100)`, `MobileNumber NVARCHAR(20)`,
  `Address NVARCHAR(400)`, `BloodGroup NVARCHAR(5)` (CHECK in BloodGroups or NULL), `EmergencyContactName NVARCHAR(150)`,
  `EmergencyContactNumber NVARCHAR(20)`. The same five contact columns are added to `CardRequests` as a snapshot.
* Photos: table `dbo.EmployeePhotos (EmployeeId INT PK FK Employees, ContentType NVARCHAR(50) CHECK IN
  ('image/jpeg','image/png'), Photo VARBINARY(MAX) NOT NULL CHECK (DATALENGTH(Photo) <= 1048576), SizeBytes INT NOT NULL,
  UploadedAtUtc DATETIME2 NOT NULL, UploadedByUserId INT NULL)`. **Stored in SQL only; no blob storage.** Transported as
  JSON `{ photoContentType, photoBase64 }`: raw base64 (an optional `data:image/...;base64,` prefix is stripped
  server-side), decoded size 1..1,048,576 bytes, content type `image/jpeg` or `image/png`, and the decoded bytes must start
  with the matching signature (JPEG `FF D8 FF`, PNG `89 50 4E 47`); otherwise 400. `photoBase64` and
  `photoContentType` are both present or both absent. The web resizes/crops to a square of at most 600x600 JPEG
  (quality 0.85) before upload. Photo bytes are never written to AuditLogs (audit stores only size and content type).
* Validation formats: `mobileNumber` / `emergencyContactNumber` match `^\+?[0-9][0-9 -]{6,19}$`; `address` <= 400;
  `emergencyContactName` <= 150; `bloodGroup` in BloodGroups.

### 5.6 Enumerations (exact strings; all returned by `v1/lookups`)

| Lookup key | Values |
|---|---|
| `cardRequestTypes` | `New, Lost, Damaged, Replacement, Temporary` |
| `cardRequestTypesOffered` | `New, Lost, Damaged` |
| `cardRequestStatuses` | `PendingManager, PendingHR, PendingSecurity, PendingIdCardTeam, Printing, ReadyToIssue, Closed, Rejected, Cancelled` |
| `cardRequestStages` | `Manager, HR, Security, IdCardTeam` |
| `cardRequestActions` | `Approve, Reject, Verify, MarkPrinted, Issue, Cancel` |
| `damagedReasons` | `Scratched, Broken, RfidNotWorking, CardExpired, PhotoNotVisible` |
| `bloodGroups` | `A+, A-, B+, B-, AB+, AB-, O+, O-` |
| `accessTypes` | `Building, WingFloor` |
| `durationCodes` | `OneWeek, OneMonth, ThreeMonths, SixMonths, OneYear, Permanent, Custom` |
| `approvalStages` | `Manager, SecurityHead, Security, AccessControl` |
| `locationTypes` | `Campus, Building, Floor, Wing, Zone` |

## 6. Endpoints and DTOs

All payload names below are JSON (camelCase). `P<>` means a paged envelope. **Function** is the Azure Function name
(the key of the permission map). Existing functions keep their names; v2 functions use `Module_Action` names. The
permission map supports an "authenticated only" entry (as for `GetMe`). Route constraints: every `{id}` is `{id:int}`
so that literal segments (`v1/card-requests/queue`, `v1/employees/sync`) never bind to `{id}`.

### Identity, profile and lookups
| Method | Route | Function | Permission | Body / query -> data |
|---|---|---|---|---|
| GET | `auth/config` | GetAuthConfig | anonymous | -> `{ mode, tenantId, spaClientId, apiScope, authority }` |
| GET | `v1/dev/users` | GetDevUsers | anonymous (DevHeader only, else 404) | -> `[{ userId, displayName, email, roles }]` |
| GET | `v1/me` | GetMe | authenticated | -> `MeDto` |
| GET | `v1/me/menu` | GetMyMenu | authenticated | -> `[{ menuId, section, sectionOrder, label, icon, route, sortOrder }]` |
| GET | `v1/me/profile` | Me_GetProfile | authenticated | -> `MyProfileDto` (404 when the user has no employee link) |
| PUT | `v1/me/profile` | Me_UpdateProfile | authenticated | `UpdateMyProfileRequest` -> `MyProfileDto` (audited `Employee.ProfileUpdate`) |
| GET | `v1/me/photo` | Me_GetPhoto | authenticated | -> `PhotoDto` (404 when no photo or no employee link) |
| PUT | `v1/me/photo` | Me_PutPhoto | authenticated | `{ photoContentType, photoBase64 }` -> `PhotoInfoDto` (audited `Employee.PhotoUpdate`) |
| GET | `v1/lookups` | GetLookups | authenticated | -> `LookupsDto` |

`MeDto`: `userId, displayName, email, employeeId, employeeNumber, designation, departmentName, managerName, managerEmail,
locationName, hasPhoto, roles: string[], permissions: string[], allFacilities, facilityIds: number[]` (employee fields are
`null` and `hasPhoto=false` when the user has no employee link).

`MyProfileDto`: `{ employeeId: number, employeeNumber: string, fullName: string, workEmail: string|null, designation:
string|null, departmentName: string|null, managerName: string|null, managerEmail: string|null, locationName: string|null,
employmentStatus: string, joinDate: 'yyyy-MM-dd'|null, mobileNumber: string|null, address: string|null, bloodGroup:
string|null, emergencyContactName: string|null, emergencyContactNumber: string|null, hasPhoto: boolean, activeCard:
{ cardId: number, maskedUid: string, status: string, issuedAtUtc: string|null, expiresAtUtc: string|null } | null }`.
`activeCard` is the employee's `Active` card, else the most recent `Blocked` card, else `null`.

`UpdateMyProfileRequest`: `{ mobileNumber: string|null, address: string|null, bloodGroup: string|null,
emergencyContactName: string|null, emergencyContactNumber: string|null }` — contact details only, all five fields are
written (null clears), validated per §5.5; no `version` (last write wins).

`PhotoDto`: `{ contentType: 'image/jpeg'|'image/png', photoBase64: string, sizeBytes: number, uploadedAtUtc: string }`.
`PhotoInfoDto`: `{ hasPhoto: true, contentType, sizeBytes, uploadedAtUtc }`.

`LookupsDto`: `{ departments:[{id,code,name}], locations:[{id,code,name,locationType,parentLocationId,isRestricted}],
employees:[{id,name,employeeNumber}], users:[{id,name}], readers:[{id,name,locationId}], employeeTypes,
employmentStatuses, cardTypes, cardStatuses, cardRequestTypes, cardRequestTypesOffered, cardRequestStatuses,
cardRequestStages, cardRequestActions, damagedReasons, bloodGroups, accessTypes, durationCodes, accessRequestStatuses,
approvalStages, permissionStatuses, eventTypes, violationTypes, violationStatuses, severities, incidentTypes,
incidentStatuses, visitorPassStatuses, locationTypes }` (enumerations are `string[]`, values per §5.6).

### Employees (read-only directory in the UI)
| Method | Route | Function | Permission | Body / query -> data |
|---|---|---|---|---|
| GET | `v1/employees` | SearchEmployees | Employees.View | `search, employmentStatus, departmentId, locationId, employeeType` -> `P<EmployeeListItem>` |
| POST | `v1/employees` | CreateEmployee | Employees.Manage | `CreateEmployeeRequest` -> `EmployeeDetail` (API/admin only, no UI) |
| GET | `v1/employees/{id}` | GetEmployee | Employees.View | -> `EmployeeDetail` (self, team, or ViewAll; otherwise 404) |
| PUT | `v1/employees/{id}` | UpdateEmployee | Employees.Manage | `UpdateEmployeeRequest` -> `EmployeeDetail` (API/admin only, no UI) |
| POST | `v1/employees/{id}/transfer` | TransferEmployee | Employees.Transfer | `{ departmentId, managerEmployeeId?, locationId, effectiveDate, reason }` -> `EmployeeDetail` |
| POST | `v1/employees/{id}/deactivate` | DeactivateEmployee | Employees.Deactivate | `{ employmentStatus: 'Exited'or'Inactive', endDate, reason }` -> `EmployeeDetail` |
| GET | `v1/employees/{id}/cards` | GetEmployeeCards | Cards.View | -> `Card[]` |
| GET | `v1/employees/{id}/history` | GetEmployeeHistory | Employees.View | -> `[{ historyId, changeType, summary, effectiveDate, changedByName, changedAtUtc }]` |
| GET | `v1/employees/{id}/photo` | Employees_GetPhoto | Cards.Process, Cards.HrVerify, Cards.SecurityReview, Cards.ManagerApprove, Employees.ViewAll | -> `PhotoDto` (404 when none; `Cards.ManagerApprove`-only callers see direct reports only) |
| POST | `v1/employees/sync` | Employees_Sync | Employees.Sync | `EmployeeSyncRequest` -> `{ inserted, updated, deactivated }` |

`EmployeeListItem`: `employeeId, employeeNumber, firstName, lastName, fullName, workEmail, designation, employeeType,
departmentId, departmentName, managerEmployeeId, managerName, locationId, locationName, employmentStatus, joinDate,
endDate, activeCardCount, hasPhoto`.
`EmployeeDetail` = list item + `userId, mobileNumber, address, bloodGroup, emergencyContactName, emergencyContactNumber,
activePermissionCount, openAccessRequestCount, createdAtUtc, updatedAtUtc, version`.
`CreateEmployeeRequest`: `employeeNumber, firstName, lastName, workEmail, designation?, employeeType, departmentId,
managerEmployeeId?, locationId, joinDate, endDate?, userId?`. `UpdateEmployeeRequest`: same without `employeeNumber`,
plus `version`.

`EmployeeSyncRequest`: `{ employees: [{ employeeNumber, firstName, lastName, workEmail, designation, departmentCode,
managerEmployeeNumber, locationCode, employeeType, employmentStatus, joinDate, endDate }] }`, 1..500 rows (else 400).
Upsert by `employeeNumber` via `OPENJSON` in one transaction; managers resolved after all rows are upserted (may
reference rows in the same batch or existing employees). Unknown `departmentCode`/`locationCode`/
`managerEmployeeNumber` -> the whole batch fails with 400 listing the row numbers. `employmentStatus` `Exited` or
`Inactive` on a previously Active employee deactivates the linked user, deactivates Active/Blocked cards and revokes
permissions (reuses the deactivate logic) and counts in `deactivated`. Grants `Manager` per §4. Audited `Employee.Sync`.

### Cards
| Method | Route | Function | Permission | Body / query -> data |
|---|---|---|---|---|
| GET | `v1/cards` | SearchCards | Cards.View | `search, status, cardType, employeeId` -> `P<Card>` (own cards unless ViewAll) |
| POST | `v1/cards` | CreateCard | Cards.Issue | `{ employeeId, cardUid, cardType, expiresAtUtc?, cardRequestId? }` -> `Card` (status Requested) |
| POST | `v1/cards/{id}/activate` | ActivateCard | Cards.Issue | `{ version }` -> `Card` |
| POST | `v1/cards/{id}/block` | BlockCard | Cards.Block | `{ reason, version }` -> `Card` |
| POST | `v1/cards/{id}/report-lost` | ReportLostCard | Cards.Block | `{ reason }` -> `Card` (blocks immediately; **no longer creates a card request** — employees raise a `Lost` card request instead) |
| POST | `v1/cards/{id}/replace` | ReplaceCard | Cards.Issue | `{ newCardUid, reason, version }` -> `Card` (new) |
| POST | `v1/cards/{id}/deactivate` | DeactivateCard | Cards.Block | `{ reason, version }` -> `Card` |

`Card`: `cardId, maskedCardUid, employeeId, employeeNumber, employeeName, cardType, status, issuedAtUtc, activatedAtUtc,
expiresAtUtc, blockedAtUtc, blockReason, controllerSyncStatus, replacedByCardId, cardRequestId, version`.

### Card requests (v2)
| Method | Route | Function | Permission | Body / query -> data |
|---|---|---|---|---|
| GET | `v1/card-requests` | SearchCardRequests | Cards.View | `mine, status, requestType, employeeId, search, page, pageSize` -> `P<CardRequest>` (`mine=true`: requests for the caller's employee or raised by the caller; without `Cards.ViewAll` the result is always limited to `mine`) |
| GET | `v1/card-requests/queue` | CardRequests_Queue | Cards.ManagerApprove, Cards.HrVerify, Cards.SecurityReview, Cards.Process | `stage` (required: `Manager`, `HR`, `Security`, `IdCardTeam`), `search, page, pageSize` -> `P<CardRequest>` |
| GET | `v1/card-requests/{id}` | CardRequests_Get | Cards.View, Cards.ViewAll, Cards.ManagerApprove, Cards.HrVerify, Cards.SecurityReview, Cards.Process, Approvals.Team | -> `CardRequestDetail` |
| POST | `v1/card-requests` | CreateCardRequest | Cards.Request | `CreateCardRequestRequest` -> `CardRequestDetail` |
| POST | `v1/card-requests/{id}/decision` | CardRequests_Decide | Cards.Request, Cards.ManagerApprove, Cards.HrVerify, Cards.SecurityReview, Cards.Process | `{ action, comments, version }` -> `CardRequestDetail` |

`CardRequests_Decide` replaces the old `DecideCardRequest` function (same route; body field `decision` is renamed
`action`). Stage-level authorization is re-checked in the SP per §5.1.

Queue semantics (`CardRequests_Queue`): the caller must hold the stage permission (`Manager`→`Cards.ManagerApprove`,
`HR`→`Cards.HrVerify`, `Security`→`Cards.SecurityReview`, `IdCardTeam`→`Cards.Process`), else 403. Returns only
requests on which the caller has a primary action (`availableActions` non-empty excluding `Cancel`): `Manager` =
PendingManager where the caller is the assigned manager/fallback/SystemAdmin; `HR` = PendingHR; `Security` =
PendingSecurity; `IdCardTeam` = PendingIdCardTeam, Printing and ReadyToIssue. Own requests are excluded. Ordered by
`requestedAtUtc` ascending (oldest first). `search` matches requestNumber, employee name/number.

Detail visibility (`CardRequests_Get`; otherwise 404): the employee's user or the requester; the assigned manager
(or `Approvals.Team` holder whose direct report it is); any holder of `Cards.ViewAll`, `Cards.HrVerify`,
`Cards.SecurityReview`, `Cards.Process`; SystemAdmin.

`CreateCardRequestRequest`: `{ employeeId?: number, requestType: 'New'|'Lost'|'Damaged', reason: string|null,
mobileNumber: string, address: string, bloodGroup: string, emergencyContactName: string, emergencyContactNumber: string,
photoBase64?: string|null, photoContentType?: string|null }`. `employeeId` omitted = caller's linked employee (no link
-> 422); a different `employeeId` requires `Employees.ViewAll` (else 403). `reason`: New optional (<= 500); Lost
required free text 5..500 chars; Damaged required, one of `damagedReasons`. All five contact fields are required here
(validated per §5.5). Photo rules per §5.5; required for New when the employee has no photo (422).

`CardRequest` (list/queue item): `{ cardRequestId, requestNumber, requestType, employeeId, employeeNumber, employeeName,
designation, departmentName, managerName, reason, status, currentStage ('Manager'|'HR'|'Security'|'IdCardTeam'|null),
oldCardId, oldMaskedCardUid, newCardId, newMaskedCardUid, requestedByUserId, requestedByName, requestedAtUtc,
updatedAtUtc, closedAtUtc, lastActionByName, lastActionAtUtc, lastComments, hasPhoto, version }`.

`CardRequestDetail` = `CardRequest` + `{ workEmail, locationName, mobileNumber, address, bloodGroup,
emergencyContactName, emergencyContactNumber, availableActions: string[], history: CardRequestHistoryItem[] }`
(contact fields are the request snapshot). `CardRequestHistoryItem`: `{ historyId, fromStatus: string|null, toStatus,
action, comments: string|null, actorUserId, actorName, createdAtUtc }`, ordered by `createdAtUtc` ascending.

### Access requests, approvals, permissions
| Method | Route | Function | Permission | Body / query -> data |
|---|---|---|---|---|
| GET | `v1/access-requests` | SearchAccessRequests | AccessRequests.View | `status, currentStage, accessType, locationId, employeeId, mine, search` -> `P<AccessRequest>` |
| POST | `v1/access-requests` | CreateAccessRequest | AccessRequests.Create | `CreateAccessRequestRequest` -> `AccessRequestDetail` |
| GET | `v1/access-requests/{id}` | GetAccessRequest | AccessRequests.View | -> `AccessRequestDetail` |
| PUT | `v1/access-requests/{id}` | UpdateAccessRequest | AccessRequests.Create | `CreateAccessRequestRequest` without `employeeId`/`submit`, plus `version` (Draft/Returned only) |
| POST | `v1/access-requests/{id}/submit` | SubmitAccessRequest | AccessRequests.Create | `{ version }` -> `AccessRequestDetail` |
| POST | `v1/access-requests/{id}/cancel` | CancelAccessRequest | AccessRequests.Create | `{ reason, version }` -> `AccessRequestDetail` |
| GET | `v1/approvals/pending` | GetPendingApprovals | Approvals.Decide | `stage?` (`Manager`, `SecurityHead`, `Security`, `AccessControl`; omitted = all), `search, page, pageSize` -> `P<PendingApproval>` (tasks assigned to caller) |
| POST | `v1/approvals/{accessRequestId}/decision` | DecideApproval | Approvals.Decide | `{ decision: 'Approve'or'Return'or'Reject', comments, version, provisionNow?: boolean }` -> `AccessRequestDetail` |
| GET | `v1/approvals/team` | Approvals_Team | Approvals.Team | `requestKind?` (`Card`/`Access`), `status?, search, page, pageSize` -> `P<TeamRequestItem>` |
| GET | `v1/permissions` | SearchPermissions | Permissions.View | `status, locationId, employeeId, expiringWithinDays` -> `P<AccessPermission>` |
| POST | `v1/permissions/provision` | ProvisionPermission | Permissions.Provision | `{ accessRequestId }` -> `AccessPermission` |
| POST | `v1/permissions/{id}/revoke` | RevokePermission | Permissions.Revoke | `{ reason }` -> `AccessPermission` |

The Access Provisioning page lists `GET v1/access-requests?status=Approved` (AccessControlTeam holds
`AccessRequests.ViewAll`).

`CreateAccessRequestRequest`: `{ employeeId?: number, accessType: 'Building'|'WingFloor', buildingLocationId: number,
locationId: number, durationCode: DurationCode, validFromUtc?: string, validToUtc?: string (Custom only),
justification: string (10..1000) }` (rules §5.3). This endpoint creates and submits the request immediately;
`submit` is not a request-body field. The wire name `justification` maps to the response/SQL name
`businessJustification`. The timestamp wire names are `validFromUtc` and `validToUtc` (the change spec's
`validFrom`/`validTo` are shorthand).

`AccessRequest`: `accessRequestId, requestNumber (EAW-yyyy-nnnnnn), employeeId, employeeName, employeeNumber,
accessType, buildingLocationId, buildingLocationName, locationId, locationName, locationCode, isRestricted, durationCode,
requesterUserId, requesterName, businessJustification, validFromUtc, validToUtc, status, currentStage,
currentApproverNames, submittedAtUtc, createdAtUtc, updatedAtUtc, version`.
`AccessRequestDetail` = `AccessRequest` + `approvals: [{ approvalId, stage, stageOrder, assignedToNames, decidedByName,
decision ('Pending'|'Approved'|'Returned'|'Rejected'|'Skipped'), comments, decidedAtUtc }]`, `permissionId,
permissionStatus, canEdit, canSubmit, canCancel, canDecide, canProvision`.
`PendingApproval`: `accessRequestId, requestNumber, employeeName, employeeNumber, accessType, buildingLocationName,
locationName, isRestricted, durationCode, stage, businessJustification, validFromUtc, validToUtc, submittedAtUtc,
ageHours, version`.
`TeamRequestItem` (caller's direct reports, all statuses, newest first): `{ requestKind: 'Card'|'Access', requestId,
requestNumber, requestType (card requestType or accessType), employeeId, employeeName, employeeNumber, status,
currentStage, submittedAtUtc, route }` (`route` = `/cards/requests/{id}` or `/access-requests/{id}`).
`AccessPermission`: `permissionId, employeeId, employeeName, employeeNumber, locationId, locationName, accessRequestId,
requestNumber, validFromUtc, validToUtc, status, provisionedByName, provisionedAtUtc, revokedAtUtc, revokeReason,
controllerSyncStatus`.

### RFID, violations, incidents, blacklist
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| POST | `v1/rfid/events` | Rfid.Ingest | `{ readerId, externalEventId, cardUid, eventType: 'Entry'or'Exit', eventAtUtc }` -> `{ accessLogId, processingStatus, decision ('Granted'or'Denied'), denialReason, violationId, isDuplicate }` |
| GET | `v1/rfid/events` | Rfid.View | `from, to, locationId, readerId, eventType, decision, employeeId` -> `P<AccessLog>` |
| GET | `v1/violations` | Violations.View | `status, violationType, severity, locationId, from, to` -> `P<Violation>` |
| POST | `v1/violations/{id}/review` | Violations.Review | `{ status, reviewNotes, createIncident }` -> `Violation` |
| GET | `v1/incidents` | Incidents.View | `status, severity, assignedToUserId` -> `P<Incident>` |
| POST | `v1/incidents` | Incidents.Manage | `{ title, description, incidentType, severity, violationId?, locationId?, assignedToUserId? }` -> `Incident` |
| GET | `v1/incidents/{id}` | Incidents.View | -> `Incident` + `notes: [{ noteId, note, createdByName, createdAtUtc }]` |
| PATCH | `v1/incidents/{id}` | Incidents.Manage | `{ status?, assignedToUserId?, resolution?, note?, version }` -> `Incident` |
| GET | `v1/blacklist` | Blacklist.View | `isActive, subjectType` -> `P<BlacklistEntry>` |
| POST | `v1/blacklist` | Blacklist.Manage | `{ subjectType ('Employee'or'Visitor'or'Card'), subjectId, reason, reviewDate }` -> `BlacklistEntry` |
| POST | `v1/blacklist/{id}/lift` | Blacklist.Manage | `{ reason }` -> `BlacklistEntry` |

`AccessLog`: `accessLogId, externalEventId, readerId, readerName, maskedCardUid, cardId, employeeId, employeeName,
locationId, locationName, eventType, decision, denialReason, eventAtUtc, receivedAtUtc, processingStatus`.
`Violation`: `violationId, accessLogId, employeeId, employeeName, locationId, locationName, violationType, severity, status,
detectedAtUtc, reviewNotes, reviewedByName, reviewedAtUtc, incidentId`.
`Incident`: `incidentId, incidentNumber (INC-yyyy-nnnnn), violationId, incidentType, title, description, severity, status,
locationId, locationName, assignedToUserId, assignedToName, resolution, openedByName, openedAtUtc, closedAtUtc, version`.
`BlacklistEntry`: `blacklistId, subjectType, subjectId, subjectName, reason, reviewDate, isActive, createdByName,
createdAtUtc, liftedByName, liftedAtUtc, liftReason`.

### Visitors
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| GET | `v1/visitors` | Visitors.View | `search` -> `P<Visitor>` |
| POST | `v1/visitors` | Visitors.Manage | `{ displayName, organization, contactReference, visitPurpose, sponsorUserId? }` -> `Visitor` |
| GET | `v1/visitor-passes` | Visitors.View | `status, locationId, from, to, onSite` -> `P<VisitorPass>` |
| POST | `v1/visitor-passes` | Visitors.Manage | `{ visitorId, locationId, validFromUtc, validToUtc, sponsorUserId? }` -> `VisitorPass` |
| POST | `v1/visitor-passes/{id}/approve` | Visitors.Approve | `{ comments? }` -> `VisitorPass` |
| POST | `v1/visitor-passes/{id}/check-in` | Visitors.Manage | `{}` -> `VisitorPass` |
| POST | `v1/visitor-passes/{id}/check-out` | Visitors.Manage | `{}` -> `VisitorPass` |
| POST | `v1/visitor-passes/{id}/revoke` | Visitors.Manage | `{ reason }` -> `VisitorPass` |

`Visitor`: `visitorId, displayName, organization, contactReference, visitPurpose, sponsorUserId, sponsorName, isBlacklisted,
createdAtUtc, passCount`. `VisitorPass`: `visitorPassId, passNumber (VP-yyyy-nnnnn), visitorId, visitorName, organization,
locationId, locationName, sponsorUserId, sponsorName, validFromUtc, validToUtc, status, approvedByName, approvedAtUtc,
checkedInAtUtc, checkedOutAtUtc, revokeReason`.

### Home dashboard (v2)
| Method | Route | Function | Permission | Data |
|---|---|---|---|---|
| GET | `v1/dashboard/home` | Dashboard_Home | Dashboard.View | -> `HomeDashboardDto` |

`HomeDashboardDto` — every key is always present; a section is `null` when the caller lacks its permission:

```
{
  myRequests: { open: number, closed: number, recent: HomeWorkItem[] },   // always present; caller's own card + access requests, recent = newest 5
  pendingManager:      QueueSummary | null,  // Cards.ManagerApprove: card PendingManager actionable by caller + access requests at stage Manager assigned to caller
  pendingHr:           QueueSummary | null,  // Cards.HrVerify: card PendingHR
  pendingSecurity:     QueueSummary | null,  // Cards.SecurityReview: card PendingSecurity
  pendingIdCard:       QueueSummary | null,  // Cards.Process: card PendingIdCardTeam + Printing + ReadyToIssue
  pendingAccessReview: QueueSummary | null,  // Approvals.Decide: access approvals assigned to caller at SecurityHead/Security/AccessControl
  pendingProvisioning: QueueSummary | null,  // Permissions.Provision: access requests with status Approved in scope
  teamRequests:        QueueSummary | null,  // Approvals.Team: open card + access requests of direct reports
  reports: { cardsIssuedThisMonth: number, accessGrantedThisMonth: number, openRequests: number } | null  // Reports.View, scoped
}
QueueSummary = { count: number, route: string, top: HomeWorkItem[] }       // top = oldest 5 (newest 5 for teamRequests)
HomeWorkItem = { requestKind: 'Card'|'Access', requestId, requestNumber, requestType, employeeName, employeeNumber,
                 status, currentStage, submittedAtUtc, route }
```

Section routes: pendingManager `/approvals/manager`, pendingHr `/approvals/hr`, pendingSecurity `/approvals/security`,
pendingIdCard `/approvals/id-card`, pendingAccessReview `/approvals/access`, pendingProvisioning `/permissions/provision`,
teamRequests `/approvals/team`. Item routes `/cards/requests/{id}` or `/access-requests/{id}`. `open` counts card
requests not in `Closed/Rejected/Cancelled` plus access requests in `Draft, Submitted, PendingApproval, Returned,
Approved`; `closed` counts the rest. `cardsIssuedThisMonth` = card requests moved to `Closed` this UTC month;
`accessGrantedThisMonth` = permissions provisioned this UTC month; `openRequests` = open card + access requests in scope.

### Dashboard analytics, reports, audit, notifications (existing)
| Method | Route | Permission | Data |
|---|---|---|---|
| GET | `v1/dashboard/summary` | Dashboard.View | `{ activeEmployees, activeCards, blockedCards, pendingAccessRequests, myPendingApprovals, activePermissions, permissionsExpiring7d, eventsToday, deniedToday, openViolations, openIncidents, visitorsOnSite, avgApprovalTurnaroundHours }` (scoped) |
| GET | `v1/dashboard/events-trend?days=14` | Dashboard.View | `[{ date, entries, exits, denied }]` |
| GET | `v1/dashboard/requests-by-status` | Dashboard.View | `[{ label, count }]` |
| GET | `v1/dashboard/violations-by-type` | Dashboard.View | `[{ label, count }]` |
| GET | `v1/dashboard/cards-by-status` | Dashboard.View | `[{ label, count }]` |
| GET | `v1/dashboard/occupancy` | Dashboard.View | `[{ locationId, locationName, onSite }]` (entries minus exits today; estimate) |
| GET | `v1/dashboard/my-work` | Dashboard.View | `[{ itemType, referenceId, referenceNumber, title, status, createdAtUtc, route }]` |
| GET | `v1/dashboard/activity?top=15` | Dashboard.View | `[{ auditLogId, action, entityType, entityId, actorName, summary, occurredAtUtc }]` |
| GET | `v1/reports/{reportName}` | Reports.View | `reportName` in `employee-register, card-lifecycle, access-permissions, access-activity, request-aging, violations-incidents, audit-compliance`; query `from, to, locationId, departmentId, status, page, pageSize` -> `P<object>` with camelCase columns |
| GET | `v1/reports/{reportName}/export` | Reports.Export | same filters -> `text/csv` attachment |
| GET | `v1/audit-logs` | Audit.View | `from, to, actorUserId, action, entityType, entityId, search` -> `P<AuditLog>` |
| GET | `v1/audit-logs/timeline?entityType=&entityId=` | authenticated + entity read access | -> `AuditLog[]` |
| GET | `v1/notifications` | authenticated | `unreadOnly` -> `P<Notification>` |
| GET | `v1/notifications/unread-count` | authenticated | -> `{ count }` |
| POST | `v1/notifications/{id}/read` | authenticated | -> `true` |
| POST | `v1/notifications/read-all` | authenticated | -> `{ count }` |

`AuditLog`: `auditLogId, actorUserId, actorName, action, entityType, entityId, summary, beforeJson, afterJson, reason,
occurredAtUtc, correlationId, ipAddress`. `Notification`: `notificationId, type, title, message, relatedEntityType,
relatedEntityId, route, createdAtUtc, readAtUtc`.

### Administration
| Method | Route | Permission | Body -> data |
|---|---|---|---|
| GET/POST | `v1/admin/users` | Users.Manage | `search, isActive` -> `P<AdminUser>` / `{ displayName, email, entraObjectId?, isActive, allFacilities, roleIds, facilityIds, employeeId? }` |
| PUT | `v1/admin/users/{id}` | Users.Manage | same as POST -> `AdminUser` |
| GET | `v1/admin/roles` | Roles.Manage | -> `[{ roleId, roleName, description, isSystem, userCount, permissionCount }]` |
| GET/PUT | `v1/admin/roles/{id}/permissions` | Roles.Manage | -> `[{ permissionId, code, module, description, granted }]` / `{ permissionIds }` |
| GET | `v1/admin/permissions` | Roles.Manage | -> `[{ permissionId, code, module, description }]` |
| GET/POST | `v1/departments` | Employees.View / Reference.Manage | -> `Department[]` / `{ departmentCode, departmentName, headUserId?, isActive }` |
| PUT | `v1/departments/{id}` | Reference.Manage | same -> `Department` |
| GET/POST | `v1/locations` | authenticated / Reference.Manage | -> `Location[]` / `{ parentLocationId?, locationCode, locationName, locationType, isRestricted, isActive, timeZone }` |
| PUT | `v1/locations/{id}` | Reference.Manage | same -> `Location` |
| GET/POST | `v1/readers` | Rfid.View / Reference.Manage | -> `Reader[]` / `{ readerId, readerName, locationId, direction ('In'or'Out'or'Both'), isActive }` |
| PUT | `v1/readers/{readerId}` | Reference.Manage | same -> `Reader` |
| GET/PUT | `v1/admin/settings` | Settings.Manage | -> `[{ settingKey, settingValue, description, dataType }]` / `{ settingKey, settingValue }` |

`AdminUser`: `userId, displayName, email, entraObjectId, isActive, allFacilities, roleIds, roleNames, facilityIds,
facilityNames, employeeId, employeeNumber, lastLoginAtUtc`. `Department`: `departmentId, departmentCode, departmentName,
headUserId, headUserName, isActive, employeeCount`. `Location`: `locationId, parentLocationId, parentLocationName,
locationCode, locationName, locationType, isRestricted, isActive, timeZone, path, readerCount`. `Reader`: `readerId,
readerName, locationId, locationName, direction, isActive, lastSeenAtUtc`.

## 7. UI and theme

* **Top navigation only** (no side nav). A sticky app bar with the logo, menu sections from `v1/me/menu` (single entry =
  link, several = `mat-menu` dropdown), a notification bell with unread badge, and a user menu (avatar from
  `v1/me/photo` when `hasPhoto`, My Profile, roles, sign out). Below `lg` the sections collapse into a hamburger panel
  that drops down from the top, not a side drawer.
* Scientific palette ("Lab Spectrum"): primary deep ocean `#0B3C5D`, secondary teal `#0FA3B1`, accent cyan `#3DDCF2`,
  violet highlight `#5B5BD6`, success `#1B998B`, warning `#F2A541`, danger `#D7263D`, surface `#F4F8FB`, ink `#10212E`.
  App bar gradient `linear-gradient(90deg,#0B3C5D,#0E6E83 60%,#0FA3B1)`. Font: Inter / Roboto. Tabular data uses
  `font-variant-numeric: tabular-nums`. Status chips use the colour plus icon and text (not colour alone); tones per §5.1
  (access: Pending*/Submitted/Returned warning, Approved info, Provisioned "Completed" success, Rejected danger,
  Cancelled/Expired/Draft neutral).
* Consistent page header, cards, spacing; forms use a 2-column responsive grid (1 column below `md`); mobile
  responsive with no horizontal overflow; 0 console errors.
* Every screen handles loading, empty, error (with correlationId), validation, and success states.

### Pages and routes (v2)

| Route | Page | Guard (any) | Data |
|---|---|---|---|
| `/dashboard` | Home: role-based section cards (My Requests, Pending Manager Approvals, HR Verification, ID Card Processing, Security Approvals, Access Review, Provisioning, Team Requests, Reports) rendered only when the `HomeDashboardDto` section is non-null, plus quick actions "Raise ID Card Request" / "Raise Access Request". Existing analytics charts stay below for `Reports.View`. | Dashboard.View | `v1/dashboard/home` (+ existing analytics endpoints) |
| `/profile` | My Profile: HR fields read-only, editable contact details, photo upload/preview (client resize to <= 600x600 JPEG), active card (masked UID) | Dashboard.View | `v1/me/profile`, `PUT v1/me/profile`, `v1/me/photo`, `PUT v1/me/photo` |
| `/cards/requests/new` | Raise ID Card Request stepper: 1 Type & reason (New/Lost/Damaged; Damaged = reason select, Lost = free text) -> 2 Details (pre-filled from profile, editable) -> 3 Photo (file input, no camera; square crop + resize; preview; required for New without existing photo) -> 4 Review & submit | Cards.Request | `v1/me/profile`, `v1/me/photo`, `v1/lookups`, `POST v1/card-requests` |
| `/access-requests/new` | Raise Access Request: Building / Wing-Floor toggle, building select (locations of type Building), dependent wing/floor select (descendants of type Floor/Wing/Zone), duration preset (+ dates for Custom), justification, review & submit (`submit: true`) | AccessRequests.Create | `v1/lookups`, `POST v1/access-requests` |
| `/my-requests` | My Requests with tabs `?tab=cards` (default) / `?tab=access`, status chips, link to detail | Cards.View | `v1/card-requests?mine=true`, `v1/access-requests?mine=true` |
| `/cards/requests/:id` | Card request detail: horizontal stepper (§5.1), details + photo, history timeline, action panel driven by `availableActions` (comments dialog; comments required for Reject) | Cards.View, Cards.ViewAll, Cards.ManagerApprove, Cards.HrVerify, Cards.SecurityReview, Cards.Process, Approvals.Team | `v1/card-requests/{id}`, `v1/employees/{employeeId}/photo` (reviewers) or `v1/me/photo` (own) |
| `/access-requests/:id` | Access request detail: stepper of `approvals[]` stages, timeline, actions from `canDecide/canProvision/canCancel/canSubmit` | AccessRequests.View, Approvals.Decide, Approvals.Team | `v1/access-requests/{id}` |
| `/approvals/manager` | Pending Approvals: card requests (stage Manager) and access approvals (stage Manager) in two tabs; quick Approve/Reject | Cards.ManagerApprove | `v1/card-requests/queue?stage=Manager`, `v1/approvals/pending?stage=Manager` |
| `/approvals/team` | Team Requests | Approvals.Team | `v1/approvals/team` |
| `/approvals/hr` | HR Verification Queue | Cards.HrVerify | `v1/card-requests/queue?stage=HR` |
| `/approvals/id-card` | ID Card Processing Queue (Approve / Mark printed / Issue) | Cards.Process | `v1/card-requests/queue?stage=IdCardTeam` |
| `/approvals/security` | Security Approvals (lost-card review) | Cards.SecurityReview | `v1/card-requests/queue?stage=Security` |
| `/approvals/access` | Access Requests Review (SecurityHead/Security/AccessControl stages; `provisionNow` checkbox at AccessControl for `Permissions.Provision` holders) | Approvals.Decide | `v1/approvals/pending` |
| `/permissions/provision` | Access Provisioning | Permissions.Provision | `v1/access-requests?status=Approved`, `POST v1/permissions/provision` |
| `/notifications` | Notifications | Dashboard.View | `v1/notifications` |
| `/employees`, `/employees/:id` | Read-only employee directory (search, view, photo for permitted roles) | Employees.View, Employees.ViewAll | `v1/employees` |
| `/cards`, `/permissions` | Directory lists (existing) | Cards.ViewAll / Permissions.View | existing |
| `/rfid-monitor`, `/violations`, `/incidents`, `/blacklist`, `/visitors`, `/reports`, `/audit`, `/admin/...` | unchanged | unchanged | unchanged |

**Removed:** employee create/edit UI (`/employees/new`, `/employees/:id/edit`, Create/Edit buttons). Redirects:
`/approvals` -> `/approvals/access`, `/access-requests` -> `/my-requests?tab=access`.
Quick approve/reject from a queue row uses the row's `version`; any other action opens the detail page.
