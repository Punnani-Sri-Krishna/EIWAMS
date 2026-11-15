# EIWAMS shared implementation contract

Single source of truth shared by the API, Web, and DevOps work streams. Change it only through the coordinator, and keep
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
Out of scope (do not build): email/SMTP, mail templates, reminder/escalation engines, blob/storage queues, file uploads,
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

Roles: `Employee`, `Manager`, `HRAdmin`, `SecurityTeam`, `FacilityAdmin`, `Reception`, `SystemAdmin`, `Auditor`.

Permission codes (`Module.Action`):

| Module | Codes |
|---|---|
| Dashboard | `Dashboard.View` |
| Employees | `Employees.View` (self/team), `Employees.ViewAll`, `Employees.Manage`, `Employees.Transfer`, `Employees.Deactivate` |
| Cards | `Cards.View`, `Cards.ViewAll`, `Cards.Request`, `Cards.Verify`, `Cards.Issue`, `Cards.Block` |
| Access | `AccessRequests.View`, `AccessRequests.ViewAll`, `AccessRequests.Create`, `Approvals.Decide` |
| Permissions | `Permissions.View`, `Permissions.Provision`, `Permissions.Revoke` |
| RFID | `Rfid.View`, `Rfid.Ingest` |
| Security | `Violations.View`, `Violations.Review`, `Incidents.View`, `Incidents.Manage`, `Blacklist.View`, `Blacklist.Manage` |
| Visitors | `Visitors.View`, `Visitors.Manage`, `Visitors.Approve` |
| Reports | `Reports.View`, `Reports.Export`, `Audit.View` |
| Admin | `Users.Manage`, `Roles.Manage`, `Reference.Manage`, `Settings.Manage` |

Role grants (summary): Employee = Dashboard.View, Employees.View, Cards.View/Request, AccessRequests.View/Create.
Manager = Employee + Approvals.Decide, Employees.View (team), Permissions.View, Reports.View.
HRAdmin = Employee + Employees.ViewAll/Manage/Transfer/Deactivate, Cards.ViewAll/Request/Issue, Reports.View/Export.
SecurityTeam = Employee + Cards.ViewAll/Verify/Block/Issue, Approvals.Decide, Permissions.View/Revoke, Rfid.View/Ingest,
Violations.*, Incidents.*, Blacklist.*, Visitors.View, Reports.View/Export, Audit.View.
FacilityAdmin = Employee + Approvals.Decide, Permissions.*, Rfid.View, Visitors.View/Approve, Reference.Manage, Reports.View.
Reception = Dashboard.View, Employees.View, Visitors.*, Rfid.View.
SystemAdmin = all codes. Auditor = Dashboard.View, every `*.View`/`*.ViewAll`, Reports.*, Audit.View (read-only).

Facility scope: `Users.AllFacilities` bit plus `UserFacilityScopes(UserId, LocationId)`. A scope on a parent location covers
all descendants (`fn_UserCanAccessLocation`). SystemAdmin and Auditor have AllFacilities.

Menus (`Menus`, `MenuPermissions`) drive the **top navigation**. `section` is the top-level item; when a section has
more than one entry the UI renders a dropdown.

