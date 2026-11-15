# EIWAMS configuration and environment variables

The API (`EIWAMS.API`) reads configuration from `local.settings.json` (`Values`, Functions Core Tools) or from process
environment variables / Function App settings. In environment variables `:` becomes `__`
(`Auth:Entra:TenantId` -> `Auth__Entra__TenantId`). Key names live in `EIWAMS.Application\Constants`; keep this file in
sync when they change. Entra values are placeholders until the registrations exist ([ENTRA-SETUP.md](ENTRA-SETUP.md)).

## API settings

| Key (`local.settings.json`) | Environment variable | Required | Development | Production |
|---|---|---|---|---|
| `FUNCTIONS_WORKER_RUNTIME` | same | yes (not on Flex Consumption, where the platform rejects it) | `dotnet-isolated` | `dotnet-isolated` |
| `AZURE_FUNCTIONS_ENVIRONMENT` | same | optional | `Development` | `Production` |
| `Auth:Mode` | `Auth__Mode` | **yes**; startup fails when missing/invalid | `DevHeader` | `EntraId` |
| `Auth:Entra:TenantId` | `Auth__Entra__TenantId` | EntraId | placeholder | `<TENANT_ID>` |
| `Auth:Entra:ClientId` | `Auth__Entra__ClientId` | EntraId | placeholder | `<API_CLIENT_ID>` (EIWAMS-API) |
| `Auth:Entra:SpaClientId` | `Auth__Entra__SpaClientId` | EntraId | placeholder | `<SPA_CLIENT_ID>` (EIWAMS-Web), returned by `auth/config` |
| `Auth:Entra:Audience` | `Auth__Entra__Audience` | optional | blank | `api://<API_CLIENT_ID>` (default when blank) |
| `Auth:Entra:RequiredScope` | `Auth__Entra__RequiredScope` | recommended | `access_as_user` | `access_as_user` |
| `Auth:Entra:ApiScope` | `Auth__Entra__ApiScope` | optional | `api://<API_CLIENT_ID>/access_as_user` | same (derived from Audience + RequiredScope when blank) |
| `Auth:Entra:RequiredGroupId` | `Auth__Entra__RequiredGroupId` | optional | blank | gate group object ID, or blank for no group check |
| `SqlConnectionString` | same | **yes** | see below | least-privilege login or managed identity |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | same | optional | blank | set on Azure by the apps stage; blank disables export |
| `Host.CORS` (Host section) | `--cors` on `func start` | dev only | `http://localhost:4200` | not needed behind IIS (same origin); Azure CORS is set by Bicep |
| `Host.LocalHttpPort` | `--port` on `func start` | optional | `7274` | `7274` (must match the IIS proxy rule) |

### Connection strings

```text
# Development (contract section 2; Windows auth, default instance)
Server=localhost;Database=EIWAMS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True

# Integration tests (EIWAMS.Tests; override with the EIWAMS_TEST_CONNECTION environment variable)
Server=localhost;Database=EIWAMS_Test;Integrated Security=True;Encrypt=True;TrustServerCertificate=True

# On-premises production (service account or SQL login; never sysadmin/db_owner)
Server=sql01;Database=EIWAMS;Integrated Security=True;Encrypt=True;TrustServerCertificate=False;Application Name=EIWAMS.API
Server=sql01;Database=EIWAMS;User ID=eiwams_app;Password=<secret>;Encrypt=True;TrustServerCertificate=False;Application Name=EIWAMS.API

# Azure (set by infra/main.apps.bicep; runtime managed identity)
Server=tcp:eiwams-sql-<env>.database.windows.net,1433;Initial Catalog=EIWAMS;Encrypt=True;Authentication=Active Directory Managed Identity;User Id=<eiwams-id-<env> client ID>;Application Name=EIWAMS.API
```

Grant the app login `db_datareader`, `db_datawriter` and `GRANT EXECUTE ON SCHEMA::dbo`. On Azure the GitHub secret
`SQL_RUNTIME_CONNECTION_STRING` replaces the managed-identity string ([AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md)).

### Development `EIWAMS.API\local.settings.json` (git-ignored; copy `local.settings.sample.json`)

