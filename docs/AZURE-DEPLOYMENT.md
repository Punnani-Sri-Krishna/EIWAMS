# EIWAMS Azure deployment (GitHub Actions)

EIWAMS deploys to Azure through manually started GitHub Actions workflows that sign in with OIDC (no
stored Azure secrets). Infrastructure is Bicep in two stages: **foundation**, then **apps**.
The on-premises path (IIS, Cloudflare Tunnel) remains documented in [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md).

## Architecture (dev)

| Resource | Name | Notes |
|---|---|---|
| Resource group | `rg-eiwams-dev` (uaenorth) | Created manually |
| User-assigned identity (runtime) | `eiwams-id-dev` | Used by the Function App for storage and SQL |
| Storage account | `eiwamsstdev<hash>` | Shared-key access disabled; container `app-package` holds Flex deployment packages |
| Azure SQL server / database | `eiwams-sql-dev` / `EIWAMS` | Basic SKU in dev/test, S0 in prod; optional Entra admin |
| Log Analytics / App Insights | `eiwams-log-dev` / `eiwams-appi-dev` | Workspace-based |
| Function App (API) | `eiwams-func-dev` on `eiwams-func-plan-dev` | Flex Consumption (FC1), .NET 10 isolated, Linux |
| Web App (SPA) | `eiwams-web-dev` on `eiwams-web-plan-dev` | Windows App Service, B1 (P0v3 in prod); `web.config` provides the SPA fallback |

The SPA calls the API cross-origin at `https://<function host>/api`; the API's CORS list is the Web App
host plus `ADDITIONAL_CORS_ORIGINS`. At runtime the API connects to SQL with the managed identity
(`Authentication=Active Directory Managed Identity`), unless the fallback `SQL_RUNTIME_CONNECTION_STRING`
is set.

The storage account is a platform requirement of the Functions host (deployment package and host state).
EIWAMS keeps no application data, uploads, queues or blobs in it; all business data lives in SQL.

| File | Purpose |
|---|---|
| [infra/main.foundation.bicep](../infra/main.foundation.bicep) | Identity, storage, SQL server and database |
| [infra/main.apps.bicep](../infra/main.apps.bicep) | Monitoring, Function App, Web App, app settings, CORS |
| [infra/parameters/](../infra/parameters/) | `<env>.foundation.bicepparam` / `<env>.apps.bicepparam` for dev, test, prod |
| [infra/sql/](../infra/sql/) | One-time SQL scripts for identities and the fallback SQL user |
| [deploy/sql/Invoke-DbMigrations.ps1](../deploy/sql/Invoke-DbMigrations.ps1) | Checksum-tracked runner for `EIWAMS.Infrastructure/SQL/01..12` (owned by the API/DB work stream) |

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| [ci.yml](../.github/workflows/ci.yml) | push to `main`, PR to `main`, manual | Restore, build and test the API (unit plus SQL integration tests against a disposable SQL Server 2022 container via `EIWAMS_TEST_CONNECTION`; skipped tests raise a warning), publish the Functions package, then run the Angular unit tests (`npx ng test --watch=false`, Vitest) and the production build |
| [deploy-infra.yml](../.github/workflows/deploy-infra.yml) | manual | Preflight checks, then `what-if` for the chosen stage; deploys only when **apply** is ticked |
| [deploy-database.yml](../.github/workflows/deploy-database.yml) | manual | `plan`, `apply` or `baseline` of the SQL scripts through a temporary firewall rule |
| [deploy-api.yml](../.github/workflows/deploy-api.yml) | manual | Build, verify the package, check the Function App's settings and identity, deploy to Flex, smoke test `GET /api/auth/config` |
| [deploy-web.yml](../.github/workflows/deploy-web.yml) | manual | Point `apiBaseUrl` at the Function App, build, deploy, verify SPA routes, CORS and preflight |

All deploy workflows are `workflow_dispatch` only, run in the GitHub environment you select, and refuse
`test`/`prod` unless the variable `DEPLOYMENTS_ENABLED` is `true` in that environment. GitHub only lists
manual workflows that exist on the **default branch** (`main`), so merge `.github/workflows` to `main`
before first use; you can still choose another branch when you run a workflow.