| Section (order) | Label | Route | Icon | Permission (any) |
|---|---|---|---|---|
| Dashboard (1) | Dashboard | `/dashboard` | `space_dashboard` | Dashboard.View |
| People (2) | Employees | `/employees` | `badge` | Employees.View, Employees.ViewAll |
| People | ID Cards | `/cards` | `contactless` | Cards.View, Cards.ViewAll |
| Access (3) | Access Requests | `/access-requests` | `key` | AccessRequests.View |
| Access | Approvals | `/approvals` | `task_alt` | Approvals.Decide |
| Access | Permissions | `/permissions` | `verified_user` | Permissions.View |
| Security (4) | RFID Monitor | `/rfid-monitor` | `sensors` | Rfid.View |
| Security | Violations | `/violations` | `gpp_maybe` | Violations.View |
| Security | Incidents | `/incidents` | `policy` | Incidents.View |
| Security | Blacklist | `/blacklist` | `block` | Blacklist.View |
| Visitors (5) | Visitors | `/visitors` | `person_pin_circle` | Visitors.View |
| Insights (6) | Reports | `/reports` | `analytics` | Reports.View |
| Insights | Audit Trail | `/audit` | `history` | Audit.View |
| Admin (7) | Users | `/admin/users` | `manage_accounts` | Users.Manage |
| Admin | Roles & Permissions | `/admin/roles` | `admin_panel_settings` | Roles.Manage |
| Admin | Departments | `/admin/departments` | `apartment` | Reference.Manage |
| Admin | Locations & Zones | `/admin/locations` | `location_city` | Reference.Manage |
| Admin | RFID Readers | `/admin/readers` | `settings_input_antenna` | Reference.Manage |
| Admin | Settings | `/admin/settings` | `tune` | Settings.Manage |

Seed users (DevHeader picker): `1 System Administrator`, `2 Hari HR Admin`, `3 Meera Manager`, `4 Sanjay Security`,
`5 Farah Facility Admin`, `6 Ravi Reception`, `7 Esha Employee`, `8 Arjun Auditor`, plus 2-3 more employees. Esha reports to
Meera. Include demo departments, a campus to building to floor to zone hierarchy (ODC, data centre, R&D, production,
visitor area), readers, cards, access requests in every state, permissions, events, violations, incidents, and visitors.

## 5. Workflows

* Access request: `Draft -> Submitted -> PendingApproval -> (Manager -> Security -> FacilityAdmin) -> Approved -> Provisioned`,
  plus `Returned` (back to Draft/resubmit), `Rejected`, `Cancelled`, `Expired`. Stage approvers: Manager = employee's
  manager's user (fallback: any Manager-role user in scope); Security = SecurityTeam users in facility scope;
  FacilityAdmin = FacilityAdmin users in facility scope. Return/Reject require comments. The requester cannot approve
  their own request. Provisioning creates `AccessPermissions` (Active) and sets the request to Provisioned atomically.
* Card: `Requested -> Active -> Lost | Blocked | Damaged | Expired | Deactivated`. Reporting lost blocks immediately
  (BR-03). Replace deactivates the old card before activating the new one in one transaction. One active card per
  employee for Permanent type; a CardUid is unique (filtered unique index on active statuses plus a global unique index).
  Controller sync is simulated: `ControllerSyncStatus` is `Pending -> Synced` (recorded in `ControllerCommands`).
* Card request: `Submitted -> VerificationPending -> Approved -> Issued`, or `Rejected` / `Cancelled`. Types:
  `New, Lost, Damaged, Replacement, Temporary`.
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

## 6. Endpoints and DTOs

All payload names below are JSON (camelCase). `P<>` means a paged envelope.

### Identity and lookups
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| GET | `auth/config` | anonymous | -> `{ mode, tenantId, spaClientId, apiScope, authority }` |
| GET | `v1/dev/users` | anonymous (DevHeader only, else 404) | -> `[{ userId, displayName, email, roles }]` |
| GET | `v1/me` | authenticated | -> `{ userId, displayName, email, employeeId, employeeNumber, roles: string[], permissions: string[], allFacilities, facilityIds: number[] }` |
| GET | `v1/me/menu` | authenticated | -> `[{ menuId, section, sectionOrder, label, icon, route, sortOrder }]` |
| GET | `v1/lookups` | authenticated | -> `{ departments:[{id,code,name}], locations:[{id,code,name,locationType,parentLocationId,isRestricted}], employees:[{id,name,employeeNumber}], users:[{id,name}], readers:[{id,name,locationId}], employeeTypes, employmentStatuses, cardTypes, cardStatuses, cardRequestTypes, cardRequestStatuses, accessRequestStatuses, approvalStages, permissionStatuses, eventTypes, violationTypes, violationStatuses, severities, incidentTypes, incidentStatuses, visitorPassStatuses, locationTypes }` (enumerations are `string[]`) |

