/*=====================================================================
  EIWAMS - 13_Grant_Admin_Users.sql
  Named administrator provisioning. Run only on request
  (Invoke-DbMigrations.ps1 -IncludeAdminProvisioning or
  Deploy-Database.ps1 -IncludeAdminProvisioning).

  Idempotent:
    * Ensures the bootstrap administrator (admin@eiwams.local) is active,
      has AllFacilities and the SystemAdmin role.
    * Creates each named administrator listed in @Admins when the email
      does not exist, reactivates inactive ones, links EntraObjectId only
      when it is currently NULL, and adds SystemAdmin (existing roles kept).
      Users without an object id are linked by email on first sign-in
      (dbo.usp_User_ResolveEntra).
  Add rows to @Admins for your tenant; never commit real secrets.
=====================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

DECLARE @AdminRoleId INT = (SELECT RoleId FROM dbo.Roles WHERE RoleName = N'SystemAdmin');
IF @AdminRoleId IS NULL
    THROW 50404, N'SystemAdmin role not found. Run 11_SeedData.sql first.', 1;

DECLARE @TenantId UNIQUEIDENTIFIER = NULL;   -- set to your Entra tenant id when object ids are supplied
DECLARE @Admins TABLE
(
    Email         NVARCHAR(256)    NOT NULL PRIMARY KEY,
    DisplayName   NVARCHAR(200)    NOT NULL,
    EntraObjectId UNIQUEIDENTIFIER NULL
);
-- INSERT @Admins (Email, DisplayName, EntraObjectId) VALUES (N'someone@contoso.com', N'Someone', NULL);

BEGIN TRAN;

UPDATE dbo.Users SET IsActive = 1, AllFacilities = 1, UpdatedAtUtc = SYSUTCDATETIME()
WHERE Email = N'admin@eiwams.local' AND (IsActive = 0 OR AllFacilities = 0);

INSERT dbo.Users (EntraTenantId, EntraObjectId, DisplayName, Email, IsActive, AllFacilities)
SELECT CASE WHEN a.EntraObjectId IS NULL THEN NULL ELSE @TenantId END,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.Users x WHERE x.EntraObjectId = a.EntraObjectId) THEN NULL ELSE a.EntraObjectId END,
       a.DisplayName, a.Email, 1, 1
FROM @Admins a
WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.Email = a.Email);

UPDATE u
SET IsActive = 1,
    AllFacilities = 1,
    EntraObjectId = COALESCE(u.EntraObjectId, a.EntraObjectId),
    EntraTenantId = CASE WHEN u.EntraObjectId IS NULL AND a.EntraObjectId IS NOT NULL THEN @TenantId ELSE u.EntraTenantId END,
    UpdatedAtUtc = SYSUTCDATETIME()
FROM dbo.Users u
JOIN @Admins a ON a.Email = u.Email
WHERE u.IsActive = 0 OR u.AllFacilities = 0
   OR (u.EntraObjectId IS NULL AND a.EntraObjectId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.Users x WHERE x.EntraObjectId = a.EntraObjectId));

INSERT dbo.UserRoles (UserId, RoleId)
SELECT u.UserId, @AdminRoleId
FROM dbo.Users u
WHERE (u.Email = N'admin@eiwams.local' OR u.Email IN (SELECT Email FROM @Admins))
  AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = u.UserId AND ur.RoleId = @AdminRoleId);

COMMIT;

SELECT u.UserId, u.DisplayName, u.Email, u.IsActive, u.AllFacilities,
       Roles = (SELECT STRING_AGG(r.RoleName, N', ') FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId)
FROM dbo.Users u
WHERE u.Email = N'admin@eiwams.local' OR u.Email IN (SELECT Email FROM @Admins)
ORDER BY u.UserId;
GO
