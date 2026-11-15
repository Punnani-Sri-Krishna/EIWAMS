@description('Globally unique Azure SQL logical server name.')
param serverName string

@description('Database name.')
param databaseName string

param location string
param tags object

@description('SQL authentication administrator login. Reserved for break-glass administration; never used by workflows or the app.')
param adminLogin string

@secure()
@description('Password for the SQL administrator login.')
param adminPassword string

@description('Display name of the Microsoft Entra administrator (user or group) in the deployment tenant. Empty skips Entra admin configuration.')
param entraAdminLogin string = ''

@description('Object ID of the Microsoft Entra administrator. Required for managed-identity SQL access.')
param entraAdminObjectId string = ''

@description('Database SKU, for example { name: \'Basic\', tier: \'Basic\', capacity: 5 }.')
param databaseSku object

@description('Adds the 0.0.0.0 rule so Azure-hosted services (the Function App) can reach the server.')
param allowAzureServices bool = true

resource sqlServer 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// SQL logins stay enabled (Entra-only is off) so the contained-user fallback keeps working.
resource entraAdmin 'Microsoft.Sql/servers/administrators@2023-08-01' = if (!empty(entraAdminObjectId)) {
  parent: sqlServer
  name: 'ActiveDirectory'
  properties: {
    administratorType: 'ActiveDirectory'
    login: entraAdminLogin
    sid: entraAdminObjectId
    tenantId: tenant().tenantId
  }
}

resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01' = if (allowAzureServices) {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sqlServer
  name: databaseName
  location: location
  tags: tags
  sku: databaseSku
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
  }
}

output serverName string = sqlServer.name
output serverResourceId string = sqlServer.id
output serverFqdn string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
output entraAdminConfigured bool = !empty(entraAdminObjectId)
