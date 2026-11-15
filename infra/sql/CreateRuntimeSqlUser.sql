/*
    EIWAMS - FALLBACK ONLY: contained SQL-authentication user for the Function App.

    Use only when managed-identity access cannot be configured yet (for example no Microsoft Entra
    admin on the server). Run connected to the APPLICATION database (EIWAMS, not master) as the
    server admin or Entra admin, with a strong generated password.

    Then store the connection string as the GitHub 'dev' environment secret SQL_RUNTIME_CONNECTION_STRING:
        Server=tcp:eiwams-sql-dev.database.windows.net,1433;Initial Catalog=EIWAMS;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;User ID=eiwams_api_dev;Password=<password>;Application Name=EIWAMS.API
    and re-run "Deploy infrastructure" stage 2-apps with apply. Delete the secret and re-run stage 2
    to switch back to the managed identity. Idempotent (the password is reset on re-run).
*/
SET NOCOUNT ON;

DECLARE @UserName SYSNAME       = N'eiwams_api_dev';
DECLARE @Password NVARCHAR(128) = N'';  -- set a strong password; never commit it

IF DB_NAME() = N'master'
    THROW 50000, N'Connect to the application database (EIWAMS), not master.', 1;
IF LEN(@Password) < 16
    THROW 50001, N'Set @Password to a generated password of at least 16 characters.', 1;

DECLARE @User NVARCHAR(260) = QUOTENAME(@UserName);
DECLARE @Sql NVARCHAR(MAX);

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @UserName)
    SET @Sql = N'CREATE USER ' + @User + N' WITH PASSWORD = ' + QUOTENAME(@Password, '''') + N';';
ELSE
    SET @Sql = N'ALTER USER ' + @User + N' WITH PASSWORD = ' + QUOTENAME(@Password, '''') + N';';
EXEC (@Sql);

SET @Sql = N'ALTER ROLE db_datareader ADD MEMBER ' + @User + N';'
         + N'ALTER ROLE db_datawriter ADD MEMBER ' + @User + N';'
         + N'GRANT EXECUTE ON SCHEMA::dbo TO ' + @User + N';';
EXEC (@Sql);

PRINT N'Contained user ' + @User + N' is ready.';
