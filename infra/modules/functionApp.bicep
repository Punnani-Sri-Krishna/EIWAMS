@description('Function App (API) name.')
param name string

@description('Flex Consumption plan name.')
param planName string

param location string
param tags object

@description('Resource ID of the user-assigned identity the app runs as (host storage, deployment storage and SQL).')
param identityResourceId string

@description('Client ID of the runtime identity.')
param identityClientId string

@description('Host storage account name (identity-based AzureWebJobsStorage).')
param storageAccountName string

@description('Primary blob endpoint of the host storage account, with trailing slash.')
param storageBlobEndpoint string

@description('Blob container that holds the Flex Consumption deployment package.')
param deploymentContainerName string

@description('Existing Application Insights component name.')
param appInsightsName string

@description('Origins allowed by platform CORS.')
param allowedOrigins array

@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40

@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048

@secure()
@description('Application settings merged over the platform settings (Auth__*, SqlConnectionString, ...). Secure so the optional SQL fallback secret is not stored in deployment history.')
param appSettings object

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true
  }
}

// FUNCTIONS_WORKER_RUNTIME / FUNCTIONS_EXTENSION_VERSION are rejected on Flex Consumption; the runtime is set in functionAppConfig.
var platformSettings = {
  AzureWebJobsStorage__accountName: storageAccountName
  AzureWebJobsStorage__credential: 'managedidentity'
  AzureWebJobsStorage__clientId: identityClientId
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  AZURE_FUNCTIONS_ENVIRONMENT: 'Production'
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageBlobEndpoint}${deploymentContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identityResourceId
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
      runtime: {
        name: 'dotnet-isolated'
        version: '10.0'
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      cors: {
        allowedOrigins: allowedOrigins
        supportCredentials: false
      }
    }
  }

  resource settings 'config' = {
    name: 'appsettings'
    properties: union(platformSettings, appSettings)
  }
}

resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: functionApp
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: functionApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

output name string = functionApp.name
output defaultHostName string = functionApp.properties.defaultHostName