### Employees
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| GET | `v1/employees` | Employees.View | `search, employmentStatus, departmentId, locationId, employeeType` -> `P<EmployeeListItem>` |
| POST | `v1/employees` | Employees.Manage | `CreateEmployeeRequest` -> `EmployeeDetail` |
| GET | `v1/employees/{id}` | Employees.View | -> `EmployeeDetail` (self, team, or ViewAll; otherwise 404) |
| PUT | `v1/employees/{id}` | Employees.Manage | `UpdateEmployeeRequest` -> `EmployeeDetail` |
| POST | `v1/employees/{id}/transfer` | Employees.Transfer | `{ departmentId, managerEmployeeId?, locationId, effectiveDate, reason }` -> `EmployeeDetail` |
| POST | `v1/employees/{id}/deactivate` | Employees.Deactivate | `{ employmentStatus: 'Exited'or'Inactive', endDate, reason }` -> `EmployeeDetail` |
| GET | `v1/employees/{id}/cards` | Cards.View | -> `Card[]` |
| GET | `v1/employees/{id}/history` | Employees.View | -> `[{ historyId, changeType, summary, effectiveDate, changedByName, changedAtUtc }]` |

`EmployeeListItem`: `employeeId, employeeNumber, firstName, lastName, fullName, workEmail, employeeType, departmentId,
departmentName, managerEmployeeId, managerName, locationId, locationName, employmentStatus, joinDate, endDate, activeCardCount`.
`EmployeeDetail` = list item + `userId, activePermissionCount, openAccessRequestCount, createdAtUtc, updatedAtUtc, version`.
`CreateEmployeeRequest`: `employeeNumber, firstName, lastName, workEmail, employeeType, departmentId, managerEmployeeId?,
locationId, joinDate, endDate?, userId?`. `UpdateEmployeeRequest`: same without `employeeNumber`, plus `version`.

### Cards
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| GET | `v1/cards` | Cards.View | `search, status, cardType, employeeId` -> `P<Card>` (own cards unless ViewAll) |
| POST | `v1/cards` | Cards.Issue | `{ employeeId, cardUid, cardType, expiresAtUtc?, cardRequestId? }` -> `Card` (status Requested) |
| POST | `v1/cards/{id}/activate` | Cards.Issue | `{ version }` -> `Card` |
| POST | `v1/cards/{id}/block` | Cards.Block | `{ reason, version }` -> `Card` |
| POST | `v1/cards/{id}/report-lost` | Cards.Request (owner) or Cards.Block | `{ reason }` -> `Card` (blocks immediately and creates a Lost card request) |
| POST | `v1/cards/{id}/replace` | Cards.Issue | `{ newCardUid, reason, version }` -> `Card` (new) |
| POST | `v1/cards/{id}/deactivate` | Cards.Block | `{ reason, version }` -> `Card` |
| GET | `v1/card-requests` | Cards.View | `status, requestType, employeeId` -> `P<CardRequest>` |
| POST | `v1/card-requests` | Cards.Request | `{ employeeId, requestType, oldCardId?, reason, requestedValidToUtc? }` -> `CardRequest` |
| POST | `v1/card-requests/{id}/decision` | Cards.Verify | `{ decision: 'Verify'or'Approve'or'Reject', comments }` -> `CardRequest` |

`Card`: `cardId, maskedCardUid, employeeId, employeeNumber, employeeName, cardType, status, issuedAtUtc, activatedAtUtc,
expiresAtUtc, blockedAtUtc, blockReason, controllerSyncStatus, replacedByCardId, cardRequestId, version`.
`CardRequest`: `cardRequestId, requestNumber, requestType, employeeId, employeeName, employeeNumber, oldCardId,
newCardId, reason, status, requestedAtUtc, requestedByName, verifiedByName, approvedByName, decidedAtUtc,
decisionComments, requestedValidToUtc`.

