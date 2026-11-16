/*=====================================================================
  EIWAMS - 10_SP_Admin.sql
  Users, roles and role permissions, permission catalogue, departments,
  locations, readers and system settings.
  List columns RoleIds/RoleNames/FacilityIds/FacilityNames are
  '|' separated and split into arrays by the API.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*--------------------------------- Users ----------------------------*/
CREATE OR ALTER VIEW dbo.vw_AdminUsers
AS
SELECT u.UserId, u.DisplayName, u.Email, u.EntraObjectId, u.IsActive, u.AllFacilities,
       (SELECT STRING_AGG(CAST(r.RoleId AS NVARCHAR(10)), N'|') WITHIN GROUP (ORDER BY r.RoleId)
        FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId) AS RoleIds,
       (SELECT STRING_AGG(r.RoleName, N'|') WITHIN GROUP (ORDER BY r.RoleId)
        FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId) AS RoleNames,
       (SELECT STRING_AGG(CAST(l.LocationId AS NVARCHAR(10)), N'|') WITHIN GROUP (ORDER BY l.LocationId)
        FROM dbo.UserFacilityScopes s JOIN dbo.Locations l ON l.LocationId = s.LocationId WHERE s.UserId = u.UserId) AS FacilityIds,
       (SELECT STRING_AGG(l.LocationName, N'|') WITHIN GROUP (ORDER BY l.LocationId)
        FROM dbo.UserFacilityScopes s JOIN dbo.Locations l ON l.LocationId = s.LocationId WHERE s.UserId = u.UserId) AS FacilityNames,
       e.EmployeeId, e.EmployeeNumber, u.LastLoginAtUtc
FROM dbo.Users u
LEFT JOIN dbo.Employees e ON e.UserId = u.UserId;
GO

CREATE OR ALTER PROCEDURE dbo.usp_AdminUser_Search
    @ActorUserId INT,
    @Search      NVARCHAR(200) = NULL,
    @IsActive    BIT = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    SELECT COUNT(*) AS TotalCount FROM dbo.vw_AdminUsers u
    WHERE (@IsActive IS NULL OR u.IsActive = @IsActive)
      AND (@Search IS NULL OR u.DisplayName LIKE N'%' + @Search + N'%' OR u.Email LIKE N'%' + @Search + N'%' OR u.EmployeeNumber LIKE N'%' + @Search + N'%');

    SELECT u.UserId, u.DisplayName, u.Email, u.EntraObjectId, u.IsActive, u.AllFacilities, u.RoleIds, u.RoleNames, u.FacilityIds, u.FacilityNames,
           u.EmployeeId, u.EmployeeNumber, u.LastLoginAtUtc
    FROM dbo.vw_AdminUsers u
    WHERE (@IsActive IS NULL OR u.IsActive = @IsActive)
      AND (@Search IS NULL OR u.DisplayName LIKE N'%' + @Search + N'%' OR u.Email LIKE N'%' + @Search + N'%' OR u.EmployeeNumber LIKE N'%' + @Search + N'%')
    ORDER BY u.DisplayName, u.UserId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- @RoleIds and @FacilityIds are JSON arrays of integers, e.g. '[1,3]'. @UserId NULL creates a user.
