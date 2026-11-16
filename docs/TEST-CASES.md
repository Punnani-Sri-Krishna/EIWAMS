# EIWAMS test cases

Execution guide for employee identity, ID card and workplace-access workflows. Routes, permissions and states are in
[API-CONTRACT.md](API-CONTRACT.md). Tests create isolated fixtures in `EIWAMS_Test`; standard deployments do not seed
demo employees or workflow records.

Automation: `dotnet test EIWAMS.API.slnx` (unit + `EIWAMS_Test` integration), `npx ng test --watch=false` in
`EIWAMS.Web`, Postman collection in `postman\`.

## Core test cases (SDD 17.2)

| ID | Scenario | Steps | Expected | Level |
|---|---|---|---|---|
| TC-01 | Missing/invalid token | EntraId mode: `GET /api/v1/me` without `Authorization`, then with an expired/forged token | 401, envelope `success:false`, no data | API |
| TC-02 | Inactive Entra-mapped user | Set `Users.IsActive=0` for a linked user; call `GET /api/v1/me` with a valid token (DevHeader: `X-User-Id` of that user) | 403, denied | API / integration |
| TC-03 | Duplicate employee number | Attempt to sync an existing `employeeNumber` twice | Conflict; one employee row | Integration |
| TC-04 | Employee reads another profile | Employee requests a profile outside self/team scope | 404 (concealed), no data | API / integration |
| TC-05 | Lost card reported | Employee reports a lost card | Card is blocked and a Lost card request enters the approval flow | Integration / E2E |
| TC-09 | Wrong approval stage | Stage is Manager; user 4 (Security) posts `v1/approvals/{id}/decision` | 403; request unchanged | API / integration |
| TC-10 | Reject without reason | Approver posts `decision: Reject` with empty `comments` | 400; no decision recorded | Unit / API |
| TC-11 | Duplicate approval retry | Repeat the same approve call with the old `version` | 409; one transition | Integration |
| TC-12 | Provision pending request | Access Control attempts to provision a request still awaiting approval | Conflict; no permission created | Integration |
| TC-13 | Invalid validity range | `POST /api/v1/access-requests` with `validToUtc <= validFromUtc` | 400; not saved | Unit / API |
| TC-14 | Employee-linked role assignment | Save roles for an employee without a linked account | Account is linked/created; Employee role remains assigned | Integration |
| TC-18 | Employee deactivation | User 2: `POST /api/v1/employees/{id}/deactivate` | Cards deactivated, permissions revoked, new access requests for the employee rejected (422) | Integration / E2E |
| TC-19 | Cross-facility access | User 5 scoped to building A reads a permission/request in building B | 404; no scope leakage | Integration |
| TC-20 | Audit row update | Run `UPDATE dbo.AuditLogs ...` as the API login; call any non-GET audit route | Permission denied / 404 route; audit append-only | Database / API |
| TC-21 | SQL injection in search | `GET /api/v1/employees?search=' OR 1=1 --` | Treated as literal text; 200 with no extra rows | API |
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
| API-08 | `GET /api/v1/admin/users` | Every listed account is linked to an employee; `userId` may be null before sign-in |
| API-09 | `PUT /api/v1/admin/employees/{employeeId}` | Assignable roles and organization fields update; Employee role remains assigned |
| API-10 | Mutations | `AuditLogs` row with actor, action, entity, UTC time, correlation ID |

## UI cases

| ID | Screen | Check |
|---|---|---|
| UI-01 | Sign-in | Entra sign-in resolves or provisions an employee account, then loads Home |
| UI-02 | App bar | Home, Requests, available Approvals, workflow queues, Employees, Admin, notifications and profile are easy to find |
| UI-03 | Navigation by role | Each role sees exactly the sections in the role matrix below; direct URL to a forbidden route shows the forbidden page |
| UI-04 | Responsive | Below `lg` the sections collapse into a hamburger panel that drops down from the top |
| UI-05 | Notifications | Bell shows the unread count; mark one / mark all read updates the badge |
| UI-06 | Lists | Loading skeleton, empty state, error state with correlation ID, paging/sort/search |
| UI-07 | Forms | Inline validation messages; submit disabled while saving; server 400 errors mapped to fields; success toast |
| UI-08 | Status chips | Colour plus icon plus text (not colour alone); tabular numbers in grids |
| UI-09 | Home | Employee summary, primary request actions, request status and only the approval queues assigned to the employee |
| UI-10 | Access request detail | Approval timeline, `canEdit/canSubmit/canCancel/canDecide/canProvision` drive the buttons |
| UI-11 | 409 conflict | Concurrency message with reload option |
| UI-12 | Accessibility | Keyboard reachable menus and dialogs, visible focus, labelled inputs, AA contrast |

## Role matrix

Every account has the `Employee` role. Additional roles are assigned to that employee: Manager handles manager-stage
approvals; HR verifies card requests; Security Head/Security review their stages; ID Card Team processes cards; Access
Control reviews and provisions access; System Admin manages employee roles and reference data. The SPA hides actions
the current employee cannot perform, and the API independently enforces permissions.

## End-to-end business flows

| ID | Flow | Actors | Pass criteria |
|---|---|---|---|
| E2E-01 | Existing employee signs in -> card request -> verify/approve -> issue -> activate | Employee, Manager, HR, ID Card Team | Card Active; history and audit rows |
| E2E-02 | Lost card: report lost -> block -> replacement -> old card swipe denied | 7, 4, 2 | Old card Blocked/Deactivated; new card Granted; violation for the old card |
| E2E-03 | Access request -> Manager -> Security -> Access Control provisions | Employee, Manager, Security, Access Control | Permission Active with correct dates and location |
| E2E-04 | Return and resubmit: Manager returns with comments -> employee edits -> resubmit -> approved | 7, 3 | Request goes Returned -> Submitted -> ...; comments visible |
| E2E-05 | Rejection: Security rejects with reason | 7, 3, 4 | Request Rejected; no permission |
| E2E-06 | Transfer: move employee to a new department/location | 2 | Permissions outside the new subtree suspended for review; history row |
| E2E-07 | Exit: deactivate employee | 2 | Cards deactivated; permissions revoked; swipe denied |
## UAT scenarios (SDD 17.3)

| ID | Persona | Scenario | Accepted when |
|---|---|---|---|
| UAT-01 | HR / System Admin | Assign roles, department, manager and location to an employee | Employee account and organization details are consistent |
| UAT-02 | Employee, HR/Security | Employee requests card; authorized user maps RFID UID and activates | Card Active, UID masked |
| UAT-03 | Employee, Security | Employee reports loss; Security verifies block and issues replacement | Old card blocked, new card active |
| UAT-04 | Employee, Manager, Security, Access Control | Workplace access request moves through assigned stages | Permission provisioned with the requested scope and dates |
| UAT-05 | HR / ID Card Team | Verify and process an ID card request | Employee can track the issued card |

## Defect severity (SDD 17.4)

| Severity | Definition | Release decision |
|---|---|---|
| Critical | Unauthorized access, data leak, audit tampering, serious integrity failure | Block release |
| High | Core approval/card lifecycle broken or incorrect permission | Block unless formally waived |
| Medium | Workaround exists; secondary workflow/usability defect | Fix or document risk |
| Low | Cosmetic wording/layout | Prioritize by accessibility/impact |
