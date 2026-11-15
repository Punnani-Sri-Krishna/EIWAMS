/*=====================================================================
  EIWAMS - 03_SP_Common.sql
  Audit/notification helpers, simulated controller sync, identity,
  menus, lookups and notification inbox procedures.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*------------------------------ Helpers -----------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Audit_Write
    @ActorUserId   INT,
    @Action        NVARCHAR(100),
    @EntityType    NVARCHAR(60),
    @EntityId      NVARCHAR(60),
    @Summary       NVARCHAR(500),
    @BeforeJson    NVARCHAR(MAX) = NULL,
    @AfterJson     NVARCHAR(MAX) = NULL,
    @Reason        NVARCHAR(1000) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.AuditLogs (ActorUserId, Action, EntityType, EntityId, Summary, BeforeJson, AfterJson, Reason, CorrelationId, IpAddress)
    VALUES (@ActorUserId, @Action, @EntityType, @EntityId, LEFT(@Summary, 500), @BeforeJson, @AfterJson, LEFT(@Reason, 1000), @CorrelationId, LEFT(@IpAddress, 45));
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Notification_Create
    @UserId            INT,
    @Type              NVARCHAR(50),
    @Title             NVARCHAR(200),
    @Message           NVARCHAR(1000),
    @RelatedEntityType NVARCHAR(60) = NULL,
    @RelatedEntityId   NVARCHAR(60) = NULL,
    @Route             NVARCHAR(200) = NULL,
    @ExcludeUserId     INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @UserId IS NULL OR @UserId = ISNULL(@ExcludeUserId, -1) RETURN;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND IsActive = 1) RETURN;
    INSERT dbo.Notifications (UserId, Type, Title, Message, RelatedEntityType, RelatedEntityId, Route)
    VALUES (@UserId, @Type, LEFT(@Title, 200), LEFT(@Message, 1000), @RelatedEntityType, @RelatedEntityId, @Route);
END
GO

-- Notifies every active member of a role whose facility scope covers @LocationId (any scope when NULL).
CREATE OR ALTER PROCEDURE dbo.usp_Notification_CreateForRole
    @RoleName          NVARCHAR(50),
    @LocationId        INT = NULL,
    @Type              NVARCHAR(50),
    @Title             NVARCHAR(200),
    @Message           NVARCHAR(1000),
    @RelatedEntityType NVARCHAR(60) = NULL,
    @RelatedEntityId   NVARCHAR(60) = NULL,
    @Route             NVARCHAR(200) = NULL,
    @ExcludeUserId     INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.Notifications (UserId, Type, Title, Message, RelatedEntityType, RelatedEntityId, Route)
    SELECT DISTINCT u.UserId, @Type, LEFT(@Title, 200), LEFT(@Message, 1000), @RelatedEntityType, @RelatedEntityId, @Route
    FROM dbo.Users u
    JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
    JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.RoleName = @RoleName
    WHERE u.IsActive = 1
      AND u.UserId <> ISNULL(@ExcludeUserId, -1)
      AND (@LocationId IS NULL OR dbo.fn_UserCanAccessLocation(u.UserId, @LocationId) = 1);
END
GO

CREATE OR ALTER FUNCTION dbo.fn_SettingInt (@Key NVARCHAR(100), @Default INT)
RETURNS INT
AS
BEGIN
    RETURN ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.SystemSettings WHERE SettingKey = @Key), @Default);
END
GO

CREATE OR ALTER FUNCTION dbo.fn_SettingBool (@Key NVARCHAR(100), @Default BIT)
RETURNS BIT
AS
BEGIN
    RETURN ISNULL((SELECT CASE LOWER(SettingValue) WHEN N'true' THEN 1 WHEN N'1' THEN 1 WHEN N'false' THEN 0 WHEN N'0' THEN 0 END
                   FROM dbo.SystemSettings WHERE SettingKey = @Key), @Default);
END
GO

-- Simulated access-controller sync. Records the command; Synced immediately unless Controller.SimulateOffline is true.
CREATE OR ALTER PROCEDURE dbo.usp_Internal_ControllerCommand
    @CommandType   NVARCHAR(40),
    @EntityType    NVARCHAR(60),
    @EntityId      NVARCHAR(60),
    @LocationId    INT = NULL,
    @PayloadJson   NVARCHAR(MAX) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @SyncStatus    NVARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @SyncStatus = CASE WHEN dbo.fn_SettingBool(N'Controller.SimulateOffline', 0) = 1 THEN N'Pending' ELSE N'Synced' END;
    INSERT dbo.ControllerCommands (CommandType, EntityType, EntityId, LocationId, PayloadJson, Status, SyncedAtUtc, CorrelationId)
    VALUES (@CommandType, @EntityType, @EntityId, @LocationId, @PayloadJson, @SyncStatus,
            CASE WHEN @SyncStatus = N'Synced' THEN SYSUTCDATETIME() END, @CorrelationId);
END
GO

/*------------------------------ Identity ----------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_User_GetContext
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET LastLoginAtUtc = SYSUTCDATETIME()
    WHERE UserId = @UserId AND IsActive = 1
      AND (LastLoginAtUtc IS NULL OR LastLoginAtUtc < DATEADD(MINUTE, -5, SYSUTCDATETIME()));

    SELECT u.UserId, u.DisplayName, u.Email, u.IsActive, u.AllFacilities, e.EmployeeId, e.EmployeeNumber
    FROM dbo.Users u
    LEFT JOIN dbo.Employees e ON e.UserId = u.UserId
    WHERE u.UserId = @UserId;

    SELECT r.RoleName FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = @UserId ORDER BY r.RoleName;

    SELECT PermissionCode FROM dbo.fn_UserPermissions(@UserId) ORDER BY PermissionCode;

    SELECT LocationId FROM dbo.UserFacilityScopes WHERE UserId = @UserId ORDER BY LocationId;
END
GO

-- Resolves an Entra principal to an EIWAMS user: by object id, else by email (first sign-in links the object id).
CREATE OR ALTER PROCEDURE dbo.usp_User_ResolveEntra
    @TenantId    UNIQUEIDENTIFIER,
    @ObjectId    UNIQUEIDENTIFIER,
    @Email       NVARCHAR(256) = NULL,
    @DisplayName NVARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @UserId INT = (SELECT UserId FROM dbo.Users WHERE EntraObjectId = @ObjectId);
    IF @UserId IS NULL AND NULLIF(LTRIM(RTRIM(@Email)), N'') IS NOT NULL
    BEGIN
        SELECT @UserId = UserId FROM dbo.Users WHERE Email = @Email AND EntraObjectId IS NULL;
        IF @UserId IS NOT NULL
        BEGIN
            UPDATE dbo.Users SET EntraObjectId = @ObjectId, EntraTenantId = @TenantId, UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
            EXEC dbo.usp_Audit_Write @UserId, N'User.EntraLinked', N'User', @UserId, N'Entra identity linked on first sign-in.';
        END
    END
    SELECT UserId, IsActive FROM dbo.Users WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_ListForSwitch
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.UserId, u.DisplayName, u.Email,
           (SELECT STRING_AGG(r.RoleName, N',') WITHIN GROUP (ORDER BY r.RoleName)
            FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId) AS Roles
    FROM dbo.Users u
    WHERE u.IsActive = 1
    ORDER BY u.UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Menu_GetForUser
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT m.MenuId, m.Section, m.SectionOrder, m.Label, m.Icon, m.Route, m.SortOrder
    FROM dbo.Menus m
    WHERE m.IsActive = 1
      AND EXISTS (SELECT 1 FROM dbo.MenuPermissions mp
                  JOIN dbo.Permissions p ON p.PermissionId = mp.PermissionId
                  JOIN dbo.fn_UserPermissions(@ActorUserId) up ON up.PermissionCode = p.PermissionCode
                  WHERE mp.MenuId = m.MenuId)
    ORDER BY m.SectionOrder, m.SortOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Lookup_GetAll
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DepartmentId AS Id, DepartmentCode AS Code, DepartmentName AS Name
    FROM dbo.Departments WHERE IsActive = 1 ORDER BY DepartmentName;

    SELECT l.LocationId AS Id, l.LocationCode AS Code, l.LocationName AS Name, l.LocationType, l.ParentLocationId, l.IsRestricted
    FROM dbo.vw_Locations l WHERE l.IsActive = 1 ORDER BY l.Path;

    SELECT e.EmployeeId AS Id, CONCAT(e.FirstName, N' ', e.LastName) AS Name, e.EmployeeNumber
    FROM dbo.Employees e
    JOIN dbo.fn_OperationalEmployees(@ActorUserId) o ON o.EmployeeId = e.EmployeeId
    WHERE e.EmploymentStatus = N'Active'
    ORDER BY e.FirstName, e.LastName;

    SELECT UserId AS Id, DisplayName AS Name FROM dbo.Users WHERE IsActive = 1 ORDER BY DisplayName;

    SELECT ReaderId AS Id, ReaderName AS Name, LocationId FROM dbo.Readers WHERE IsActive = 1 ORDER BY ReaderName;
END
GO

/*---------------------------- Notifications -------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Notification_Search
    @ActorUserId INT,
    @UnreadOnly  BIT = 0,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 SET @Page = 1;
    IF @PageSize NOT BETWEEN 1 AND 100 SET @PageSize = CASE WHEN @PageSize > 100 THEN 100 ELSE 20 END;

    SELECT COUNT(*) AS TotalCount FROM dbo.Notifications
    WHERE UserId = @ActorUserId AND (ISNULL(@UnreadOnly, 0) = 0 OR ReadAtUtc IS NULL);

    SELECT NotificationId, Type, Title, Message, RelatedEntityType, RelatedEntityId, Route, CreatedAtUtc, ReadAtUtc
    FROM dbo.Notifications
    WHERE UserId = @ActorUserId AND (ISNULL(@UnreadOnly, 0) = 0 OR ReadAtUtc IS NULL)
    ORDER BY CreatedAtUtc DESC, NotificationId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Notification_UnreadCount
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS Count FROM dbo.Notifications WHERE UserId = @ActorUserId AND ReadAtUtc IS NULL;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Notification_MarkRead
    @ActorUserId    INT,
    @NotificationId BIGINT,
    @CorrelationId  UNIQUEIDENTIFIER = NULL,
    @IpAddress      VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Notifications WHERE NotificationId = @NotificationId AND UserId = @ActorUserId)
        THROW 50404, N'Notification not found.', 1;
    UPDATE dbo.Notifications SET ReadAtUtc = SYSUTCDATETIME()
    WHERE NotificationId = @NotificationId AND UserId = @ActorUserId AND ReadAtUtc IS NULL;
    SELECT CAST(1 AS BIT) AS Result;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Notification_MarkAllRead
    @ActorUserId   INT,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Notifications SET ReadAtUtc = SYSUTCDATETIME() WHERE UserId = @ActorUserId AND ReadAtUtc IS NULL;
    SELECT @@ROWCOUNT AS Count;
END
GO
