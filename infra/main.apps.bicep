// Stage 2 - apps: monitoring, Windows App Service (Angular SPA) and Flex Consumption Function App (.NET 10 API).
// References the stage 1 identity, storage and SQL server; it never recreates them.
targetScope = 'resourceGroup'

@minLength(2)
@maxLength(8)
param prefix string = 'eiwams'

@allowed(['dev', 'test', 'prod'])
param environmentName string

param location string = resourceGroup().location

@description('Stage 1 runtime identity name.')
param identityName string = '${prefix}-id-${environmentName}'

@description('Stage 1 host storage account name (same default as stage 1).')
@maxLength(24)
param storageAccountName string = toLower('${prefix}st${environmentName}${take(uniqueString(resourceGroup().id), 6)}')

param deploymentContainerName string = 'app-package'

@description('Stage 1 SQL server and database.')
param sqlServerName string = '${prefix}-sql-${environmentName}'
param sqlDatabaseName string = 'EIWAMS'

param functionAppName string = '${prefix}-func-${environmentName}'
param functionPlanName string = '${prefix}-func-plan-${environmentName}'
param webAppName string = '${prefix}-web-${environmentName}'
param webPlanName string = '${prefix}-web-plan-${environmentName}'

@description('Windows App Service plan SKU for the SPA.')
param webSkuName string = 'B1'

param functionMaximumInstanceCount int = 40
param functionInstanceMemoryMB int = 2048

@description('Origins allowed to call the API in addition to the web app (for example a custom domain).')
param additionalCorsOrigins array = []

@description('Microsoft Entra tenant ID used to validate API tokens.')
param authTenantId string

@description('EIWAMS-API app registration client ID.')
param authApiClientId string

@description('EIWAMS-Web (SPA) app registration client ID.')
param authSpaClientId string

@description('Delegated scope tokens must carry.')
param authRequiredScope string = 'access_as_user'

@description('Entra security group required for access. Empty disables the group check.')
param authRequiredGroupId string = ''

@description('Token audience. Empty lets the API default to api://{authApiClientId}.')
param authAudience string = ''

@description('Full scope the SPA requests. Empty lets the API derive it.')
param authApiScope string = ''

@secure()
@description('Fallback SQL connection string (SQL authentication). Empty uses the runtime managed identity, which is the default.')
param sqlRuntimeConnectionString string = ''

param tags object = {}

var allTags = union({ application: 'EIWAMS', environment: environmentName, stage: 'apps' }, tags)

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01' existing = {
  name: sqlServerName
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    logAnalyticsName: '${prefix}-log-${environmentName}'
    appInsightsName: '${prefix}-appi-${environmentName}'
    location: location
    tags: allTags
  }
}

module web 'modules/webApp.bicep' = {
  name: 'web'
  params: {
    name: webAppName
    planName: webPlanName
    location: location
    tags: allTags
    skuName: webSkuName
  }
}

var managedIdentitySqlConnectionString = 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Initial Catalog=${sqlDatabaseName};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;Authentication=Active Directory Managed Identity;User Id=${identity.properties.clientId};Application Name=EIWAMS.API'

var authSettings = {
  Auth__Mode: 'EntraId'
  Auth__Entra__TenantId: authTenantId
  Auth__Entra__ClientId: authApiClientId
  Auth__Entra__SpaClientId: authSpaClientId
  Auth__Entra__RequiredScope: authRequiredScope
  Auth__Entra__RequiredGroupId: authRequiredGroupId
}

var optionalAuthSettings = union(
  empty(authAudience) ? {} : { Auth__Entra__Audience: authAudience },
  empty(authApiScope) ? {} : { Auth__Entra__ApiScope: authApiScope }
)

module api 'modules/functionApp.bicep' = {
  name: 'api'
  params: {
    name: functionAppName
    planName: functionPlanName
    location: location
    tags: allTags
    identityResourceId: identity.id
    identityClientId: identity.properties.clientId
    storageAccountName: storage.name
    storageBlobEndpoint: storage.properties.primaryEndpoints.blob
    deploymentContainerName: deploymentContainerName
    appInsightsName: monitoring.outputs.appInsightsName
    allowedOrigins: union(['https://${web.outputs.defaultHostName}'], additionalCorsOrigins)
    maximumInstanceCount: functionMaximumInstanceCount
    instanceMemoryMB: functionInstanceMemoryMB
    appSettings: union(authSettings, optionalAuthSettings, {
      SqlConnectionString: empty(sqlRuntimeConnectionString) ? managedIdentitySqlConnectionString : sqlRuntimeConnectionString
    })
  }
}

output functionAppName string = api.outputs.name
output functionAppHostName string = api.outputs.defaultHostName
output functionAppUrl string = 'https://${api.outputs.defaultHostName}'
output apiBaseUrl string = 'https://${api.outputs.defaultHostName}/api'
output webAppName string = web.outputs.name
output webAppHostName string = web.outputs.defaultHostName
output webAppUrl string = 'https://${web.outputs.defaultHostName}'
output appInsightsName string = monitoring.outputs.appInsightsName
