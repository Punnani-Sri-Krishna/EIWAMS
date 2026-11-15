// Stage 1 - foundation: runtime identity, host storage, Azure SQL server and database.
// The storage account exists only because the Azure Functions host (Flex Consumption) needs it for its deployment
// package and host state. EIWAMS stores no application data, files or queues in it (out of scope by design).
// Run first. Then an Owner assigns the storage data roles listed in the outputs before stage 2 (apps).
targetScope = 'resourceGroup'

@description('Short lowercase prefix used in every resource name.')
@minLength(2)
@maxLength(8)
param prefix string = 'eiwams'

@description('Environment short name.')
@allowed(['dev', 'test', 'prod'])
param environmentName string

param location string = resourceGroup().location

@description('Runtime user-assigned identity name.')
param identityName string = '${prefix}-id-${environmentName}'

@description('Host storage account name. Leave the default unless the generated name is taken.')
@maxLength(24)
param storageAccountName string = toLower('${prefix}st${environmentName}${take(uniqueString(resourceGroup().id), 6)}')

@description('Blob container for the Flex Consumption deployment package.')
param deploymentContainerName string = 'app-package'

param sqlServerName string = '${prefix}-sql-${environmentName}'
param sqlDatabaseName string = 'EIWAMS'
param sqlAdminLogin string = '${prefix}${environmentName}-admin'

@secure()
param sqlAdminPassword string

@description('Microsoft Entra admin display name (user or group). Required before the runtime identity can be added as a database user.')
param sqlEntraAdminLogin string = ''

@description('Microsoft Entra admin object ID.')
param sqlEntraAdminObjectId string = ''

param sqlDatabaseSku object = {
  name: 'Basic'
  tier: 'Basic'
  capacity: 5
}

param tags object = {}

var allTags = union({ application: 'EIWAMS', environment: environmentName, stage: 'foundation' }, tags)

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    name: identityName
    location: location
    tags: allTags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: storageAccountName
    location: location
    tags: allTags
    containerNames: [
      deploymentContainerName
    ]
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    serverName: sqlServerName
    databaseName: sqlDatabaseName
    location: location
    tags: allTags
    adminLogin: sqlAdminLogin
    adminPassword: sqlAdminPassword
    entraAdminLogin: sqlEntraAdminLogin
    entraAdminObjectId: sqlEntraAdminObjectId
    databaseSku: sqlDatabaseSku
  }
}

output identityName string = identity.outputs.name
output identityResourceId string = identity.outputs.resourceId
output identityClientId string = identity.outputs.clientId
output identityPrincipalId string = identity.outputs.principalId
output storageAccountName string = storage.outputs.name
output storageAccountId string = storage.outputs.resourceId
output deploymentContainerName string = deploymentContainerName
output sqlServerName string = sql.outputs.serverName
output sqlServerFqdn string = sql.outputs.serverFqdn
output sqlDatabaseName string = sql.outputs.databaseName
output sqlEntraAdminConfigured bool = sql.outputs.entraAdminConfigured

@description('Role assignments an Owner / User Access Administrator must create for the runtime identity on the storage account before stage 2.')
output requiredStorageRoles array = [
  { name: 'Storage Blob Data Owner', id: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' }
  { name: 'Storage Queue Data Contributor', id: '974c5e8b-45b9-4653-ba55-5f855dd0fb88' }
  { name: 'Storage Table Data Contributor', id: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' }
]
