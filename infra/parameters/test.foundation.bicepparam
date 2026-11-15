using '../main.foundation.bicep'

// test foundation (stage 1). Secrets and tenant-specific values come from the GitHub 'test' environment via the workflow.
param prefix = 'eiwams'
param environmentName = 'test'
param sqlServerName = 'eiwams-sql-test'
param sqlDatabaseName = 'EIWAMS'
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD', '')
param sqlEntraAdminLogin = readEnvironmentVariable('SQL_ENTRA_ADMIN_LOGIN', '')
param sqlEntraAdminObjectId = readEnvironmentVariable('SQL_ENTRA_ADMIN_OBJECT_ID', '')
param sqlDatabaseSku = {
  name: 'Basic'
  tier: 'Basic'
  capacity: 5
}
