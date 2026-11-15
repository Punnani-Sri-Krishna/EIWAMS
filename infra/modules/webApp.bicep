@description('App Service (frontend) name.')
param name string

@description('App Service plan name.')
param planName string

param location string
param tags object

@description('App Service plan SKU, for example B1 or F1.')
param skuName string = 'B1'

var freeTier = contains(['F1', 'D1', 'FREE', 'SHARED'], toUpper(skuName))

// Windows plan: the Angular build ships public/web.config, whose IIS URL Rewrite rule provides the SPA deep-link fallback.
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'app'
  sku: {
    name: skuName
  }
  properties: {
    reserved: false
  }
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  kind: 'app'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      alwaysOn: !freeTier
      use32BitWorkerProcess: freeTier
      defaultDocuments: [
        'index.html'
      ]
    }
  }
}

// Deployments use Entra ID (GitHub OIDC), so basic-auth publishing credentials are disabled.
resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: site
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: site
  name: 'ftp'
  properties: {
    allow: false
  }
}

output name string = site.name
output defaultHostName string = site.properties.defaultHostName