### Access requests, approvals, permissions
| Method | Route | Permission | Body / query -> data |
|---|---|---|---|
| GET | `v1/access-requests` | AccessRequests.View | `status, currentStage, locationId, employeeId, mine` -> `P<AccessRequest>` |
| POST | `v1/access-requests` | AccessRequests.Create | `{ employeeId, locationId, businessJustification, validFromUtc, validToUtc, submit }` -> `AccessRequestDetail` |
| GET | `v1/access-requests/{id}` | AccessRequests.View | -> `AccessRequestDetail` |
| PUT | `v1/access-requests/{id}` | AccessRequests.Create | `{ locationId, businessJustification, validFromUtc, validToUtc, version }` (Draft/Returned only) |
| POST | `v1/access-requests/{id}/submit` | AccessRequests.Create | `{ version }` -> `AccessRequestDetail` |
| POST | `v1/access-requests/{id}/cancel` | AccessRequests.Create | `{ reason, version }` -> `AccessRequestDetail` |
| GET | `v1/approvals/pending` | Approvals.Decide | -> `P<PendingApproval>` (tasks assigned to caller) |
| POST | `v1/approvals/{accessRequestId}/decision` | Approvals.Decide | `{ decision: 'Approve'or'Return'or'Reject', comments, version }` -> `AccessRequestDetail` |
| GET | `v1/permissions` | Permissions.View | `status, locationId, employeeId, expiringWithinDays` -> `P<AccessPermission>` |
| POST | `v1/permissions/provision` | Permissions.Provision | `{ accessRequestId }` -> `AccessPermission` |
| POST | `v1/permissions/{id}/revoke` | Permissions.Revoke | `{ reason }` -> `AccessPermission` |

`AccessRequest`: `accessRequestId, requestNumber (EAW-yyyy-nnnnnn), employeeId, employeeName, employeeNumber, locationId,
locationName, locationCode, isRestricted, requesterUserId, requesterName, businessJustification, validFromUtc, validToUtc,
status, currentStage, currentApproverNames, submittedAtUtc, createdAtUtc, updatedAtUtc, version`.
`AccessRequestDetail` = `AccessRequest` + `approvals: [{ approvalId, stage, stageOrder, assignedToNames, decidedByName,
decision ('Pending'|'Approved'|'Returned'|'Rejected'|'Skipped'), comments, decidedAtUtc }]`, `permissionId, permissionStatus,
canEdit, canSubmit, canCancel, canDecide, canProvision`.
`PendingApproval`: `accessRequestId, requestNumber, employeeName, employeeNumber, locationName, isRestricted, stage,
businessJustification, validFromUtc, validToUtc, submittedAtUtc, ageHours, version`.
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

### Dashboard, reports, audit, notifications
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
  link, several = `mat-menu` dropdown), a notification bell with unread badge, and a user menu (profile, roles, sign out).
  Below `lg` the sections collapse into a hamburger panel that drops down from the top, not a side drawer.
* Scientific palette ("Lab Spectrum"): primary deep ocean `#0B3C5D`, secondary teal `#0FA3B1`, accent cyan `#3DDCF2`,
  violet highlight `#5B5BD6`, success `#1B998B`, warning `#F2A541`, danger `#D7263D`, surface `#F4F8FB`, ink `#10212E`.
  App bar gradient `linear-gradient(90deg,#0B3C5D,#0E6E83 60%,#0FA3B1)`. Font: Inter / Roboto. Tabular data uses
  `font-variant-numeric: tabular-nums`. Status chips use the colour plus icon and text (not colour alone).
* Every screen handles loading, empty, error (with correlationId), validation, and success states.
