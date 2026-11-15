using '../main.apps.bicep'

// dev apps (stage 2). Empty GitHub variables fall back to placeholder IDs until the EIWAMS app registrations exist (docs/ENTRA-SETUP.md).
var tenantId = readEnvironmentVariable('AUTH_ENTRA_TENANT_ID', '')
var apiClientId = readEnvironmentVariable('AUTH_ENTRA_CLIENT_ID', '')
var spaClientId = readEnvironmentVariable('AUTH_ENTRA_SPA_CLIENT_ID', '')
var requiredScope = readEnvironmentVariable('AUTH_ENTRA_REQUIRED_SCOPE', '')
var requiredGroupId = readEnvironmentVariable('AUTH_ENTRA_REQUIRED_GROUP_ID', '')
var corsOrigins = readEnvironmentVariable('ADDITIONAL_CORS_ORIGINS', '')

param prefix = 'eiwams'
param environmentName = 'dev'
param sqlServerName = 'eiwams-sql-dev'
param sqlDatabaseName = 'EIWAMS'
param webSkuName = 'B1'

param authTenantId = empty(tenantId) ? '00000000-0000-0000-0000-000000000000' : tenantId
param authApiClientId = empty(apiClientId) ? '00000000-0000-0000-0000-000000000000' : apiClientId
param authSpaClientId = empty(spaClientId) ? '00000000-0000-0000-0000-000000000000' : spaClientId
param authRequiredScope = empty(requiredScope) ? 'access_as_user' : requiredScope
// Empty or 'none' disables the group check.
param authRequiredGroupId = empty(requiredGroupId) ? '' : (toLower(requiredGroupId) == 'none' ? '' : requiredGroupId)
param authAudience = readEnvironmentVariable('AUTH_ENTRA_AUDIENCE', '')
param authApiScope = readEnvironmentVariable('AUTH_ENTRA_API_SCOPE', '')
param additionalCorsOrigins = empty(corsOrigins) ? [] : map(split(corsOrigins, ','), o => trim(o))

param sqlRuntimeConnectionString = readEnvironmentVariable('SQL_RUNTIME_CONNECTION_STRING', '')
