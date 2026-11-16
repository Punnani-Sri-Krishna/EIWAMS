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

    SELECT u.UserId, u.DisplayName, u.Email, u.IsActive, u.AllFacilities, e.EmployeeId, e.EmployeeNumber,
           e.Designation, d.DepartmentName,
           CASE WHEN m.EmployeeId IS NULL THEN NULL ELSE CONCAT(m.FirstName, N' ', m.LastName) END AS ManagerName,
           m.WorkEmail AS ManagerEmail, l.LocationName,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.EmployeePhotos ph WHERE ph.EmployeeId = e.EmployeeId) THEN 1 ELSE 0 END AS BIT) AS HasPhoto
    FROM dbo.Users u
    LEFT JOIN dbo.Employees e ON e.UserId = u.UserId
    LEFT JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    LEFT JOIN dbo.Locations l ON l.LocationId = e.LocationId
    LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
    WHERE u.UserId = @UserId;

    SELECT r.RoleName FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = @UserId ORDER BY r.RoleName;

    SELECT PermissionCode FROM dbo.fn_UserPermissions(@UserId) ORDER BY PermissionCode;

    SELECT LocationId FROM dbo.UserFacilityScopes WHERE UserId = @UserId ORDER BY LocationId;
END
GO

-- Automatic role grants (contract §4): Employee for users linked to an Active employee, Manager when the employee has
-- at least one Active direct report. Roles are only ever added, never removed.
CREATE OR ALTER PROCEDURE dbo.usp_Internal_GrantAutoRoles
    @UserId INT = NULL   -- NULL = every linked user
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.UserRoles (UserId, RoleId)
    SELECT DISTINCT e.UserId, r.RoleId
    FROM dbo.Employees e
    JOIN dbo.Roles r ON r.RoleName = N'Employee'
    WHERE e.UserId IS NOT NULL AND e.EmploymentStatus = N'Active' AND (@UserId IS NULL OR e.UserId = @UserId)
      AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles x WHERE x.UserId = e.UserId AND x.RoleId = r.RoleId);

    INSERT dbo.UserRoles (UserId, RoleId)
    SELECT DISTINCT e.UserId, r.RoleId
    FROM dbo.Employees e
    JOIN dbo.Roles r ON r.RoleName = N'Manager'
    WHERE e.UserId IS NOT NULL AND e.EmploymentStatus = N'Active' AND (@UserId IS NULL OR e.UserId = @UserId)
      AND EXISTS (SELECT 1 FROM dbo.Employees s WHERE s.ManagerEmployeeId = e.EmployeeId AND s.EmploymentStatus = N'Active')
      AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles x WHERE x.UserId = e.UserId AND x.RoleId = r.RoleId);
END
GO

