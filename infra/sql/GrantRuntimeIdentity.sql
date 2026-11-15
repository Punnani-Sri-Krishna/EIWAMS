/*
    EIWAMS - grant the Function App runtime identity access to the application database.

    Run ONCE per environment, after deploy-infra stage 1, connected to the APPLICATION database
    (EIWAMS, not master) as the server's Microsoft Entra admin. Use the Azure portal Query editor
    (SQL database > Query editor > Microsoft Entra authentication) or:
        sqlcmd -S eiwams-sql-dev.database.windows.net -d EIWAMS --authentication-method ActiveDirectoryDefault -i GrantRuntimeIdentity.sql

    Set the two values below from the deploy-infra stage 1 outputs (identityName, identityClientId).
    The user is created from the client ID (WITH SID ... TYPE = E), so the SQL server does not need
    Microsoft Graph / Directory Readers permissions.

    Least privilege: read, write and EXECUTE on dbo. No DDL. Idempotent.
*/
SET NOCOUNT ON;

DECLARE @IdentityName     SYSNAME          = N'eiwams-id-dev';
DECLARE @IdentityClientId UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000000';  -- identityClientId, NOT principalId

IF DB_NAME() = N'master'
    THROW 50000, N'Connect to the application database (EIWAMS), not master.', 1;
IF @IdentityClientId = '00000000-0000-0000-0000-000000000000'
    THROW 50001, N'Set @IdentityClientId to the runtime identity client ID (deploy-infra stage 1 output identityClientId).', 1;

DECLARE @Sid VARBINARY(16) = CONVERT(VARBINARY(16), @IdentityClientId);
DECLARE @User NVARCHAR(260) = QUOTENAME(@IdentityName);
DECLARE @Sql NVARCHAR(MAX);

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @IdentityName)
BEGIN
    SET @Sql = N'CREATE USER ' + @User + N' WITH SID = ' + CONVERT(NVARCHAR(40), @Sid, 1) + N', TYPE = E;';
    EXEC (@Sql);
    PRINT N'Created database user ' + @User + N'.';
END
ELSE IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @IdentityName AND sid = @Sid)
    THROW 50002, N'A database user with this name exists but maps to a different identity. Drop it (DROP USER) and re-run.', 1;

SET @Sql = N'ALTER ROLE db_datareader ADD MEMBER ' + @User + N';'
         + N'ALTER ROLE db_datawriter ADD MEMBER ' + @User + N';'
         + N'GRANT EXECUTE ON SCHEMA::dbo TO ' + @User + N';';
EXEC (@Sql);

SELECT p.name AS UserName, p.type_desc, p.authentication_type_desc,
       Roles = (SELECT STRING_AGG(r.name, N', ') FROM sys.database_role_members m
                JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
                WHERE m.member_principal_id = p.principal_id),
       Permissions = (SELECT STRING_AGG(dp.permission_name + N' ON ' + dp.class_desc, N', ')
                      FROM sys.database_permissions dp WHERE dp.grantee_principal_id = p.principal_id AND dp.state = 'G')
FROM sys.database_principals p
WHERE p.name = @IdentityName;