## One-time Azure setup (Owner, done by hand)

1. Create the resource group: `az group create -n rg-eiwams-dev -l uaenorth`.
2. Register the resource providers: `Microsoft.Web`, `Microsoft.Storage`, `Microsoft.Sql`,
   `Microsoft.ManagedIdentity`, `Microsoft.Insights` and `Microsoft.OperationalInsights`
   (`az provider register -n <namespace>`).
3. Create the GitHub deploy identity, for example the user-assigned identity `id-eiwams-github-dev`:
   * Grant it **Contributor** on `rg-eiwams-dev`.
   * Add a federated credential with issuer `https://token.actions.githubusercontent.com`, audience
     `api://AzureADTokenExchange` and subject `repo:Punnani-Sri-Krishna/EIWAMS:environment:dev`. If your organization
     uses ID-based subject claims, copy the subject that appears in the failed `azure/login` log.
4. Optionally, create a separate migration identity (also with a federated credential for the `dev`
   environment) and set `SQL_MIGRATION_CLIENT_ID`. Otherwise the deploy identity runs the migrations.

## GitHub environment `dev`

Create the environment under **Settings → Environments** and add:

| Variables | Required | Value |
|---|---|---|
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | yes | Deploy identity client ID, tenant, subscription |
| `AZURE_RESOURCE_GROUP` | yes | `rg-eiwams-dev` |
| `SQL_SERVER_NAME`, `SQL_DATABASE_NAME` | database workflow | `eiwams-sql-dev` (short name or FQDN), `EIWAMS` |
| `FUNCTION_APP_NAME`, `WEB_APP_NAME` | API/web workflows | `eiwams-func-dev`, `eiwams-web-dev` (printed by stage 2) |
| `SQL_ENTRA_ADMIN_LOGIN`, `SQL_ENTRA_ADMIN_OBJECT_ID` | recommended | Entra admin for the SQL server (needed to create identity users) |
| `AUTH_ENTRA_TENANT_ID`, `AUTH_ENTRA_CLIENT_ID`, `AUTH_ENTRA_SPA_CLIENT_ID` | **yes** (apps stage) | EIWAMS tenant, EIWAMS-API and EIWAMS-Web client IDs ([ENTRA-SETUP.md](ENTRA-SETUP.md)). When empty the Bicep falls back to the placeholder `00000000-0000-0000-0000-000000000000` and sign-in cannot work |
| `AUTH_ENTRA_REQUIRED_SCOPE`, `AUTH_ENTRA_REQUIRED_GROUP_ID`, `AUTH_ENTRA_AUDIENCE`, `AUTH_ENTRA_API_SCOPE` | no | Defaults: `access_as_user`, no group check, `api://<API client ID>`, derived scope. Set `AUTH_ENTRA_REQUIRED_GROUP_ID` to the gate group object ID to turn on the group check |
| `ADDITIONAL_CORS_ORIGINS` | no | Comma-separated extra origins, for example a custom domain |
| `SQL_MIGRATION_CLIENT_ID` | no | Separate migration identity (see step 4 above) |
| `DEPLOYMENTS_ENABLED` | test/prod | `true` to allow deployments to that environment |

