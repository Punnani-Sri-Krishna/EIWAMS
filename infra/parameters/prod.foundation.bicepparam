using '../main.foundation.bicep'

// prod foundation (stage 1). Secrets and tenant-specific values come from the GitHub 'prod' environment via the workflow.
param prefix = 'eiwams'
param environmentName = 'prod'
param sqlServerName = 'eiwams-sql-prod'
param sqlDatabaseName = 'EIWAMS'
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD', '')
param sqlEntraAdminLogin = readEnvironmentVariable('SQL_ENTRA_ADMIN_LOGIN', '')
param sqlEntraAdminObjectId = readEnvironmentVariable('SQL_ENTRA_ADMIN_OBJECT_ID', '')
param sqlDatabaseSku = {
  name: 'S0'
  tier: 'Standard'
  capacity: 10
}