-- Resolves an Entra principal to an EIWAMS user: by object id, else by email (first sign-in links the object id),
-- else JIT-provisions a user for an Active employee whose WorkEmail matches.
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
    DECLARE @CleanEmail NVARCHAR(256) = NULLIF(LTRIM(RTRIM(@Email)), N'');
    IF @UserId IS NULL AND @CleanEmail IS NOT NULL
    BEGIN
        SELECT @UserId = UserId FROM dbo.Users WHERE Email = @CleanEmail AND EntraObjectId IS NULL;
        IF @UserId IS NOT NULL
        BEGIN
            UPDATE dbo.Users SET EntraObjectId = @ObjectId, EntraTenantId = @TenantId, UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
            EXEC dbo.usp_Audit_Write @UserId, N'User.EntraLinked', N'User', @UserId, N'Entra identity linked on first sign-in.';
        END
    END

    -- JIT provisioning (contract §5.5).
    IF @UserId IS NULL AND @CleanEmail IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @CleanEmail)
    BEGIN
        DECLARE @EmployeeId INT, @Name NVARCHAR(150);
        SELECT TOP (1) @EmployeeId = e.EmployeeId, @Name = CONCAT(e.FirstName, N' ', e.LastName)
        FROM dbo.Employees e
        WHERE e.WorkEmail = @CleanEmail AND e.EmploymentStatus = N'Active' AND e.UserId IS NULL
        ORDER BY e.EmployeeId;

        IF @EmployeeId IS NOT NULL
        BEGIN
            BEGIN TRY
                BEGIN TRAN;
                INSERT dbo.Users (DisplayName, Email, EntraTenantId, EntraObjectId, IsActive, AllFacilities)
                VALUES (LEFT(ISNULL(NULLIF(LTRIM(RTRIM(@DisplayName)), N''), @Name), 150), @CleanEmail, @TenantId, @ObjectId, 1, 0);
                SET @UserId = SCOPE_IDENTITY();
                UPDATE dbo.Employees SET UserId = @UserId, UpdatedAtUtc = SYSUTCDATETIME() WHERE EmployeeId = @EmployeeId;
                EXEC dbo.usp_Internal_GrantAutoRoles @UserId;
                DECLARE @Summary NVARCHAR(500) = CONCAT(N'User JIT-provisioned from Entra sign-in for employee ', @EmployeeId, N'.');
                EXEC dbo.usp_Audit_Write @UserId, N'User.JitProvision', N'User', @UserId, @Summary;
                COMMIT;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK;
                THROW;
            END CATCH
        END
    END
    ELSE IF @UserId IS NOT NULL
        EXEC dbo.usp_Internal_GrantAutoRoles @UserId;

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