| Secrets | Required | Value |
|---|---|---|
| `SQL_ADMIN_PASSWORD` | foundation stage | SQL server admin password (also needed on re-runs) |
| `SQL_RUNTIME_CONNECTION_STRING` | no | Fallback runtime connection string (see [SQL fallback](#sql-fallback)) |
| `SQL_MIGRATION_CONNECTION_STRING` | no | Run migrations with SQL authentication instead of Entra |

## First release

1. **Infrastructure stage 1**: run *Deploy infrastructure* with `1-foundation`, review the what-if, then
   run it again with **apply** ticked. The summary lists the runtime identity and the storage scope.
2. **Owner follow-up** (the deploy identity is only Contributor):
   * Assign the runtime identity `eiwams-id-dev` **Storage Blob Data Owner**, **Storage Queue Data
     Contributor** and **Storage Table Data Contributor** on the storage account. The workflow summary
     prints the exact `az role assignment create` commands.
   * If `SQL_ENTRA_ADMIN_*` was not set, set an Entra admin on `eiwams-sql-dev` in the portal.
   * Connected to `EIWAMS` as the Entra admin, run [GrantRuntimeIdentity.sql](../infra/sql/GrantRuntimeIdentity.sql)
     and [GrantMigrationIdentity.sql](../infra/sql/GrantMigrationIdentity.sql), after editing the
     `DECLARE` values (identity name and client ID) at the top of each.
3. **Infrastructure stage 2**: run `2-apps` (preview, then apply). If a storage role from step 2 is
   missing, the preflight warns in preview and fails on apply. Copy the printed names into `FUNCTION_APP_NAME` and `WEB_APP_NAME`.
4. **Database**: run *Deploy database* with `plan`, then `apply`. Tick *include_admin_provisioning* to run
   the named-administrator script, and *include_demo_data* to run the demo data script (dev only).
5. **API**: run *Deploy API*. It checks the settings and identity before it deploys, then smoke tests
   `/api/auth/config`.
6. **Web**: run *Deploy web*.
7. **Entra**: add `https://eiwams-web-dev.azurewebsites.net` as a **SPA** redirect URI on EIWAMS-Web
   (see [ENTRA-SETUP.md](ENTRA-SETUP.md)), then sign in and run the smoke journey in [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md#6-smoke-journey).

Later releases need only *Deploy database* (when there are SQL changes), *Deploy API* and *Deploy web*.
Re-run infrastructure only when Bicep or settings change; stage 2 overwrites the app settings.

## Database migrations

`Invoke-DbMigrations.ps1` stores a SHA-256 checksum for each applied script in `dbo.SchemaMigrations`
(line endings and BOM are normalized first):

* `plan` lists each script as new, unchanged or changed. It writes nothing.
* `apply` runs new and changed scripts in order and stops at the first error. A failed script is not recorded.
  The EIWAMS scripts are idempotent, so re-running a changed script is safe.
* `baseline` records the current scripts as applied without running them, for a database built by hand
  (it requires `dbo.Users`).

The admin provisioning script runs only with *include_admin_provisioning*; the demo data script runs only with *include_demo_data*,
and the runner refuses it when the database name contains `prod`. To run the same migrations locally:

```powershell
.\deploy\sql\Invoke-DbMigrations.ps1 -Server . -Database EIWAMS -Action plan -Authentication Integrated -TrustServerCertificate
```

## SQL fallback

If managed-identity access to SQL cannot be set up yet:

1. Run [CreateRuntimeSqlUser.sql](../infra/sql/CreateRuntimeSqlUser.sql) in `EIWAMS` (set a strong password first).
2. Save `Server=tcp:eiwams-sql-dev.database.windows.net,1433;Database=EIWAMS;User ID=eiwams_api_dev;Password=<password>;Encrypt=True;TrustServerCertificate=False;`
   as the secret `SQL_RUNTIME_CONNECTION_STRING`.
3. Re-run infrastructure stage 2 (apply). *Deploy API* warns whenever the app and the secret disagree.

To go back to managed identity, delete the secret and re-run stage 2.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `azure/login`: *No matching federated identity record* | The federated credential subject must match the environment (`repo:Punnani-Sri-Krishna/EIWAMS:environment:dev`) |
| Workflow missing from the Actions list | It must exist on `main` |
| Stage 2 preflight: missing storage role | Run the `az role assignment create` commands from the stage 1 summary as an Owner |
| API returns 500 with SQL login failures | Run `GrantRuntimeIdentity.sql`; check that the client ID in the script matches `eiwams-id-dev` |
| Database workflow cannot connect | Check the Entra admin is set and `GrantMigrationIdentity.sql` was run; the temporary firewall rule is removed automatically |
| Browser CORS error | Re-run stage 2 after changing `ADDITIONAL_CORS_ORIGINS`; the Web App host is always allowed |
| Sign-in redirect error `AADSTS50011` | Add the Web App URL as a SPA redirect URI (first release, step 7) |