CREATE OR ALTER PROCEDURE dbo.usp_AdminUser_Save
    @ActorUserId   INT,
    @UserId        INT = NULL,
    @DisplayName   NVARCHAR(150),
    @Email         NVARCHAR(256),
    @EntraObjectId UNIQUEIDENTIFIER = NULL,
    @IsActive      BIT,
    @AllFacilities BIT,
    @RoleIds       NVARCHAR(MAX) = N'[]',
    @FacilityIds   NVARCHAR(MAX) = N'[]',
    @EmployeeId    INT = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @DisplayName = NULLIF(LTRIM(RTRIM(@DisplayName)), N'');
        SET @Email = LOWER(NULLIF(LTRIM(RTRIM(@Email)), N''));
        IF @DisplayName IS NULL OR @Email IS NULL THROW 50400, N'Display name and email are required.', 1;
        IF ISJSON(ISNULL(@RoleIds, N'[]')) = 0 OR ISJSON(ISNULL(@FacilityIds, N'[]')) = 0 THROW 50400, N'roleIds and facilityIds must be arrays.', 1;

        DECLARE @Roles TABLE (RoleId INT PRIMARY KEY);
        INSERT @Roles SELECT DISTINCT TRY_CAST(value AS INT) FROM OPENJSON(ISNULL(@RoleIds, N'[]')) WHERE TRY_CAST(value AS INT) IS NOT NULL;
        DECLARE @Facilities TABLE (LocationId INT PRIMARY KEY);
        INSERT @Facilities SELECT DISTINCT TRY_CAST(value AS INT) FROM OPENJSON(ISNULL(@FacilityIds, N'[]')) WHERE TRY_CAST(value AS INT) IS NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM @Roles) THROW 50400, N'At least one role is required.', 1;
        IF EXISTS (SELECT 1 FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = x.RoleId)) THROW 50400, N'One or more roles do not exist.', 1;
        IF EXISTS (SELECT 1 FROM @Facilities x WHERE NOT EXISTS (SELECT 1 FROM dbo.Locations l WHERE l.LocationId = x.LocationId))
            THROW 50400, N'One or more facilities do not exist.', 1;
        IF @UserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId) THROW 50404, N'User not found.', 1;
        IF @UserId = @ActorUserId AND @IsActive = 0 THROW 50422, N'You cannot deactivate your own account.', 1;
        IF @UserId = @ActorUserId AND dbo.fn_UserHasRole(@ActorUserId, N'SystemAdmin') = 1
           AND NOT EXISTS (SELECT 1 FROM @Roles x JOIN dbo.Roles r ON r.RoleId = x.RoleId WHERE r.RoleName = N'SystemAdmin')
            THROW 50422, N'You cannot remove your own SystemAdmin role.', 1;
        -- Wave 3: every user is an employee. Users are created at sign-in (or from Employees & roles), never here.
        IF @UserId IS NULL THROW 50422, N'Users cannot be created without an employee. Users are created automatically at first sign-in; manage them in Employees & roles.', 1;
        IF @EmployeeId IS NULL SELECT @EmployeeId = EmployeeId FROM dbo.Employees WHERE UserId = @UserId;
        IF @EmployeeId IS NULL THROW 50422, N'The user has no linked employee and cannot be saved.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @EmployeeId) THROW 50400, N'The employee does not exist.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email AND UserId <> ISNULL(@UserId, -1))
            THROW 50409, N'A user with this email already exists.', 1;
        IF @EntraObjectId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Users WHERE EntraObjectId = @EntraObjectId AND UserId <> ISNULL(@UserId, -1))
            THROW 50409, N'Another user is already linked to this Entra object id.', 1;
        IF @EmployeeId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @EmployeeId AND UserId IS NOT NULL AND UserId <> ISNULL(@UserId, -1))
            THROW 50409, N'The employee is already linked to another user.', 1;

        DECLARE @Before NVARCHAR(MAX), @Action NVARCHAR(100);
        IF @UserId IS NULL
        BEGIN
            INSERT dbo.Users (DisplayName, Email, EntraObjectId, IsActive, AllFacilities) VALUES (@DisplayName, @Email, @EntraObjectId, @IsActive, @AllFacilities);
            SET @UserId = SCOPE_IDENTITY();
            SET @Action = N'User.Created';
        END
        ELSE
        BEGIN
            SET @Before = (SELECT DisplayName, Email, EntraObjectId, IsActive, AllFacilities, RoleNames, FacilityNames, EmployeeNumber
                           FROM dbo.vw_AdminUsers WHERE UserId = @UserId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            UPDATE dbo.Users SET DisplayName = @DisplayName, Email = @Email, EntraObjectId = @EntraObjectId, IsActive = @IsActive,
                   AllFacilities = @AllFacilities, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE UserId = @UserId;
            SET @Action = N'User.Updated';
        END

        DELETE dbo.UserRoles WHERE UserId = @UserId AND RoleId NOT IN (SELECT RoleId FROM @Roles);
        INSERT dbo.UserRoles (UserId, RoleId) SELECT @UserId, x.RoleId FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = @UserId AND ur.RoleId = x.RoleId);
        DELETE dbo.UserFacilityScopes WHERE UserId = @UserId AND LocationId NOT IN (SELECT LocationId FROM @Facilities);
        INSERT dbo.UserFacilityScopes (UserId, LocationId) SELECT @UserId, x.LocationId FROM @Facilities x
        WHERE NOT EXISTS (SELECT 1 FROM dbo.UserFacilityScopes s WHERE s.UserId = @UserId AND s.LocationId = x.LocationId);

        UPDATE dbo.Employees SET UserId = NULL, UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId AND EmployeeId <> ISNULL(@EmployeeId, -1);
        IF @EmployeeId IS NOT NULL
            UPDATE dbo.Employees SET UserId = @UserId, UpdatedAtUtc = SYSUTCDATETIME() WHERE EmployeeId = @EmployeeId AND ISNULL(UserId, -1) <> @UserId;

        DECLARE @After NVARCHAR(MAX) = (SELECT DisplayName, Email, EntraObjectId, IsActive, AllFacilities, RoleNames, FacilityNames, EmployeeNumber
                                        FROM dbo.vw_AdminUsers WHERE UserId = @UserId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'User ', @DisplayName, N' (', @Email, N') ', CASE WHEN @Action = N'User.Created' THEN N'created' ELSE N'updated' END, N'.');
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'User', @UserId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;

        SELECT u.UserId, u.DisplayName, u.Email, u.EntraObjectId, u.IsActive, u.AllFacilities, u.RoleIds, u.RoleNames, u.FacilityIds, u.FacilityNames,
               u.EmployeeId, u.EmployeeNumber, u.LastLoginAtUtc
        FROM dbo.vw_AdminUsers u WHERE u.UserId = @UserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------- Employees & roles ------------------------*/
