# Microsoft Entra ID setup

EIWAMS uses two app registrations: a public **SPA** client, `EIWAMS-Web` (MSAL, authorization code + PKCE), and an
**API**, `EIWAMS-API`, that exposes the delegated scope `access_as_user`. Entra ID handles **authentication** (and an
optional coarse group gate). **Authorization is database-driven**: roles, permissions, facility scope and the menu all
come from SQL (see [API-CONTRACT.md](API-CONTRACT.md) section 4).

> The EIWAMS registrations do not exist yet. Every ID below is the placeholder
> `00000000-0000-0000-0000-000000000000`. Replace it in configuration (not in code) once the apps are registered.

## Registration reference

| Item | Value |
|---|---|
| Tenant ID | `<TENANT_ID>` (placeholder `00000000-0000-0000-0000-000000000000`) |
| **EIWAMS-Web** (SPA) application (client) ID | `<SPA_CLIENT_ID>` |
| **EIWAMS-API** application (client) ID | `<API_CLIENT_ID>` |
| EIWAMS-API Application ID URI (audience) | `api://<API_CLIENT_ID>` |
| Delegated scope | `access_as_user`, requested as `api://<API_CLIENT_ID>/access_as_user` |
| Optional access-gate security group | `<GROUP_OBJECT_ID>` (empty = no group check) |

These are public identifiers, not secrets. Neither registration needs a client secret or certificate.

## 1. Register EIWAMS-API

Azure portal > Microsoft Entra ID > App registrations > **New registration**:

1. Name `EIWAMS-API`, **Single tenant**, no redirect URI. Record the *Application (client) ID* as `<API_CLIENT_ID>`.
2. **Expose an API** > Application ID URI > Set `api://<API_CLIENT_ID>`.
3. **Add a scope**: `access_as_user`, Admins and users, display name "Access EIWAMS as the signed-in user", Enabled.
4. **Manifest**: `"requestedAccessTokenVersion": 2`.
5. **Token configuration** > Add optional claim (Access): `email`, `preferred_username` (used to link pre-provisioned users).
6. Only if you use the group gate: Token configuration > **Add groups claim** > Security groups, Group ID, in the
   **Access** token.
7. Certificates & secrets: **none**.

CLI equivalent:

```powershell
$api = az ad app create --display-name EIWAMS-API --sign-in-audience AzureADMyOrg | ConvertFrom-Json
az ad app update --id $api.appId --identifier-uris "api://$($api.appId)"
# add the access_as_user scope and requestedAccessTokenVersion=2 in the portal (Expose an API / Manifest)
az ad sp create --id $api.appId
```

## 2. Register EIWAMS-Web (SPA)

1. New registration `EIWAMS-Web`, Single tenant. Platform **Single-page application** with redirect URIs
   `http://localhost:4200` and the production origin(s), for example `https://eiwams.example.com` and
   `https://eiwams-web-dev.azurewebsites.net`. Record the client ID as `<SPA_CLIENT_ID>`.
2. Front-channel logout URL: the production origin. Implicit grant: **off**.
3. **API permissions** > Add > My APIs > `EIWAMS-API` > Delegated `access_as_user`; keep `Microsoft Graph / User.Read`.
   **Grant admin consent**.
4. Back on EIWAMS-API > Expose an API > **Add a client application**: `<SPA_CLIENT_ID>` with `access_as_user`.
5. Certificates & secrets: **none**. Never put a secret in the SPA.

The SPA has no hard-coded IDs. At startup it calls `GET /api/auth/config` and receives
`{ mode, tenantId, spaClientId, apiScope, authority }`.

## 3. Optional access-gate group

Create a security group (for example `EIWAMS Users`), add the people who may sign in, and set
`Auth:Entra:RequiredGroupId` to its object ID. Keep it empty to rely on DB provisioning alone. With a group gate the API
is fail-closed: a missing or overage `groups` claim is denied.

## 4. API configuration

```text
Auth:Mode                  = EntraId
Auth:Entra:TenantId        = <TENANT_ID>
Auth:Entra:ClientId        = <API_CLIENT_ID>        (EIWAMS-API)
Auth:Entra:SpaClientId     = <SPA_CLIENT_ID>        (EIWAMS-Web, returned to the browser)
Auth:Entra:Audience        = api://<API_CLIENT_ID>  (default when blank)
Auth:Entra:RequiredScope   = access_as_user
Auth:Entra:ApiScope        = api://<API_CLIENT_ID>/access_as_user   (derived when blank)
Auth:Entra:RequiredGroupId = <GROUP_OBJECT_ID> or empty
```

Environment-variable names and per-environment values: [ENVIRONMENT-VARIABLES.md](ENVIRONMENT-VARIABLES.md).
On Azure set the GitHub environment variables `AUTH_ENTRA_*` ([AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md)).

## 5. Token validation (per request)

1. Signature (OIDC metadata keys), issuer (tenant v2 or v1), audience (`Audience` or `ClientId`), lifetime.
2. `scp` contains `RequiredScope`.
3. When `RequiredGroupId` is set, `groups` contains it.
4. The EIWAMS user is resolved in SQL and must be active. `X-User-Id` is rejected in EntraId mode.

## 6. Mapping Entra users to EIWAMS users

1. `Users.EntraObjectId = oid` -> linked user.
2. Else an active user with `EntraObjectId IS NULL` whose e-mail matches `email`, `preferred_username` or `upn`
   -> linked on first sign-in (audited).
3. If no linked user or matching employee exists, an employee record is provisioned from Entra claims and linked.

Every account is employee-backed and receives the Employee role. SystemAdmin manages employee details and higher
workflow roles through **Admin > Employees & roles**. Deactivated users are denied even with a valid token (TC-02).

## 7. Local development without Entra

`Auth:Mode=DevHeader` is for local development only and requires explicitly provisioned local employee accounts; the
repository does not seed demo users. The SPA sends `X-User-Id`; `v1/dev/users` returns 404 in EntraId mode. **Never**
enable DevHeader on a reachable host.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| AADSTS50011 redirect mismatch | Add the exact origin (no path) to the EIWAMS-Web SPA redirect URIs |
| AADSTS65001 consent required | Grant admin consent for `access_as_user` on EIWAMS-Web |
| 401 invalid audience | `Audience`/`ClientId` is not EIWAMS-API, or the token was requested for Graph |
| 401 missing scope | The SPA did not request `api://<API_CLIENT_ID>/access_as_user` |
| 403 right after sign-in | No matching active EIWAMS user/e-mail, or not in the gate group |
| Startup failure about `Auth:Mode` | `Auth__Mode` missing or invalid in the host environment |