/*----------------------- Employee self-service ---------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Me_GetProfile
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @EmployeeId INT = (SELECT EmployeeId FROM dbo.Employees WHERE UserId = @ActorUserId);
    IF @EmployeeId IS NULL THROW 50404, N'Employee profile not found.', 1;

    SELECT e.EmployeeId, e.EmployeeNumber, CONCAT(e.FirstName, N' ', e.LastName) AS FullName,
           e.WorkEmail, e.Designation, d.DepartmentName,
           CASE WHEN m.EmployeeId IS NULL THEN NULL ELSE CONCAT(m.FirstName, N' ', m.LastName) END AS ManagerName,
           m.WorkEmail AS ManagerEmail, l.LocationName, e.EmploymentStatus, e.JoinDate,
           e.MobileNumber, e.Address, e.BloodGroup, e.EmergencyContactName, e.EmergencyContactNumber,
           CAST(CASE WHEN ph.EmployeeId IS NULL THEN 0 ELSE 1 END AS BIT) AS HasPhoto
    FROM dbo.Employees e
    LEFT JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
    LEFT JOIN dbo.Locations l ON l.LocationId = e.LocationId
    LEFT JOIN dbo.EmployeePhotos ph ON ph.EmployeeId = e.EmployeeId
    WHERE e.EmployeeId = @EmployeeId;

    SELECT TOP (1) c.CardId, CONCAT(N'****', RIGHT(c.CardUid, 4)) AS MaskedUid, c.Status,
           c.IssuedAtUtc, c.ExpiresAtUtc
    FROM dbo.RFIDCards c
    WHERE c.EmployeeId = @EmployeeId AND c.Status IN (N'Active', N'Blocked')
    ORDER BY CASE c.Status WHEN N'Active' THEN 0 ELSE 1 END, c.IssuedAtUtc DESC, c.CardId DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Me_UpdateProfile
    @ActorUserId           INT,
    @MobileNumber          NVARCHAR(20) = NULL,
    @Address               NVARCHAR(400) = NULL,
    @BloodGroup            NVARCHAR(5) = NULL,
    @EmergencyContactName  NVARCHAR(150) = NULL,
    @EmergencyContactNumber NVARCHAR(20) = NULL,
    @CorrelationId         UNIQUEIDENTIFIER = NULL,
    @IpAddress             VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @EmployeeId INT = (SELECT EmployeeId FROM dbo.Employees WHERE UserId = @ActorUserId);
    IF @EmployeeId IS NULL THROW 50404, N'Employee profile not found.', 1;
    IF @MobileNumber IS NOT NULL AND
       (LEN(@MobileNumber)<7 OR LEN(@MobileNumber)>20 OR @MobileNumber LIKE N'%[^+0-9 -]%'
        OR (@MobileNumber LIKE N'+%' AND (SUBSTRING(@MobileNumber,2,1) NOT LIKE N'[0-9]' OR SUBSTRING(@MobileNumber,2,LEN(@MobileNumber)) LIKE N'%+%'))
        OR (@MobileNumber NOT LIKE N'+%' AND (@MobileNumber LIKE N'%+%' OR SUBSTRING(@MobileNumber,1,1) NOT LIKE N'[0-9]')))
        THROW 50400, N'mobileNumber has an invalid format.', 1;
    IF @EmergencyContactNumber IS NOT NULL AND
       (LEN(@EmergencyContactNumber)<7 OR LEN(@EmergencyContactNumber)>20 OR @EmergencyContactNumber LIKE N'%[^+0-9 -]%'
        OR (@EmergencyContactNumber LIKE N'+%' AND (SUBSTRING(@EmergencyContactNumber,2,1) NOT LIKE N'[0-9]' OR SUBSTRING(@EmergencyContactNumber,2,LEN(@EmergencyContactNumber)) LIKE N'%+%'))
        OR (@EmergencyContactNumber NOT LIKE N'+%' AND (@EmergencyContactNumber LIKE N'%+%' OR SUBSTRING(@EmergencyContactNumber,1,1) NOT LIKE N'[0-9]')))
        THROW 50400, N'emergencyContactNumber has an invalid format.', 1;
    IF @BloodGroup IS NOT NULL AND @BloodGroup NOT IN (N'A+',N'A-',N'B+',N'B-',N'AB+',N'AB-',N'O+',N'O-')
        THROW 50400, N'bloodGroup is invalid.', 1;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @AfterJson NVARCHAR(MAX);
        UPDATE dbo.Employees
        SET MobileNumber=@MobileNumber, Address=@Address, BloodGroup=@BloodGroup,
            EmergencyContactName=@EmergencyContactName, EmergencyContactNumber=@EmergencyContactNumber,
            UpdatedAtUtc=SYSUTCDATETIME(), UpdatedByUserId=@ActorUserId
        WHERE EmployeeId=@EmployeeId;
        SELECT @AfterJson=(SELECT @MobileNumber AS mobileNumber, @Address AS address, @BloodGroup AS bloodGroup,
                                  @EmergencyContactName AS emergencyContactName, @EmergencyContactNumber AS emergencyContactNumber
                           FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.ProfileUpdate', N'Employee', @EmployeeId,
             N'Employee contact profile updated.', NULL, @AfterJson, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Me_GetProfile @ActorUserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Me_GetPhoto
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @EmployeeId INT = (SELECT EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId);
    IF @EmployeeId IS NULL THROW 50404, N'Employee photo not found.', 1;
    SELECT ContentType, Photo, SizeBytes, UploadedAtUtc FROM dbo.EmployeePhotos WHERE EmployeeId=@EmployeeId;
    IF @@ROWCOUNT = 0 THROW 50404, N'Employee photo not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Me_PutPhoto
    @ActorUserId INT,
    @PhotoContentType NVARCHAR(50),
    @Photo VARBINARY(MAX),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @EmployeeId INT = (SELECT EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId);
    IF @EmployeeId IS NULL THROW 50404, N'Employee profile not found.', 1;
    IF @PhotoContentType NOT IN (N'image/jpeg',N'image/png') OR @Photo IS NULL OR DATALENGTH(@Photo) NOT BETWEEN 1 AND 1048576
        THROW 50400, N'Photo must be JPEG or PNG and no larger than 1 MB.', 1;
    IF (@PhotoContentType=N'image/jpeg' AND SUBSTRING(@Photo,1,3)<>0xFFD8FF)
       OR (@PhotoContentType=N'image/png' AND SUBSTRING(@Photo,1,8)<>0x89504E470D0A1A0A)
        THROW 50400, N'Photo signature does not match photoContentType.', 1;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @AfterJson NVARCHAR(MAX);
        UPDATE dbo.EmployeePhotos WITH (UPDLOCK, SERIALIZABLE)
        SET ContentType=@PhotoContentType, Photo=@Photo, SizeBytes=DATALENGTH(@Photo),
            UploadedAtUtc=SYSUTCDATETIME(), UploadedByUserId=@ActorUserId
        WHERE EmployeeId=@EmployeeId;
        IF @@ROWCOUNT=0
            INSERT dbo.EmployeePhotos (EmployeeId,ContentType,Photo,SizeBytes,UploadedByUserId)
            VALUES (@EmployeeId,@PhotoContentType,@Photo,DATALENGTH(@Photo),@ActorUserId);
        SELECT @AfterJson=(SELECT @PhotoContentType AS contentType,DATALENGTH(@Photo) AS sizeBytes FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId,N'Employee.PhotoUpdate',N'Employee',@EmployeeId,
             N'Employee photo updated.',NULL,@AfterJson,NULL,@CorrelationId,@IpAddress;
        COMMIT;
        SELECT CAST(1 AS BIT) AS HasPhoto,@PhotoContentType AS ContentType,
               DATALENGTH(@Photo) AS SizeBytes,SYSUTCDATETIME() AS UploadedAtUtc;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_GetPhoto
    @ActorUserId INT,
    @EmployeeId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LocationId INT, @ActorEmployeeId INT;
    SELECT @LocationId=LocationId FROM dbo.Employees WHERE EmployeeId=@EmployeeId AND EmploymentStatus IN (N'Active',N'Inactive',N'Exited');
    SELECT @ActorEmployeeId=EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId;
    IF @LocationId IS NULL THROW 50404,N'Employee photo not found.',1;

    IF dbo.fn_HasPermission(@ActorUserId,N'Cards.ManagerApprove')=1
       AND NOT (dbo.fn_HasPermission(@ActorUserId,N'Cards.Process')=1
            OR dbo.fn_HasPermission(@ActorUserId,N'Cards.HrVerify')=1
            OR dbo.fn_HasPermission(@ActorUserId,N'Cards.SecurityReview')=1
            OR dbo.fn_HasPermission(@ActorUserId,N'Employees.ViewAll')=1)
       AND NOT EXISTS (SELECT 1 FROM dbo.Employees e WHERE e.EmployeeId=@EmployeeId AND e.ManagerEmployeeId=@ActorEmployeeId)
        THROW 50404,N'Employee photo not found.',1;

    IF NOT (dbo.fn_HasPermission(@ActorUserId,N'Cards.Process')=1
         OR dbo.fn_HasPermission(@ActorUserId,N'Cards.HrVerify')=1
         OR dbo.fn_HasPermission(@ActorUserId,N'Cards.SecurityReview')=1
         OR dbo.fn_HasPermission(@ActorUserId,N'Cards.ManagerApprove')=1
         OR dbo.fn_HasPermission(@ActorUserId,N'Employees.ViewAll')=1)
        THROW 50403,N'Employee photo permission is required.',1;
    IF dbo.fn_UserCanAccessLocation(@ActorUserId,@LocationId)=0
        THROW 50404,N'Employee photo not found.',1;
    SELECT ContentType,Photo,SizeBytes,UploadedAtUtc FROM dbo.EmployeePhotos WHERE EmployeeId=@EmployeeId;
    IF @@ROWCOUNT=0 THROW 50404,N'Employee photo not found.',1;
END
GO
