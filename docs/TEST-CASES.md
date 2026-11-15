# EIWAMS test cases

Execution guide for the core test cases (SDD 17.2), UI cases, the role matrix for the 8 seeded roles, end-to-end
business flows and UAT scenarios. Routes, permissions and states are defined in [API-CONTRACT.md](API-CONTRACT.md).
Run API cases locally in DevHeader mode with `X-User-Id` (users 1-8 below) unless the case concerns tokens.

Seeded users: 1 System Administrator (SystemAdmin), 2 Hari HR Admin (HRAdmin), 3 Meera Manager (Manager),
4 Sanjay Security (SecurityTeam), 5 Farah Facility Admin (FacilityAdmin), 6 Ravi Reception (Reception),
7 Esha Employee (Employee, reports to Meera), 8 Arjun Auditor (Auditor).

Automation: `dotnet test EIWAMS.API.slnx` (unit + `EIWAMS_Test` integration), `npx ng test --watch=false` in
`EIWAMS.Web`, Postman collection in `postman\`.

## Core test cases (SDD 17.2)

| ID | Scenario | Steps | Expected | Level |
|---|---|---|---|---|
| TC-01 | Missing/invalid token | EntraId mode: `GET /api/v1/me` without `Authorization`, then with an expired/forged token | 401, envelope `success:false`, no data | API |
| TC-02 | Inactive Entra-mapped user | Set `Users.IsActive=0` for a linked user; call `GET /api/v1/me` with a valid token (DevHeader: `X-User-Id` of that user) | 403, denied | API / integration |
| TC-03 | Duplicate employee number | User 2: `POST /api/v1/employees` twice with the same `employeeNumber` | Second call 409; one row | Integration |
| TC-04 | Employee reads another profile | User 7: `GET /api/v1/employees/{id}` of an employee who is not self/team | 404 (concealed), no data | API / integration |
| TC-05 | Duplicate active RFID UID | User 2: `POST /api/v1/cards` with a `cardUid` already on an active card | 409; no second mapping | Integration |
| TC-06 | Lost card reported | User 7: `POST /api/v1/cards/{id}/report-lost` | Card `Blocked` at once, Lost card request created, `ControllerCommands` row `Pending -> Synced`, audit row | Integration / E2E |
| TC-07 | Blocked card swipe | User 4: `POST /api/v1/rfid/events` with the blocked card | `decision: Denied`, violation `BlockedCard` | Integration |
| TC-08 | Expired permission swipe | Event on a reader whose location permission has `validToUtc` in the past | Denied; `ExpiredPermission` violation; audit/log row | Integration |
| TC-09 | Wrong approval stage | Stage is Manager; user 4 (Security) posts `v1/approvals/{id}/decision` | 403; request unchanged | API / integration |
| TC-10 | Reject without reason | Approver posts `decision: Reject` with empty `comments` | 400; no decision recorded | Unit / API |
| TC-11 | Duplicate approval retry | Repeat the same approve call with the old `version` | 409; one transition | Integration |
| TC-12 | Provision pending request | User 5: `POST /api/v1/permissions/provision` for a `PendingApproval` request | 409/422; no permission created | Integration |
| TC-13 | Invalid validity range | `POST /api/v1/access-requests` with `validToUtc <= validFromUtc` | 400; not saved | Unit / API |
| TC-14 | Duplicate RFID event | Post the same `(readerId, externalEventId)` twice | One `AccessLogs` row; second response `isDuplicate: true` with the original result | Integration |
| TC-15 | Unknown card event | Event with an unregistered `cardUid` | Denied; `EventAnomaly` violation in Review; no employee guessed | Integration |
| TC-16 | Tailgating signal | Out of scope for sensors in this build: verify `RepeatedDenied` (3+ denials in 10 minutes) raises a violation for human review | Violation `Open`, no automatic sanction | Integration |
| TC-17 | Expired visitor pass | Check in a pass whose `validToUtc` has passed | Rejected (409/422); pass shown `Expired`; audit row | API |
| TC-18 | Employee deactivation | User 2: `POST /api/v1/employees/{id}/deactivate` | Cards deactivated, permissions revoked, new access requests for the employee rejected (422) | Integration / E2E |
| TC-19 | Cross-facility access | User 5 scoped to building A reads a permission/request in building B | 404; no scope leakage | Integration |
| TC-20 | Audit row update | Run `UPDATE dbo.AuditLogs ...` as the API login; call any non-GET audit route | Permission denied / 404 route; audit append-only | Database / API |
| TC-21 | SQL injection in search | `GET /api/v1/employees?search=' OR 1=1 --` | Treated as literal text; 200 with no extra rows | API |
| TC-22 | Reader offline during block | Simulate a failed controller command for a block | `controllerSyncStatus` stays `Pending`/`Failed` and is visible; card still `Blocked` in EIWAMS; no false "Synced" | Integration |
| TC-23 | Large page size | `GET /api/v1/employees?pageSize=1000` | Capped at 100 (`pageSize: 100` in the response) | API |
| TC-24 | Mobile viewport | 390x844: open nav (hamburger drops down from the top), report lost card, approve a request | All actions reachable and usable | UI |
| TC-25 | Full smoke journey | Run [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md#6-smoke-journey) S1-S12 | Journey succeeds; evidence saved | E2E |

## Additional API cases

| ID | Scenario | Expected |
|---|---|---|
| API-01 | `GET /api/auth/config` anonymous | 200 `{ mode, tenantId, spaClientId, apiScope, authority }` |
| API-02 | `GET /api/v1/dev/users` in EntraId mode | 404 |
| API-03 | Any response | Envelope present; `X-Correlation-Id` echoed (client value kept, generated when absent) |
| API-04 | Stale `version` on `PUT /api/v1/employees/{id}` | 409 |
| API-05 | Requester approves own request | 403 |
| API-06 | Return/Reject without comments | 400 |
| API-07 | Card lists | Only `maskedCardUid` (`****1234`), never the full UID |
| API-08 | `GET /api/v1/reports/{name}/export` without `Reports.Export` | 403; with it, `text/csv` attachment |
| API-09 | Unknown report name | 404 |
| API-10 | Mutations | `AuditLogs` row with actor, action, entity, UTC time, correlation ID |

## UI cases

| ID | Screen | Check |
|---|---|---|
| UI-01 | Sign-in (DevHeader) | User picker lists users 1-8; choosing one loads the Dashboard |
| UI-02 | App bar | Sticky top navigation only (no side nav); sections from `v1/me/menu`; multi-entry sections open a dropdown; Lab Spectrum gradient |
| UI-03 | Navigation by role | Each role sees exactly the sections in the role matrix below; direct URL to a forbidden route shows the forbidden page |
| UI-04 | Responsive | Below `lg` the sections collapse into a hamburger panel that drops down from the top |
| UI-05 | Notifications | Bell shows the unread count; mark one / mark all read updates the badge |
| UI-06 | Lists | Loading skeleton, empty state, error state with correlation ID, paging/sort/search |
| UI-07 | Forms | Inline validation messages; submit disabled while saving; server 400 errors mapped to fields; success toast |
| UI-08 | Status chips | Colour plus icon plus text (not colour alone); tabular numbers in grids |
| UI-09 | Dashboard | KPI cards and Chart.js charts (events trend, requests by status, violations by type, cards by status) render; my-work list links to items |
| UI-10 | Access request detail | Approval timeline, `canEdit/canSubmit/canCancel/canDecide/canProvision` drive the buttons |
| UI-11 | 409 conflict | Concurrency message with reload option |
| UI-12 | Accessibility | Keyboard reachable menus and dialogs, visible focus, labelled inputs, AA contrast |

## Role matrix (seeded roles)

Y = allowed, S = own/self or team scope, R = read-only, - = no access (403 / menu hidden).

| Capability | Employee (7) | Manager (3) | HRAdmin (2) | SecurityTeam (4) | FacilityAdmin (5) | Reception (6) | SystemAdmin (1) | Auditor (8) |
|---|---|---|---|---|---|---|---|---|
| Dashboard | Y | Y | Y | Y | Y | Y | Y | R |
| View employees | S | S (team) | Y | S | S | S | Y | R |
| Create/update/transfer/deactivate employee | - | - | Y | - | - | - | Y | - |
| View cards | S | S | Y | Y | S | - | Y | R |
| Request card / report lost | Y | Y | Y | Y | Y | - | Y | - |
| Issue/activate/replace card | - | - | Y | Y | - | - | Y | - |
| Verify card request / block card | - | - | - | Y | - | - | Y | - |
| Create access request | Y | Y | Y | Y | Y | - | Y | - |
| Approve (assigned stage) | - | Y | - | Y | Y | - | Y | - |
| View / provision / revoke permissions | - | R | - | R / revoke | Y | - | Y | R |
| RFID monitor / ingest | - | - | - | Y / Y | R | R | Y | R |
| Violations, incidents, blacklist | - | - | - | Y | - | - | Y | R |
| Visitors (manage / approve) | - | - | - | R | R / approve | Y | Y | R |
| Reports view / export | - | R | Y | Y | R | - | Y | Y |
| Audit trail | - | - | - | Y | - | - | Y | Y |
| Admin (users, roles, settings) | - | - | - | - | Reference data | - | Y | - |

Each cell is verified by calling one representative endpoint per capability as that user and checking the menu.

## End-to-end business flows

| ID | Flow | Actors | Pass criteria |
|---|---|---|---|
| E2E-01 | Onboarding: create employee -> card request -> verify/approve -> issue -> activate | 2, 4 | Card Active; history and audit rows |
| E2E-02 | Lost card: report lost -> block -> replacement -> old card swipe denied | 7, 4, 2 | Old card Blocked/Deactivated; new card Granted; violation for the old card |
| E2E-03 | Restricted access: request -> Manager -> Security -> FacilityAdmin -> provision -> swipe granted | 7, 3, 4, 5 | Permission Active; `Granted` event; notifications at each stage |
| E2E-04 | Return and resubmit: Manager returns with comments -> employee edits -> resubmit -> approved | 7, 3 | Request goes Returned -> Submitted -> ...; comments visible |
| E2E-05 | Rejection: Security rejects with reason | 7, 3, 4 | Request Rejected; no permission |
| E2E-06 | Transfer: move employee to a new department/location | 2 | Permissions outside the new subtree suspended for review; history row |
| E2E-07 | Exit: deactivate employee | 2 | Cards deactivated; permissions revoked; swipe denied |
| E2E-08 | Visitor: register -> pass -> approve -> check-in -> check-out | 6, 5 | Pass CheckedOut; occupancy updated |
| E2E-09 | Security review: violation -> UnderReview -> Confirmed -> incident -> notes -> Closed | 4 | Incident closed with resolution; audit trail complete |
| E2E-10 | Blacklist: blacklist employee -> swipe denied -> lift | 4 | Denied while active; granted after lift |
| E2E-11 | Audit and reports: auditor filters audit trail and exports reports | 8 | Read-only; CSV export works; no mutation buttons |

## UAT scenarios (SDD 17.3)

| ID | Persona | Scenario | Accepted when |
|---|---|---|---|
| UAT-01 | HR Admin | Register employee and assign department, manager and location | Employee visible to the manager |
| UAT-02 | Employee, HR/Security | Employee requests card; authorized user maps RFID UID and activates | Card Active, UID masked |
| UAT-03 | Employee, Security | Employee reports loss; Security verifies block and issues replacement | Old card blocked, new card active |
| UAT-04 | Employee, Manager, Security, Facility Admin | Restricted-zone request approved by all three stages | Request Approved |
| UAT-05 | Facility Admin | Provision permission; scope and validity visible | Permission Active with dates |
| UAT-06 | Security | Test reader submits entry/exit events; duplicates and blocked cards handled | One event per duplicate; blocked card denied |
| UAT-07 | Reception | Register visitor, issue temporary pass, record check-out | Pass CheckedOut |
| UAT-08 | Security | Review violation and close with reason | Violation Closed with notes |
| UAT-09 | Auditor | Review identity, card, permission and incident audit trail | Complete, read-only trail |

## Defect severity (SDD 17.4)

| Severity | Definition | Release decision |
|---|---|---|
| Critical | Unauthorized access, data leak, audit tampering, serious integrity failure | Block release |
| High | Core approval/card lifecycle broken or incorrect permission | Block unless formally waived |
| Medium | Workaround exists; secondary workflow/usability defect | Fix or document risk |
| Low | Cosmetic wording/layout | Prioritize by accessibility/impact |