-- Display label of a role (wave 3 simplified roles).
CREATE OR ALTER FUNCTION dbo.fn_RoleLabel (@RoleName NVARCHAR(50))
RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN CASE @RoleName
        WHEN N'HRAdmin' THEN N'HR'
        WHEN N'SecurityHead' THEN N'Security Head'
        WHEN N'SecurityTeam' THEN N'Security'
        WHEN N'IdCardTeam' THEN N'ID Card Team'
        WHEN N'AccessControlTeam' THEN N'Access Control'
        WHEN N'SystemAdmin' THEN N'System Admin'
        ELSE @RoleName END;
END
GO

-- One row per employee with its sign-in account (if any), roles and facility scope.
CREATE OR ALTER VIEW dbo.vw_AdminEmployees
AS
SELECT e.EmployeeId, e.EmployeeNumber, CONCAT(e.FirstName, CASE WHEN e.LastName = N'' THEN N'' ELSE N' ' END, e.LastName) AS FullName,
       e.WorkEmail, e.Designation, e.DepartmentId, d.DepartmentName, e.ManagerEmployeeId,
       CONCAT(m.FirstName, CASE WHEN ISNULL(m.LastName, N'') = N'' THEN N'' ELSE N' ' END, m.LastName) AS ManagerName,
       e.LocationId, l.LocationName, e.EmploymentStatus,
       u.UserId, ISNULL(u.IsActive, CAST(0 AS BIT)) AS IsActive, ISNULL(u.AllFacilities, CAST(0 AS BIT)) AS AllFacilities,
       a.RoleIds, a.RoleNames, a.FacilityIds, a.FacilityNames, u.LastLoginAtUtc
FROM dbo.Employees e
LEFT JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
LEFT JOIN dbo.Locations l ON l.LocationId = e.LocationId
LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
LEFT JOIN dbo.Users u ON u.UserId = e.UserId
LEFT JOIN dbo.vw_AdminUsers a ON a.UserId = e.UserId;
GO

CREATE OR ALTER PROCEDURE dbo.usp_AdminEmployee_Search
    @ActorUserId INT,
    @Search      NVARCHAR(200) = NULL,
    @IsActive    BIT = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    SELECT COUNT(*) AS TotalCount FROM dbo.vw_AdminEmployees x
    WHERE (@IsActive IS NULL OR x.IsActive = @IsActive)
      AND (@Search IS NULL OR x.FullName LIKE N'%' + @Search + N'%' OR x.WorkEmail LIKE N'%' + @Search + N'%' OR x.EmployeeNumber LIKE N'%' + @Search + N'%');

    SELECT x.EmployeeId, x.EmployeeNumber, x.FullName, x.WorkEmail, x.Designation, x.DepartmentId, x.DepartmentName, x.ManagerEmployeeId,
           NULLIF(x.ManagerName, N'') AS ManagerName, x.LocationId, x.LocationName, x.EmploymentStatus, x.UserId, x.IsActive, x.AllFacilities,
           x.RoleIds, x.RoleNames, x.FacilityIds, x.FacilityNames, x.LastLoginAtUtc
    FROM dbo.vw_AdminEmployees x
    WHERE (@IsActive IS NULL OR x.IsActive = @IsActive)
      AND (@Search IS NULL OR x.FullName LIKE N'%' + @Search + N'%' OR x.WorkEmail LIKE N'%' + @Search + N'%' OR x.EmployeeNumber LIKE N'%' + @Search + N'%')
    ORDER BY x.FullName, x.EmployeeId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- Edits an employee's organisation data and its account (roles, active flag, facility scope). Creates the account
