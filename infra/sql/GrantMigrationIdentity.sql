/*
    EIWAMS - grant the GitHub migration identity the rights the "Deploy database" workflow needs.

    The workflow connects with Microsoft Entra authentication as SQL_MIGRATION_CLIENT_ID, or as the
    deploy identity (AZURE_CLIENT_ID, e.g. id-eiwams-github-dev) when that variable is empty.

    Run ONCE per environment, connected to the APPLICATION database (EIWAMS, not master) as the
    server's Microsoft Entra admin (portal Query editor or sqlcmd with Entra auth).
    Set the two values below to the identity's name and CLIENT ID (Azure portal > Managed Identities).

    Rights: create/alter tables, views, functions and procedures (db_ddladmin), read/write data,
    EXECUTE and VIEW DEFINITION on dbo. Not db_owner, not server admin. Idempotent.
*/
SET NOCOUNT ON;

DECLARE @IdentityName     SYSNAME          = N'id-eiwams-github-dev';
DECLARE @IdentityClientId UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000000';  -- client ID, NOT object/principal ID

IF DB_NAME() = N'master'
    THROW 50000, N'Connect to the application database (EIWAMS), not master.', 1;
IF @IdentityClientId = '00000000-0000-0000-0000-000000000000'
    THROW 50001, N'Set @IdentityClientId to the migration identity client ID.', 1;

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

SET @Sql = N'ALTER ROLE db_ddladmin ADD MEMBER ' + @User + N';'
         + N'ALTER ROLE db_datareader ADD MEMBER ' + @User + N';'
         + N'ALTER ROLE db_datawriter ADD MEMBER ' + @User + N';'
         + N'GRANT EXECUTE ON SCHEMA::dbo TO ' + @User + N';'
         + N'GRANT VIEW DEFINITION ON SCHEMA::dbo TO ' + @User + N';';
EXEC (@Sql);

SELECT p.name AS UserName, p.type_desc,
       Roles = (SELECT STRING_AGG(r.name, N', ') FROM sys.database_role_members m
                JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
                WHERE m.member_principal_id = p.principal_id)
FROM sys.database_principals p
WHERE p.name = @IdentityName;