```json
{
  "IsEncrypted": false,
  "Host": { "LocalHttpPort": 7274, "CORS": "http://localhost:4200", "CORSCredentials": false },
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "Auth:Mode": "DevHeader",
    "Auth:Entra:TenantId": "00000000-0000-0000-0000-000000000000",
    "Auth:Entra:ClientId": "00000000-0000-0000-0000-000000000000",
    "Auth:Entra:SpaClientId": "00000000-0000-0000-0000-000000000000",
    "Auth:Entra:Audience": "",
    "Auth:Entra:RequiredScope": "access_as_user",
    "Auth:Entra:ApiScope": "api://00000000-0000-0000-0000-000000000000/access_as_user",
    "Auth:Entra:RequiredGroupId": "",
    "SqlConnectionString": "Server=localhost;Database=EIWAMS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True",
    "APPLICATIONINSIGHTS_CONNECTION_STRING": ""
  }
}
```

### Production (on-premises)

Use [`deploy\functions\local.settings.Production.sample.json`](../deploy/functions/local.settings.Production.sample.json)
stored outside the repo and passed to `Publish-Api.ps1 -SettingsFile`, or set service environment variables:

```powershell
nssm set EIWAMS-API AppEnvironmentExtra `
  "FUNCTIONS_WORKER_RUNTIME=dotnet-isolated" "AZURE_FUNCTIONS_ENVIRONMENT=Production" `
  "Auth__Mode=EntraId" "Auth__Entra__TenantId=<TENANT_ID>" "Auth__Entra__ClientId=<API_CLIENT_ID>" `
  "Auth__Entra__SpaClientId=<SPA_CLIENT_ID>" "Auth__Entra__RequiredScope=access_as_user" `
  "SqlConnectionString=Server=localhost;Database=EIWAMS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True"
```

### Azure Function App settings

Set by `infra/main.apps.bicep` from the GitHub environment (`AUTH_ENTRA_*`, `SQL_RUNTIME_CONNECTION_STRING`):
`Auth__Mode=EntraId`, `Auth__Entra__*`, `SqlConnectionString`, `APPLICATIONINSIGHTS_CONNECTION_STRING`,
`AzureWebJobsStorage__accountName/credential/clientId` (Functions host only), `AZURE_FUNCTIONS_ENVIRONMENT=Production`.
Re-running stage 2-apps overwrites them; do not edit them in the portal.

## Angular environments (`EIWAMS.Web\src\environments`)

| File | Used by | Values |
|---|---|---|
| `environment.development.ts` | `npm start` / `ng serve` | `production: false`, `apiBaseUrl: '/api'` (proxied to `http://127.0.0.1:7274` by `proxy.conf.json`) |
| `environment.ts` | `ng build` (production) | `production: true`, `apiBaseUrl: '/api'` (same origin behind IIS). `deploy-web.yml` replaces it with `https://<function host>/api` for Azure. |

The SPA has no build-time secrets or Entra IDs: tenant, SPA client ID, scope and authority come from
`GET /api/auth/config`. In DevHeader mode it shows the user picker from `GET /api/v1/dev/users`.

## Request headers

| Header | Mode | Purpose |
|---|---|---|
| `Authorization: Bearer <token>` | EntraId | Access token for `api://<API_CLIENT_ID>/access_as_user` |
| `X-User-Id: <UserId>` | DevHeader only | Acting user; rejected in EntraId mode |
| `X-Correlation-Id: <guid>` | both | Optional; generated when absent, echoed in the response and written to `AuditLogs` |

## Other variables

| Variable | Where | Purpose |
|---|---|---|
| `EIWAMS_TEST_CONNECTION` | CI / developer machine | Overrides the `EIWAMS_Test` connection used by integration tests (catalog must end with `_Test`) |
| GitHub environment variables and secrets | `.github/workflows/deploy-*.yml` | See [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md#github-environment-dev) |

## Database settings (`SystemSettings`)

Business settings (for example request validity limits) are stored in SQL and edited in **Admin > Settings**
(`GET/PUT /api/v1/admin/settings`, permission `Settings.Manage`). They are not environment variables.