-- (linked at first sign-in by email) when the employee has none. The Employee role is always kept.
-- @RoleIds and @FacilityIds are JSON arrays of integers.
CREATE OR ALTER PROCEDURE dbo.usp_AdminEmployee_Save
    @ActorUserId       INT,
    @EmployeeId        INT,
    @RoleIds           NVARCHAR(MAX) = N'[]',
    @ManagerEmployeeId INT = NULL,
    @DepartmentId      INT = NULL,
    @LocationId        INT = NULL,
    @Designation       NVARCHAR(100) = NULL,
    @IsActive          BIT = 1,
    @AllFacilities     BIT = 0,
    @FacilityIds       NVARCHAR(MAX) = N'[]',
    @CorrelationId     UNIQUEIDENTIFIER = NULL,
    @IpAddress         VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Designation = NULLIF(LTRIM(RTRIM(@Designation)), N'');
        IF ISJSON(ISNULL(@RoleIds, N'[]')) = 0 OR ISJSON(ISNULL(@FacilityIds, N'[]')) = 0 THROW 50400, N'roleIds and facilityIds must be arrays.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @EmployeeId) THROW 50404, N'Employee not found.', 1;

        DECLARE @Roles TABLE (RoleId INT PRIMARY KEY);
        INSERT @Roles SELECT DISTINCT TRY_CAST(value AS INT) FROM OPENJSON(ISNULL(@RoleIds, N'[]')) WHERE TRY_CAST(value AS INT) IS NOT NULL;
        DECLARE @Facilities TABLE (LocationId INT PRIMARY KEY);
        INSERT @Facilities SELECT DISTINCT TRY_CAST(value AS INT) FROM OPENJSON(ISNULL(@FacilityIds, N'[]')) WHERE TRY_CAST(value AS INT) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = x.RoleId)) THROW 50400, N'One or more roles do not exist.', 1;
        IF EXISTS (SELECT 1 FROM @Facilities x WHERE NOT EXISTS (SELECT 1 FROM dbo.Locations l WHERE l.LocationId = x.LocationId))
            THROW 50400, N'One or more facilities do not exist.', 1;
        INSERT @Roles SELECT r.RoleId FROM dbo.Roles r WHERE r.RoleName = N'Employee' AND NOT EXISTS (SELECT 1 FROM @Roles x WHERE x.RoleId = r.RoleId);

        DECLARE @UserId INT, @Email NVARCHAR(256), @Name NVARCHAR(150), @Status NVARCHAR(20);
        SELECT @UserId = e.UserId, @Email = LOWER(LTRIM(RTRIM(e.WorkEmail))),
               @Name = CONCAT(e.FirstName, CASE WHEN e.LastName = N'' THEN N'' ELSE N' ' END, e.LastName), @Status = e.EmploymentStatus
        FROM dbo.Employees e WHERE e.EmployeeId = @EmployeeId;
        IF @UserId = @ActorUserId AND @IsActive = 0 THROW 50422, N'You cannot deactivate your own account.', 1;
        IF @UserId = @ActorUserId AND dbo.fn_UserHasRole(@ActorUserId, N'SystemAdmin') = 1
           AND NOT EXISTS (SELECT 1 FROM @Roles x JOIN dbo.Roles r ON r.RoleId = x.RoleId WHERE r.RoleName = N'SystemAdmin')
            THROW 50422, N'You cannot remove your own SystemAdmin role.', 1;
        EXEC dbo.usp_Internal_ValidateEmployeeRefs @ActorUserId, @EmployeeId, @DepartmentId, @ManagerEmployeeId, @LocationId;

        BEGIN TRAN;
        DECLARE @Before NVARCHAR(MAX) = (SELECT EmployeeNumber, FullName, Designation, DepartmentName, ManagerName, LocationName, IsActive, AllFacilities, RoleNames, FacilityNames
                                         FROM dbo.vw_AdminEmployees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

        UPDATE dbo.Employees SET ManagerEmployeeId = @ManagerEmployeeId, DepartmentId = @DepartmentId, LocationId = @LocationId,
               Designation = @Designation, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        WHERE EmployeeId = @EmployeeId;

        IF @UserId IS NULL
        BEGIN
            IF @Email IS NULL OR @Email = N'' THROW 50422, N'The employee has no work email, so no account can be created.', 1;
            SELECT @UserId = UserId FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email;
            IF @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Employees WHERE UserId = @UserId)
                THROW 50409, N'Another employee is already linked to the account with this email.', 1;
            IF @UserId IS NULL
            BEGIN
                INSERT dbo.Users (DisplayName, Email, IsActive, AllFacilities) VALUES (@Name, @Email, @IsActive, @AllFacilities);
                SET @UserId = SCOPE_IDENTITY();
            END
            UPDATE dbo.Employees SET UserId = @UserId WHERE EmployeeId = @EmployeeId;
        END

        UPDATE dbo.Users SET IsActive = @IsActive, AllFacilities = @AllFacilities, UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
        DELETE dbo.UserRoles WHERE UserId = @UserId AND RoleId NOT IN (SELECT RoleId FROM @Roles);
        INSERT dbo.UserRoles (UserId, RoleId) SELECT @UserId, x.RoleId FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = @UserId AND ur.RoleId = x.RoleId);
        DELETE dbo.UserFacilityScopes WHERE UserId = @UserId AND LocationId NOT IN (SELECT LocationId FROM @Facilities);
        INSERT dbo.UserFacilityScopes (UserId, LocationId) SELECT @UserId, x.LocationId FROM @Facilities x
        WHERE NOT EXISTS (SELECT 1 FROM dbo.UserFacilityScopes s WHERE s.UserId = @UserId AND s.LocationId = x.LocationId);

        DECLARE @After NVARCHAR(MAX) = (SELECT EmployeeNumber, FullName, Designation, DepartmentName, ManagerName, LocationName, IsActive, AllFacilities, RoleNames, FacilityNames
                                        FROM dbo.vw_AdminEmployees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Employee ', @Name, N' roles and organisation updated.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.RolesUpdated', N'Employee', @EmployeeId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;

        SELECT x.EmployeeId, x.EmployeeNumber, x.FullName, x.WorkEmail, x.Designation, x.DepartmentId, x.DepartmentName, x.ManagerEmployeeId,
               NULLIF(x.ManagerName, N'') AS ManagerName, x.LocationId, x.LocationName, x.EmploymentStatus, x.UserId, x.IsActive, x.AllFacilities,
               x.RoleIds, x.RoleNames, x.FacilityIds, x.FacilityNames, x.LastLoginAtUtc
        FROM dbo.vw_AdminEmployees x WHERE x.EmployeeId = @EmployeeId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------- Roles and permissions --------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Role_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.RoleId, r.RoleName, dbo.fn_RoleLabel(r.RoleName) AS Label, r.Description, r.IsSystem,
           (SELECT COUNT(*) FROM dbo.UserRoles ur JOIN dbo.Users u ON u.UserId = ur.UserId WHERE ur.RoleId = r.RoleId AND u.IsActive = 1) AS UserCount,
           (SELECT COUNT(*) FROM dbo.RolePermissions rp WHERE rp.RoleId = r.RoleId) AS PermissionCount
    FROM dbo.Roles r ORDER BY r.RoleId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Role_GetPermissions
    @ActorUserId INT,
    @RoleId      INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleId = @RoleId) THROW 50404, N'Role not found.', 1;
    SELECT p.PermissionId, p.PermissionCode AS Code, p.ModuleName AS Module, p.Description,
           CAST(CASE WHEN rp.RoleId IS NULL THEN 0 ELSE 1 END AS BIT) AS Granted
    FROM dbo.Permissions p
    LEFT JOIN dbo.RolePermissions rp ON rp.PermissionId = p.PermissionId AND rp.RoleId = @RoleId
    ORDER BY p.ModuleName, p.PermissionCode;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Role_SetPermissions
    @ActorUserId   INT,
    @RoleId        INT,
    @PermissionIds NVARCHAR(MAX),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF ISJSON(ISNULL(@PermissionIds, N'')) = 0 THROW 50400, N'permissionIds must be an array.', 1;
        DECLARE @RoleName NVARCHAR(50) = (SELECT RoleName FROM dbo.Roles WHERE RoleId = @RoleId);
        IF @RoleName IS NULL THROW 50404, N'Role not found.', 1;
        IF @RoleName = N'SystemAdmin' THROW 50422, N'The SystemAdmin role always holds every permission and cannot be edited.', 1;
        DECLARE @Ids TABLE (PermissionId INT PRIMARY KEY);
        INSERT @Ids SELECT DISTINCT TRY_CAST(value AS INT) FROM OPENJSON(@PermissionIds) WHERE TRY_CAST(value AS INT) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @Ids x WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionId = x.PermissionId))
            THROW 50400, N'One or more permissions do not exist.', 1;

        BEGIN TRAN;
        DECLARE @Before NVARCHAR(MAX) = (SELECT STRING_AGG(p.PermissionCode, N',') WITHIN GROUP (ORDER BY p.PermissionCode)
                                         FROM dbo.RolePermissions rp JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId WHERE rp.RoleId = @RoleId);
        DELETE dbo.RolePermissions WHERE RoleId = @RoleId AND PermissionId NOT IN (SELECT PermissionId FROM @Ids);
        INSERT dbo.RolePermissions (RoleId, PermissionId) SELECT @RoleId, x.PermissionId FROM @Ids x
        WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = @RoleId AND rp.PermissionId = x.PermissionId);
        DECLARE @After NVARCHAR(MAX) = (SELECT STRING_AGG(p.PermissionCode, N',') WITHIN GROUP (ORDER BY p.PermissionCode)
                                        FROM dbo.RolePermissions rp JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId WHERE rp.RoleId = @RoleId);
        DECLARE @BeforeJson NVARCHAR(MAX) = (SELECT @Before AS permissions FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @AfterJson NVARCHAR(MAX) = (SELECT @After AS permissions FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Permissions of role ', @RoleName, N' updated.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Role.PermissionsUpdated', N'Role', @RoleId, @Summary, @BeforeJson, @AfterJson, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Role_GetPermissions @ActorUserId, @RoleId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Permission_Catalog
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT PermissionId, PermissionCode AS Code, ModuleName AS Module, Description
    FROM dbo.Permissions ORDER BY ModuleName, PermissionCode;
END
GO

/*------------------------------ Departments -------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Department_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DepartmentId, DepartmentCode, DepartmentName, HeadUserId, HeadUserName, IsActive, EmployeeCount
    FROM dbo.vw_Departments ORDER BY DepartmentName;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Department_Save
    @ActorUserId    INT,
    @DepartmentId   INT = NULL,
    @DepartmentCode NVARCHAR(20),
    @DepartmentName NVARCHAR(150),
    @HeadUserId     INT = NULL,
    @IsActive       BIT,
    @CorrelationId  UNIQUEIDENTIFIER = NULL,
    @IpAddress      VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @DepartmentCode = UPPER(NULLIF(LTRIM(RTRIM(@DepartmentCode)), N''));
        SET @DepartmentName = NULLIF(LTRIM(RTRIM(@DepartmentName)), N'');
        IF @DepartmentCode IS NULL OR @DepartmentName IS NULL THROW 50400, N'Department code and name are required.', 1;
        IF @HeadUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @HeadUserId AND IsActive = 1)
            THROW 50400, N'The department head does not exist or is inactive.', 1;
        IF @DepartmentId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentId = @DepartmentId) THROW 50404, N'Department not found.', 1;
        IF @DepartmentId IS NOT NULL AND @IsActive = 0
           AND EXISTS (SELECT 1 FROM dbo.Employees WHERE DepartmentId = @DepartmentId AND EmploymentStatus = N'Active')
            THROW 50422, N'A department with active employees cannot be deactivated.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Departments WITH (UPDLOCK, HOLDLOCK) WHERE DepartmentCode = @DepartmentCode AND DepartmentId <> ISNULL(@DepartmentId, -1))
            THROW 50409, N'A department with this code already exists.', 1;
        DECLARE @Before NVARCHAR(MAX), @Action NVARCHAR(100);
        IF @DepartmentId IS NULL
        BEGIN
            INSERT dbo.Departments (DepartmentCode, DepartmentName, HeadUserId, IsActive) VALUES (@DepartmentCode, @DepartmentName, @HeadUserId, @IsActive);
            SET @DepartmentId = SCOPE_IDENTITY();
            SET @Action = N'Department.Created';
        END
        ELSE
        BEGIN
            SET @Before = (SELECT DepartmentCode, DepartmentName, HeadUserId, IsActive FROM dbo.Departments WHERE DepartmentId = @DepartmentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            UPDATE dbo.Departments SET DepartmentCode = @DepartmentCode, DepartmentName = @DepartmentName, HeadUserId = @HeadUserId, IsActive = @IsActive,
                   UpdatedAtUtc = SYSUTCDATETIME()
            WHERE DepartmentId = @DepartmentId;
            SET @Action = N'Department.Updated';
        END
        DECLARE @After NVARCHAR(MAX) = (SELECT DepartmentCode, DepartmentName, HeadUserId, IsActive FROM dbo.Departments WHERE DepartmentId = @DepartmentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Department ', @DepartmentCode, N' - ', @DepartmentName, N' saved.');
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'Department', @DepartmentId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        SELECT DepartmentId, DepartmentCode, DepartmentName, HeadUserId, HeadUserName, IsActive, EmployeeCount
        FROM dbo.vw_Departments WHERE DepartmentId = @DepartmentId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------------- Locations --------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Location_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LocationId, ParentLocationId, ParentLocationName, LocationCode, LocationName, LocationType, IsRestricted, IsActive, TimeZone, Path, ReaderCount
    FROM dbo.vw_Locations ORDER BY Path;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Location_Save
    @ActorUserId      INT,
    @LocationId       INT = NULL,
    @ParentLocationId INT = NULL,
    @LocationCode     NVARCHAR(30),
    @LocationName     NVARCHAR(150),
    @LocationType     NVARCHAR(20),
    @IsRestricted     BIT,
    @IsActive         BIT,
    @TimeZone         NVARCHAR(64) = NULL,
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @LocationCode = UPPER(NULLIF(LTRIM(RTRIM(@LocationCode)), N''));
        SET @LocationName = NULLIF(LTRIM(RTRIM(@LocationName)), N'');
        SET @TimeZone = ISNULL(NULLIF(LTRIM(RTRIM(@TimeZone)), N''), N'India Standard Time');
        IF @LocationCode IS NULL OR @LocationName IS NULL THROW 50400, N'Location code and name are required.', 1;
        IF @LocationType NOT IN (N'Campus', N'Building', N'Floor', N'Wing', N'Zone') THROW 50400, N'locationType must be Campus, Building, Floor, Wing or Zone.', 1;
        IF @LocationType = N'Campus' AND @ParentLocationId IS NOT NULL THROW 50400, N'A campus cannot have a parent location.', 1;
        IF @LocationType <> N'Campus' AND @ParentLocationId IS NULL THROW 50400, N'A parent location is required.', 1;
        IF @LocationId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @LocationId) THROW 50404, N'Location not found.', 1;
        IF @ParentLocationId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @ParentLocationId)
            THROW 50400, N'The parent location does not exist.', 1;
        IF @LocationId IS NOT NULL AND @ParentLocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId))
            THROW 50400, N'A location cannot be moved under itself or one of its descendants.', 1;
        IF (@ParentLocationId IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @ActorUserId AND AllFacilities = 1))
           OR (@ParentLocationId IS NOT NULL AND dbo.fn_UserCanAccessLocation(@ActorUserId, @ParentLocationId) = 0)
           OR (@LocationId IS NOT NULL AND dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0)
            THROW 50403, N'The location is outside your facility scope.', 1;
        IF @LocationId IS NOT NULL AND @IsActive = 0
           AND EXISTS (SELECT 1 FROM dbo.Locations WHERE ParentLocationId = @LocationId AND IsActive = 1)
            THROW 50422, N'Deactivate child locations first.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Locations WITH (UPDLOCK, HOLDLOCK) WHERE LocationCode = @LocationCode AND LocationId <> ISNULL(@LocationId, -1))
            THROW 50409, N'A location with this code already exists.', 1;
        DECLARE @Before NVARCHAR(MAX), @Action NVARCHAR(100);
        IF @LocationId IS NULL
        BEGIN
            INSERT dbo.Locations (ParentLocationId, LocationCode, LocationName, LocationType, IsRestricted, IsActive, TimeZone)
            VALUES (@ParentLocationId, @LocationCode, @LocationName, @LocationType, @IsRestricted, @IsActive, @TimeZone);
            SET @LocationId = SCOPE_IDENTITY();
            SET @Action = N'Location.Created';
        END
        ELSE
        BEGIN
            SET @Before = (SELECT ParentLocationId, LocationCode, LocationName, LocationType, IsRestricted, IsActive, TimeZone
                           FROM dbo.Locations WHERE LocationId = @LocationId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            UPDATE dbo.Locations SET ParentLocationId = @ParentLocationId, LocationCode = @LocationCode, LocationName = @LocationName,
                   LocationType = @LocationType, IsRestricted = @IsRestricted, IsActive = @IsActive, TimeZone = @TimeZone, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE LocationId = @LocationId;
            SET @Action = N'Location.Updated';
        END
        DECLARE @After NVARCHAR(MAX) = (SELECT ParentLocationId, LocationCode, LocationName, LocationType, IsRestricted, IsActive, TimeZone
                                        FROM dbo.Locations WHERE LocationId = @LocationId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(@LocationType, N' ', @LocationCode, N' - ', @LocationName, N' saved.');
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'Location', @LocationId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        SELECT LocationId, ParentLocationId, ParentLocationName, LocationCode, LocationName, LocationType, IsRestricted, IsActive, TimeZone, Path, ReaderCount
        FROM dbo.vw_Locations WHERE LocationId = @LocationId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*-------------------------------- Readers ---------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Reader_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.ReaderId, r.ReaderName, r.LocationId, r.LocationName, r.Direction, r.IsActive, r.LastSeenAtUtc
    FROM dbo.vw_Readers r JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = r.LocationId
    ORDER BY r.ReaderId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Reader_Save
    @ActorUserId   INT,
    @IsNew         BIT,
    @ReaderId      NVARCHAR(80),
    @ReaderName    NVARCHAR(150),
    @LocationId    INT,
    @Direction     NVARCHAR(10),
    @IsActive      BIT,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @ReaderId = UPPER(NULLIF(LTRIM(RTRIM(@ReaderId)), N''));
        SET @ReaderName = NULLIF(LTRIM(RTRIM(@ReaderName)), N'');
        IF @ReaderId IS NULL OR @ReaderName IS NULL THROW 50400, N'Reader id and name are required.', 1;
        IF @Direction NOT IN (N'In', N'Out', N'Both') THROW 50400, N'direction must be In, Out or Both.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @LocationId) THROW 50400, N'The location does not exist.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0 THROW 50403, N'The location is outside your facility scope.', 1;
        DECLARE @OldLoc INT = (SELECT LocationId FROM dbo.Readers WHERE ReaderId = @ReaderId);
        IF @IsNew = 0 AND @OldLoc IS NULL THROW 50404, N'Reader not found.', 1;
        IF @IsNew = 0 AND dbo.fn_UserCanAccessLocation(@ActorUserId, @OldLoc) = 0 THROW 50404, N'Reader not found.', 1;

        BEGIN TRAN;
        DECLARE @Before NVARCHAR(MAX), @Action NVARCHAR(100);
        IF @IsNew = 1
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Readers WITH (UPDLOCK, HOLDLOCK) WHERE ReaderId = @ReaderId) THROW 50409, N'A reader with this id already exists.', 1;
            INSERT dbo.Readers (ReaderId, ReaderName, LocationId, Direction, IsActive) VALUES (@ReaderId, @ReaderName, @LocationId, @Direction, @IsActive);
            SET @Action = N'Reader.Created';
        END
        ELSE
        BEGIN
            SET @Before = (SELECT ReaderName, LocationId, Direction, IsActive FROM dbo.Readers WHERE ReaderId = @ReaderId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            UPDATE dbo.Readers SET ReaderName = @ReaderName, LocationId = @LocationId, Direction = @Direction, IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE ReaderId = @ReaderId;
            SET @Action = N'Reader.Updated';
        END
        DECLARE @After NVARCHAR(MAX) = (SELECT ReaderName, LocationId, Direction, IsActive FROM dbo.Readers WHERE ReaderId = @ReaderId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Reader ', @ReaderId, N' saved.');
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'Reader', @ReaderId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        SELECT r.ReaderId, r.ReaderName, r.LocationId, r.LocationName, r.Direction, r.IsActive, r.LastSeenAtUtc FROM dbo.vw_Readers r WHERE r.ReaderId = @ReaderId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------------- Settings ---------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Setting_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SettingKey, SettingValue, Description, DataType FROM dbo.SystemSettings ORDER BY SettingKey;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Setting_Update
    @ActorUserId   INT,
    @SettingKey    NVARCHAR(100),
    @SettingValue  NVARCHAR(1000),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @SettingValue = LTRIM(RTRIM(@SettingValue));
        DECLARE @Type NVARCHAR(20), @Old NVARCHAR(1000);
        SELECT @Type = DataType, @Old = SettingValue FROM dbo.SystemSettings WHERE SettingKey = @SettingKey;
        IF @Type IS NULL THROW 50404, N'Setting not found.', 1;
        IF @SettingValue IS NULL THROW 50400, N'A value is required.', 1;
        IF @Type = N'Int' AND (TRY_CAST(@SettingValue AS INT) IS NULL OR TRY_CAST(@SettingValue AS INT) < 0)
            THROW 50400, N'The value must be a non-negative whole number.', 1;
        IF @Type = N'Bool'
        BEGIN
            IF LOWER(@SettingValue) NOT IN (N'true', N'false') THROW 50400, N'The value must be true or false.', 1;
            SET @SettingValue = LOWER(@SettingValue);
        END
        BEGIN TRAN;
        UPDATE dbo.SystemSettings SET SettingValue = @SettingValue, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId WHERE SettingKey = @SettingKey;
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Old AS settingValue FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT @SettingValue AS settingValue FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Setting ', @SettingKey, N' changed.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Setting.Updated', N'SystemSetting', @SettingKey, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Setting_List @ActorUserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------- Wave 3 backfill: every user is an employee ----*/
EXEC dbo.usp_Internal_BackfillUserEmployees;
GO
