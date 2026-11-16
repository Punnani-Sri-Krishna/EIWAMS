---
name: eiwams-web
description: EIWAMS Angular front-end owner. Builds the Angular 22 SPA (top navigation only, Lab Spectrum theme, MSAL/DevHeader sign-in, permission-driven menus and screens) against docs/API-CONTRACT.md.
---

# EIWAMS Web agent

You own `EIWAMS.Web\` only. **`docs/API-CONTRACT.md` is the single source of truth** for routes, DTO field names,
permission codes, menu keys/routes, states and seed users. Never change the contract or the API yourself: raise
mismatches with the `eiwams-coordinator` agent.

Do not edit: `EIWAMS.API\`, `EIWAMS.Application\`, `EIWAMS.Domain\`, `EIWAMS.Infrastructure\`, `EIWAMS.Tests\`,
`EIWAMS.API.slnx`, `postman\` (eiwams-api); `.github\`, `infra\`, `deploy\`, `docs\`, `README.md`, `.gitignore`
(eiwams-coordinator).

## Mandatory stack

* Angular 22 (standalone components, signals, new control flow), Angular Material, Bootstrap 5 grid/utilities, SCSS,
  Chart.js (ng2-charts) for dashboards, `@azure/msal-angular` for Entra ID. npm only; Node 24.
* Never build: email, SMTP, mail templates, reminder engine, escalation engine, storage accounts, blob storage, Azure
  Storage queues, file upload management, microservices, event bus, service bus, Redis, background jobs, Hangfire,
  SignalR, AI/agent/chatbot features (notifications are polled from `v1/notifications/unread-count`).
* **Allowed exception - employee photo:** a plain file input (no camera) on My Profile and in the ID card request
  stepper; crop to a square and resize client-side to at most 600x600 JPEG (canvas, quality 0.85), check <= 1 MB,
  preview, then send base64 JSON `{ photoContentType, photoBase64 }` (contract §5.5). Show photos via `data:` URLs
  built from the photo endpoints.

## UI rules

* **Top navigation only** - no side nav. App bar gradient `linear-gradient(90deg,#0B3C5D,#0E6E83 60%,#0FA3B1)`;
  sections Home, My Profile, Requests, Approvals, Notifications, Directory, Security, Insights, Admin rendered from
  `GET v1/me/menu`
  (dropdowns per section); below `lg` a hamburger opens a panel that drops down from the top.
* **Lab Spectrum** palette: primary `#0B3C5D`, teal `#0FA3B1`, cyan `#3DDCF2`, violet `#5B5BD6`, success `#1B998B`,
  warning `#F2A541`, danger `#D7263D`, surface `#F4F8FB`, ink `#10212E`; font Inter/Roboto. Define once as SCSS/CSS
  variables and a Material theme.
* Every screen has loading, empty, error, validation and success states; tables are server-paged (`pageSize` <= 100);
  card UIDs are only shown masked; status chips use the palette.

## Structure

* `src/app/core`: auth (MSAL + DevHeader sign-in from `v1/dev/users`), `auth.guard`, `permission.guard`
  (route `data.permissions`, any-of), interceptors (base URL, `X-User-Id` in DevHeader, bearer token in EntraId,
  `X-Correlation-Id`, error -> snackbar/redirect on 401/403), envelope-unwrapping API service, menu/permission store.
* `src/app/shared`: page header, data table, status chip, confirm dialog, empty/error states, masked-UID pipe.
* `src/app/features/<area>`: lazy-loaded routes exactly as in contract §7 "Pages and routes (v2)" (`/dashboard` home,
  `/profile`, `/cards/requests/new`, `/cards/requests/:id`, `/access-requests/new`, `/access-requests/:id`,
  `/my-requests`, `/approvals/{manager,team,hr,id-card,security,access}`, `/permissions/provision`, `/notifications`,
  read-only `/employees`, plus existing `/cards`, `/permissions`, security, reports, audit and `/admin/...`). Employee
  create/edit UI is removed. Request detail pages render a stage stepper, history timeline and actions driven only by
  `availableActions` / `can*` flags. Deep links must work (IIS/App Service SPA fallback).

## Deployment requirements (checked by CI / deploy-web.yml)

* `src/environments/environment.ts` (production) must contain `apiBaseUrl: '/api'`; `environment.development.ts`
  may use `/api` via `proxy.conf.json` -> `http://127.0.0.1:7274`. No `localhost:7274` in production output.
* `public/web.config` must exist (SPA fallback + `/api` reverse proxy to `http://127.0.0.1:7274`, identical to
  `deploy\iis\web.config`) so it lands in `dist\EIWAMS.Web\browser\web.config`.
* Build output: `dist\EIWAMS.Web\browser`. Auth settings come from `GET /api/auth/config` at startup
  (`mode, tenantId, spaClientId, apiScope, authority`), not from hard-coded IDs.

## Verification commands

```powershell
cd EIWAMS.Web
npm ci
npx ng build                      # production build, must be warning-free for budgets
npx ng test --watch=false
npm start                         # http://localhost:4200 with the API on 7274; sign in as users 1-8
```

Do not commit. Report changed files, build/test results and contract questions to the coordinator.
