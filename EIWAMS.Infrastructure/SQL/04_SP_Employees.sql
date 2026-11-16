/*=====================================================================
  EIWAMS - 04_SP_Employees.sql
  Employee search, detail, create/update, transfer, deactivation,
  cards and history. BR: unique employee number, scope checks,
  transfer suspends out-of-subtree permissions, deactivation revokes.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Search
    @ActorUserId      INT,
    @Search           NVARCHAR(200) = NULL,
    @EmploymentStatus NVARCHAR(20) = NULL,
    @DepartmentId     INT = NULL,
    @LocationId       INT = NULL,
    @EmployeeType     NVARCHAR(20) = NULL,
    @Page             INT = 1,
    @PageSize         INT = 20,
    @SortBy           NVARCHAR(40) = NULL,
    @SortDir          NVARCHAR(4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @Desc BIT = CASE WHEN LOWER(@SortDir) = N'desc' THEN 1 ELSE 0 END;

    CREATE TABLE #f (EmployeeId INT PRIMARY KEY);
    INSERT #f (EmployeeId)
    SELECT v.EmployeeId
    FROM dbo.vw_Employees v
    JOIN dbo.fn_VisibleEmployees(@ActorUserId) ve ON ve.EmployeeId = v.EmployeeId
    WHERE (@EmploymentStatus IS NULL OR v.EmploymentStatus = @EmploymentStatus)
      AND (@DepartmentId IS NULL OR v.DepartmentId = @DepartmentId)
      AND (@LocationId IS NULL OR v.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@EmployeeType IS NULL OR v.EmployeeType = @EmployeeType)
      AND (@Search IS NULL OR v.EmployeeNumber LIKE N'%' + @Search + N'%' OR v.FullName LIKE N'%' + @Search + N'%'
           OR v.WorkEmail LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT v.EmployeeId, v.EmployeeNumber, v.FirstName, v.LastName, v.FullName, v.WorkEmail, v.EmployeeType, v.DepartmentId,
           v.DepartmentName, v.ManagerEmployeeId, v.ManagerName, v.LocationId, v.LocationName, v.EmploymentStatus, v.JoinDate,
           v.EndDate, v.ActiveCardCount, v.Designation, v.HasPhoto
    FROM dbo.vw_Employees v
    JOIN #f f ON f.EmployeeId = v.EmployeeId
    ORDER BY
        CASE WHEN @Desc = 0 AND @SortBy = N'employeeNumber' THEN v.EmployeeNumber END ASC,
        CASE WHEN @Desc = 1 AND @SortBy = N'employeeNumber' THEN v.EmployeeNumber END DESC,
        CASE WHEN @Desc = 0 AND @SortBy = N'departmentName' THEN v.DepartmentName END ASC,
        CASE WHEN @Desc = 1 AND @SortBy = N'departmentName' THEN v.DepartmentName END DESC,
        CASE WHEN @Desc = 0 AND @SortBy = N'locationName' THEN v.LocationName END ASC,
        CASE WHEN @Desc = 1 AND @SortBy = N'locationName' THEN v.LocationName END DESC,
        CASE WHEN @Desc = 0 AND @SortBy = N'joinDate' THEN v.JoinDate END ASC,
        CASE WHEN @Desc = 1 AND @SortBy = N'joinDate' THEN v.JoinDate END DESC,
        CASE WHEN @Desc = 0 AND @SortBy = N'employmentStatus' THEN v.EmploymentStatus END ASC,
        CASE WHEN @Desc = 1 AND @SortBy = N'employmentStatus' THEN v.EmploymentStatus END DESC,
        CASE WHEN @Desc = 0 AND ISNULL(@SortBy, N'fullName') NOT IN (N'employeeNumber', N'departmentName', N'locationName', N'joinDate', N'employmentStatus') THEN v.FullName END ASC,
        CASE WHEN @Desc = 1 AND ISNULL(@SortBy, N'fullName') NOT IN (N'employeeNumber', N'departmentName', N'locationName', N'joinDate', N'employmentStatus') THEN v.FullName END DESC,
        v.EmployeeId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Get
    @ActorUserId INT,
    @EmployeeId  INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
        THROW 50404, N'Employee not found.', 1;
    SELECT * FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId;
END
GO

-- Shared validation for create/update/transfer references.
CREATE OR ALTER PROCEDURE dbo.usp_Internal_ValidateEmployeeRefs
    @ActorUserId       INT,
    @EmployeeId        INT = NULL,
    @DepartmentId      INT,
    @ManagerEmployeeId INT = NULL,
    @LocationId        INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentId = @DepartmentId AND IsActive = 1)
        THROW 50400, N'The department does not exist or is inactive.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @LocationId AND IsActive = 1)
        THROW 50400, N'The location does not exist or is inactive.', 1;
    IF @ManagerEmployeeId IS NOT NULL
    BEGIN
        IF @ManagerEmployeeId = @EmployeeId
            THROW 50400, N'An employee cannot be their own manager.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @ManagerEmployeeId AND EmploymentStatus = N'Active')
            THROW 50400, N'The manager does not exist or is not active.', 1;
        -- Prevent reporting cycles.
        DECLARE @cursor INT = @ManagerEmployeeId, @hops INT = 0;
        WHILE @cursor IS NOT NULL AND @hops < 50
        BEGIN
            IF @cursor = @EmployeeId THROW 50400, N'The manager assignment would create a reporting cycle.', 1;
            SELECT @cursor = ManagerEmployeeId FROM dbo.Employees WHERE EmployeeId = @cursor;
            SET @hops += 1;
        END
    END
    IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0
        THROW 50403, N'The location is outside your facility scope.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Create
    @ActorUserId       INT,
    @EmployeeNumber    NVARCHAR(30),
    @FirstName         NVARCHAR(100),
    @LastName          NVARCHAR(100),
    @WorkEmail         NVARCHAR(256),
    @EmployeeType      NVARCHAR(20),
    @DepartmentId      INT,
    @ManagerEmployeeId INT = NULL,
    @LocationId        INT,
    @JoinDate          DATE,
    @EndDate           DATE = NULL,
    @UserId            INT = NULL,
    @Designation       NVARCHAR(100) = NULL,
    @CorrelationId     UNIQUEIDENTIFIER = NULL,
    @IpAddress         VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @EmployeeNumber = UPPER(LTRIM(RTRIM(@EmployeeNumber)));
        IF NULLIF(@EmployeeNumber, N'') IS NULL OR NULLIF(LTRIM(RTRIM(@FirstName)), N'') IS NULL OR NULLIF(LTRIM(RTRIM(@LastName)), N'') IS NULL
            THROW 50400, N'Employee number, first name and last name are required.', 1;
        IF @EndDate IS NOT NULL AND @EndDate < @JoinDate
            THROW 50400, N'The end date cannot be before the join date.', 1;
        IF @EmployeeType NOT IN (N'Permanent', N'Contract', N'Intern', N'Vendor')
            THROW 50400, N'Invalid employee type.', 1;
        EXEC dbo.usp_Internal_ValidateEmployeeRefs @ActorUserId, NULL, @DepartmentId, @ManagerEmployeeId, @LocationId;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Employees WITH (UPDLOCK, HOLDLOCK) WHERE EmployeeNumber = @EmployeeNumber)
            THROW 50409, N'An employee with this employee number already exists.', 1;
        IF @UserId IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId)
                THROW 50400, N'The linked user does not exist.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Employees WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId)
                THROW 50409, N'The user account is already linked to another employee.', 1;
        END

        INSERT dbo.Employees (EmployeeNumber, FirstName, LastName, WorkEmail, EmployeeType, DepartmentId, ManagerEmployeeId, LocationId,
                              EmploymentStatus, JoinDate, EndDate, UserId, CreatedByUserId, Designation)
        VALUES (@EmployeeNumber, LTRIM(RTRIM(@FirstName)), LTRIM(RTRIM(@LastName)), LTRIM(RTRIM(@WorkEmail)), @EmployeeType, @DepartmentId,
                @ManagerEmployeeId, @LocationId, N'Active', @JoinDate, @EndDate, @UserId, @ActorUserId, NULLIF(LTRIM(RTRIM(@Designation)), N''));
        DECLARE @Id INT = SCOPE_IDENTITY();

        DECLARE @After NVARCHAR(MAX) = (SELECT EmployeeId, EmployeeNumber, FullName, WorkEmail, EmployeeType, DepartmentName, ManagerName,
                                               LocationName, EmploymentStatus, JoinDate, EndDate, UserId
                                        FROM dbo.vw_Employees WHERE EmployeeId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.EmployeeHistory (EmployeeId, ChangeType, Summary, AfterJson, EffectiveDate, ChangedByUserId)
        VALUES (@Id, N'Created', CONCAT(N'Employee ', @EmployeeNumber, N' created.'), @After, @JoinDate, @ActorUserId);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Employee ', @EmployeeNumber, N' (', @FirstName, N' ', @LastName, N') created.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.Created', N'Employee', @Id, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;

        DECLARE @MgrUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @ManagerEmployeeId);
        DECLARE @Route NVARCHAR(200) = CONCAT(N'/employees/', @Id);
        EXEC dbo.usp_Notification_Create @MgrUser, N'EmployeeCreated', N'New team member', @Summary, N'Employee', @Id, @Route, @ActorUserId;
        COMMIT;

        SELECT * FROM dbo.vw_Employees WHERE EmployeeId = @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Update
    @ActorUserId       INT,
    @EmployeeId        INT,
    @FirstName         NVARCHAR(100),
    @LastName          NVARCHAR(100),
    @WorkEmail         NVARCHAR(256),
    @EmployeeType      NVARCHAR(20),
    @DepartmentId      INT,
    @ManagerEmployeeId INT = NULL,
    @LocationId        INT,
    @JoinDate          DATE,
    @EndDate           DATE = NULL,
    @UserId            INT = NULL,
    @Designation       NVARCHAR(100) = NULL,
    @Version           BINARY(8),
    @CorrelationId     UNIQUEIDENTIFIER = NULL,
    @IpAddress         VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        IF @EndDate IS NOT NULL AND @EndDate < @JoinDate THROW 50400, N'The end date cannot be before the join date.', 1;
        IF @EmployeeType NOT IN (N'Permanent', N'Contract', N'Intern', N'Vendor') THROW 50400, N'Invalid employee type.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;
        EXEC dbo.usp_Internal_ValidateEmployeeRefs @ActorUserId, @EmployeeId, @DepartmentId, @ManagerEmployeeId, @LocationId;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @CurVersion BINARY(8), @Number NVARCHAR(30);
        SELECT @Status = EmploymentStatus, @CurVersion = Version, @Number = EmployeeNumber
        FROM dbo.Employees WITH (UPDLOCK) WHERE EmployeeId = @EmployeeId;
        IF @CurVersion <> @Version THROW 50409, N'The employee was changed by someone else. Reload and try again.', 1;
        IF @Status = N'Exited' THROW 50409, N'Exited employees cannot be edited.', 1;
        IF @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Employees WHERE UserId = @UserId AND EmployeeId <> @EmployeeId)
            THROW 50409, N'The user account is already linked to another employee.', 1;
        IF @UserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId)
            THROW 50400, N'The linked user does not exist.', 1;

        DECLARE @Before NVARCHAR(MAX) = (SELECT EmployeeId, EmployeeNumber, FullName, WorkEmail, EmployeeType, DepartmentName, ManagerName,
                                                LocationName, EmploymentStatus, JoinDate, EndDate, UserId
                                         FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE dbo.Employees
        SET FirstName = LTRIM(RTRIM(@FirstName)), LastName = LTRIM(RTRIM(@LastName)), WorkEmail = LTRIM(RTRIM(@WorkEmail)),
            EmployeeType = @EmployeeType, DepartmentId = @DepartmentId, ManagerEmployeeId = @ManagerEmployeeId, LocationId = @LocationId,
            JoinDate = @JoinDate, EndDate = @EndDate, UserId = @UserId, Designation = NULLIF(LTRIM(RTRIM(@Designation)), N''), UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        WHERE EmployeeId = @EmployeeId AND Version = @Version;
        IF @@ROWCOUNT = 0 THROW 50409, N'The employee was changed by someone else. Reload and try again.', 1;

        DECLARE @After NVARCHAR(MAX) = (SELECT EmployeeId, EmployeeNumber, FullName, WorkEmail, EmployeeType, DepartmentName, ManagerName,
                                               LocationName, EmploymentStatus, JoinDate, EndDate, UserId
                                        FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
        INSERT dbo.EmployeeHistory (EmployeeId, ChangeType, Summary, BeforeJson, AfterJson, EffectiveDate, ChangedByUserId)
        VALUES (@EmployeeId, N'Updated', N'Employee details updated.', @Before, @After, @Today, @ActorUserId);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Employee ', @Number, N' updated.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.Updated', N'Employee', @EmployeeId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;

        SELECT * FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Transfer
    @ActorUserId       INT,
    @EmployeeId        INT,
    @DepartmentId      INT,
    @ManagerEmployeeId INT = NULL,
    @LocationId        INT,
    @EffectiveDate     DATE,
    @Reason            NVARCHAR(500),
    @CorrelationId     UNIQUEIDENTIFIER = NULL,
    @IpAddress         VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A transfer reason is required.', 1;
        IF @EffectiveDate IS NULL THROW 50400, N'The effective date is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;
        EXEC dbo.usp_Internal_ValidateEmployeeRefs @ActorUserId, @EmployeeId, @DepartmentId, @ManagerEmployeeId, @LocationId;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Number NVARCHAR(30), @EmpUser INT;
        SELECT @Status = EmploymentStatus, @Number = EmployeeNumber, @EmpUser = UserId FROM dbo.Employees WITH (UPDLOCK) WHERE EmployeeId = @EmployeeId;
        IF @Status <> N'Active' THROW 50409, N'Only active employees can be transferred.', 1;

        DECLARE @Before NVARCHAR(MAX) = (SELECT DepartmentId, DepartmentName, ManagerEmployeeId, ManagerName, LocationId, LocationName
                                         FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE dbo.Employees
        SET DepartmentId = @DepartmentId, ManagerEmployeeId = @ManagerEmployeeId, LocationId = @LocationId,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        WHERE EmployeeId = @EmployeeId;

        -- Permissions outside the new location's ancestor chain and subtree are suspended for review.
        DECLARE @Keep TABLE (LocationId INT PRIMARY KEY);
        INSERT @Keep SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)
        UNION SELECT LocationId FROM dbo.fn_LocationAncestors(@LocationId);
        DECLARE @Suspended TABLE (PermissionId BIGINT);
        UPDATE dbo.AccessPermissions SET Status = N'Suspended'
        OUTPUT inserted.PermissionId INTO @Suspended
        WHERE EmployeeId = @EmployeeId AND Status = N'Active' AND LocationId NOT IN (SELECT LocationId FROM @Keep);
        DECLARE @SuspendedCount INT = (SELECT COUNT(*) FROM @Suspended);

        DECLARE @After NVARCHAR(MAX) = (SELECT DepartmentId, DepartmentName, ManagerEmployeeId, ManagerName, LocationId, LocationName,
                                               @SuspendedCount AS SuspendedPermissions
                                        FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Employee ', @Number, N' transferred; ', @SuspendedCount, N' permission(s) suspended for review.');
        INSERT dbo.EmployeeHistory (EmployeeId, ChangeType, Summary, BeforeJson, AfterJson, EffectiveDate, Reason, ChangedByUserId)
        VALUES (@EmployeeId, N'Transferred', @Summary, @Before, @After, @EffectiveDate, @Reason, @ActorUserId);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.Transferred', N'Employee', @EmployeeId, @Summary, @Before, @After, @Reason, @CorrelationId, @IpAddress;

        IF @SuspendedCount > 0
        BEGIN
            DECLARE @pid BIGINT, @plid INT, @dummy NVARCHAR(20);
            DECLARE sc CURSOR LOCAL FAST_FORWARD FOR SELECT s.PermissionId, ap.LocationId FROM @Suspended s JOIN dbo.AccessPermissions ap ON ap.PermissionId = s.PermissionId;
            OPEN sc; FETCH NEXT FROM sc INTO @pid, @plid;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                EXEC dbo.usp_Internal_ControllerCommand N'SuspendPermission', N'AccessPermission', @pid, @plid, NULL, @CorrelationId, @dummy OUTPUT;
                FETCH NEXT FROM sc INTO @pid, @plid;
            END
            CLOSE sc; DEALLOCATE sc;
        END

        DECLARE @Route NVARCHAR(200) = CONCAT(N'/employees/', @EmployeeId);
        DECLARE @MgrUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @ManagerEmployeeId);
        EXEC dbo.usp_Notification_Create @EmpUser, N'EmployeeTransferred', N'You have been transferred', @Summary, N'Employee', @EmployeeId, @Route, @ActorUserId;
        EXEC dbo.usp_Notification_Create @MgrUser, N'EmployeeTransferred', N'Team member transferred', @Summary, N'Employee', @EmployeeId, @Route, @ActorUserId;
        IF @SuspendedCount > 0
            EXEC dbo.usp_Notification_CreateForRole N'FacilityAdmin', @LocationId, N'PermissionsSuspended', N'Permissions suspended after transfer',
                 @Summary, N'Employee', @EmployeeId, @Route, @ActorUserId;
        COMMIT;

        SELECT * FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Deactivate
    @ActorUserId      INT,
    @EmployeeId       INT,
    @EmploymentStatus NVARCHAR(20),
    @EndDate          DATE,
    @Reason           NVARCHAR(500),
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @EmploymentStatus NOT IN (N'Exited', N'Inactive') THROW 50400, N'Employment status must be Exited or Inactive.', 1;
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A deactivation reason is required.', 1;
        IF @EndDate IS NULL THROW 50400, N'The end date is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Number NVARCHAR(30), @JoinDate DATE, @LocationId INT, @MgrUser INT;
        SELECT @Status = e.EmploymentStatus, @Number = e.EmployeeNumber, @JoinDate = e.JoinDate, @LocationId = e.LocationId, @MgrUser = m.UserId
        FROM dbo.Employees e WITH (UPDLOCK) LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
        WHERE e.EmployeeId = @EmployeeId;
        IF @Status <> N'Active' THROW 50409, N'The employee is already inactive or exited.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0 THROW 50403, N'The employee is outside your facility scope.', 1;
        IF @EndDate < @JoinDate THROW 50400, N'The end date cannot be before the join date.', 1;

        DECLARE @Before NVARCHAR(MAX) = (SELECT EmploymentStatus, EndDate, ActiveCardCount, ActivePermissionCount, OpenAccessRequestCount
                                         FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE dbo.Employees SET EmploymentStatus = @EmploymentStatus, EndDate = @EndDate, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        WHERE EmployeeId = @EmployeeId;

        DECLARE @Cards TABLE (CardId BIGINT);
        UPDATE dbo.RFIDCards
        SET Status = N'Deactivated', BlockedAtUtc = ISNULL(BlockedAtUtc, SYSUTCDATETIME()), BlockReason = ISNULL(BlockReason, N'Employee deactivated'),
            ControllerSyncStatus = N'Pending', UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        OUTPUT inserted.CardId INTO @Cards
        WHERE EmployeeId = @EmployeeId AND Status IN (N'Requested', N'Active');

        DECLARE @Perms TABLE (PermissionId BIGINT, LocationId INT);
        UPDATE dbo.AccessPermissions
        SET Status = N'Revoked', RevokedAtUtc = SYSUTCDATETIME(), RevokedByUserId = @ActorUserId, RevokeReason = N'Employee deactivated',
            ControllerSyncStatus = N'Pending'
        OUTPUT inserted.PermissionId, inserted.LocationId INTO @Perms
        WHERE EmployeeId = @EmployeeId AND Status IN (N'Active', N'Suspended');

        UPDATE dbo.AccessRequests SET Status = N'Cancelled', CurrentStage = NULL, CancelReason = N'Employee deactivated', UpdatedAtUtc = SYSUTCDATETIME()
        WHERE EmployeeId = @EmployeeId AND Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved');
        DECLARE @ReqCount INT = @@ROWCOUNT;
        UPDATE a SET Decision = N'Skipped'
        FROM dbo.AccessRequestApprovals a JOIN dbo.AccessRequests ar ON ar.AccessRequestId = a.AccessRequestId
        WHERE ar.EmployeeId = @EmployeeId AND a.Decision = N'Pending' AND ar.Status = N'Cancelled';
        DECLARE @CancelledCardRequests TABLE (CardRequestId BIGINT, FromStatus NVARCHAR(30), ToStatus NVARCHAR(30));
        UPDATE dbo.CardRequests
        SET Status=N'Cancelled',DecidedAtUtc=SYSUTCDATETIME(),DecisionComments=N'Employee deactivated'
        OUTPUT inserted.CardRequestId,deleted.Status,inserted.Status INTO @CancelledCardRequests
        WHERE EmployeeId=@EmployeeId
          AND Status IN (N'PendingManager',N'PendingHR',N'PendingSecurity',N'PendingIdCardTeam',N'Printing',N'ReadyToIssue');
        INSERT dbo.CardRequestHistory(CardRequestId,FromStatus,ToStatus,Action,Comments,ActorUserId)
        SELECT CardRequestId,FromStatus,ToStatus,N'Cancel',N'Employee deactivated',@ActorUserId
        FROM @CancelledCardRequests;
        UPDATE dbo.Users SET IsActive=0,UpdatedAtUtc=SYSUTCDATETIME()
        WHERE UserId=(SELECT UserId FROM dbo.Employees WHERE EmployeeId=@EmployeeId);

        -- Controller sync for every revoked credential.
        DECLARE @sync NVARCHAR(20), @cid BIGINT, @pid BIGINT, @plid INT;
        DECLARE cc CURSOR LOCAL FAST_FORWARD FOR SELECT CardId FROM @Cards;
        OPEN cc; FETCH NEXT FROM cc INTO @cid;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.usp_Internal_ControllerCommand N'DeactivateCard', N'Card', @cid, NULL, NULL, @CorrelationId, @sync OUTPUT;
            UPDATE dbo.RFIDCards SET ControllerSyncStatus = @sync WHERE CardId = @cid;
            FETCH NEXT FROM cc INTO @cid;
        END
        CLOSE cc; DEALLOCATE cc;
        DECLARE pc CURSOR LOCAL FAST_FORWARD FOR SELECT PermissionId, LocationId FROM @Perms;
        OPEN pc; FETCH NEXT FROM pc INTO @pid, @plid;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.usp_Internal_ControllerCommand N'RevokePermission', N'AccessPermission', @pid, @plid, NULL, @CorrelationId, @sync OUTPUT;
            UPDATE dbo.AccessPermissions SET ControllerSyncStatus = @sync WHERE PermissionId = @pid;
            FETCH NEXT FROM pc INTO @pid, @plid;
        END
        CLOSE pc; DEALLOCATE pc;

        DECLARE @CardCount INT = (SELECT COUNT(*) FROM @Cards), @PermCount INT = (SELECT COUNT(*) FROM @Perms);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Employee ', @Number, N' set to ', @EmploymentStatus, N': ', @CardCount, N' card(s) deactivated, ',
                                                @PermCount, N' permission(s) revoked, ', @ReqCount, N' request(s) cancelled.');
        DECLARE @After NVARCHAR(MAX) = (SELECT EmploymentStatus, EndDate, ActiveCardCount, ActivePermissionCount, OpenAccessRequestCount
                                        FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.EmployeeHistory (EmployeeId, ChangeType, Summary, BeforeJson, AfterJson, EffectiveDate, Reason, ChangedByUserId)
        VALUES (@EmployeeId, N'Deactivated', @Summary, @Before, @After, @EndDate, @Reason, @ActorUserId);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Employee.Deactivated', N'Employee', @EmployeeId, @Summary, @Before, @After, @Reason, @CorrelationId, @IpAddress;

        DECLARE @Route NVARCHAR(200) = CONCAT(N'/employees/', @EmployeeId);
        EXEC dbo.usp_Notification_Create @MgrUser, N'EmployeeDeactivated', N'Team member deactivated', @Summary, N'Employee', @EmployeeId, @Route, @ActorUserId;
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @LocationId, N'EmployeeDeactivated', N'Employee access revoked', @Summary,
             N'Employee', @EmployeeId, @Route, @ActorUserId;
        COMMIT;

        SELECT * FROM dbo.vw_Employees WHERE EmployeeId = @EmployeeId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_GetCards
    @ActorUserId INT,
    @EmployeeId  INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_OperationalEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
        THROW 50404, N'Employee not found.', 1;
    SELECT CardId, MaskedCardUid, EmployeeId, EmployeeNumber, EmployeeName, CardType, Status, IssuedAtUtc, ActivatedAtUtc, ExpiresAtUtc,
           BlockedAtUtc, BlockReason, ControllerSyncStatus, ReplacedByCardId, CardRequestId, Version
    FROM dbo.vw_Cards WHERE EmployeeId = @EmployeeId
    ORDER BY IssuedAtUtc DESC, CardId DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_GetHistory
    @ActorUserId INT,
    @EmployeeId  INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
        THROW 50404, N'Employee not found.', 1;
    SELECT h.HistoryId, h.ChangeType, h.Summary, h.EffectiveDate, ISNULL(u.DisplayName, N'System') AS ChangedByName, h.ChangedAtUtc
    FROM dbo.EmployeeHistory h
    LEFT JOIN dbo.Users u ON u.UserId = h.ChangedByUserId
    WHERE h.EmployeeId = @EmployeeId
    ORDER BY h.ChangedAtUtc DESC, h.HistoryId DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_Sync
    @ActorUserId INT,
    @EmployeesJson NVARCHAR(MAX),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF dbo.fn_HasPermission(@ActorUserId,N'Employees.Sync')=0
        THROW 50403,N'Employee sync permission is required.',1;
    IF ISJSON(@EmployeesJson)<>1 THROW 50400,N'employees must be a valid JSON array.',1;

    CREATE TABLE #Input
    (
        RowNumber INT NOT NULL,
        EmployeeNumber NVARCHAR(30) NOT NULL,
        FirstName NVARCHAR(100) NOT NULL,
        LastName NVARCHAR(100) NOT NULL,
        WorkEmail NVARCHAR(256) NOT NULL,
        Designation NVARCHAR(100) NULL,
        DepartmentCode NVARCHAR(20) NOT NULL,
        ManagerEmployeeNumber NVARCHAR(30) NULL,
        LocationCode NVARCHAR(30) NOT NULL,
        EmployeeType NVARCHAR(20) NOT NULL,
        EmploymentStatus NVARCHAR(20) NOT NULL,
        JoinDate DATE NOT NULL,
        EndDate DATE NULL
    );
    INSERT #Input
    SELECT TRY_CONVERT(INT,[key])+1,
           JSON_VALUE(value,'$.employeeNumber'),JSON_VALUE(value,'$.firstName'),JSON_VALUE(value,'$.lastName'),
           JSON_VALUE(value,'$.workEmail'),JSON_VALUE(value,'$.designation'),JSON_VALUE(value,'$.departmentCode'),
           JSON_VALUE(value,'$.managerEmployeeNumber'),JSON_VALUE(value,'$.locationCode'),JSON_VALUE(value,'$.employeeType'),
           JSON_VALUE(value,'$.employmentStatus'),TRY_CONVERT(DATE,JSON_VALUE(value,'$.joinDate')),
           TRY_CONVERT(DATE,JSON_VALUE(value,'$.endDate'))
    FROM OPENJSON(@EmployeesJson);
    IF (SELECT COUNT(*) FROM #Input) NOT BETWEEN 1 AND 500
        THROW 50400,N'employees must contain between 1 and 500 rows.',1;
    IF EXISTS (SELECT EmployeeNumber FROM #Input GROUP BY EmployeeNumber HAVING COUNT(*)>1)
        THROW 50400,N'employees contains duplicate employeeNumber values.',1;

    DECLARE @BadRows NVARCHAR(1000);
    SELECT @BadRows=STRING_AGG(CONVERT(NVARCHAR(10),i.RowNumber),N',')
    FROM #Input i LEFT JOIN dbo.Departments d ON d.DepartmentCode=i.DepartmentCode
    WHERE d.DepartmentId IS NULL;
    IF @BadRows IS NOT NULL
    BEGIN
        DECLARE @DeptError NVARCHAR(2048)=CONCAT(N'Unknown departmentCode at row(s): ',@BadRows);
        THROW 50400,@DeptError,1;
    END
    SET @BadRows=NULL;
    SELECT @BadRows=STRING_AGG(CONVERT(NVARCHAR(10),i.RowNumber),N',')
    FROM #Input i LEFT JOIN dbo.Locations l ON l.LocationCode=i.LocationCode
    WHERE l.LocationId IS NULL;
    IF @BadRows IS NOT NULL
    BEGIN
        DECLARE @LocationError NVARCHAR(2048)=CONCAT(N'Unknown locationCode at row(s): ',@BadRows);
        THROW 50400,@LocationError,1;
    END
    SET @BadRows=NULL;
    SELECT @BadRows=STRING_AGG(CONVERT(NVARCHAR(10),i.RowNumber),N',')
    FROM #Input i
    WHERE i.ManagerEmployeeNumber IS NOT NULL
      AND i.ManagerEmployeeNumber=i.EmployeeNumber;
    IF @BadRows IS NOT NULL
    BEGIN
        DECLARE @SelfManagerError NVARCHAR(2048)=CONCAT(N'Employee cannot manage itself at row(s): ',@BadRows);
        THROW 50400,@SelfManagerError,1;
    END

    CREATE TABLE #WasActive(EmployeeNumber NVARCHAR(30) PRIMARY KEY);
    INSERT #WasActive SELECT e.EmployeeNumber
    FROM dbo.Employees e JOIN #Input i ON i.EmployeeNumber=e.EmployeeNumber
    WHERE e.EmploymentStatus=N'Active' AND i.EmploymentStatus IN (N'Exited',N'Inactive');

    BEGIN TRY
        BEGIN TRAN;
        DECLARE @Inserted INT=0,@Updated INT=0,@Deactivated INT=0;
        INSERT dbo.Employees
            (EmployeeNumber,FirstName,LastName,WorkEmail,Designation,EmployeeType,DepartmentId,ManagerEmployeeId,LocationId,
             EmploymentStatus,JoinDate,EndDate,CreatedByUserId)
        SELECT i.EmployeeNumber,i.FirstName,i.LastName,i.WorkEmail,i.Designation,i.EmployeeType,d.DepartmentId,NULL,l.LocationId,
               i.EmploymentStatus,i.JoinDate,i.EndDate,@ActorUserId
        FROM #Input i
        JOIN dbo.Departments d ON d.DepartmentCode=i.DepartmentCode
        JOIN dbo.Locations l ON l.LocationCode=i.LocationCode
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Employees e WHERE e.EmployeeNumber=i.EmployeeNumber);
        SET @Inserted=@@ROWCOUNT;

        UPDATE e
        SET FirstName=i.FirstName,LastName=i.LastName,WorkEmail=i.WorkEmail,Designation=i.Designation,
            EmployeeType=i.EmployeeType,DepartmentId=d.DepartmentId,LocationId=l.LocationId,
            EmploymentStatus=CASE WHEN w.EmployeeNumber IS NOT NULL THEN N'Active' ELSE i.EmploymentStatus END,
            JoinDate=i.JoinDate,EndDate=CASE WHEN w.EmployeeNumber IS NOT NULL THEN e.EndDate ELSE i.EndDate END,
            UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@ActorUserId
        FROM dbo.Employees e
        JOIN #Input i ON i.EmployeeNumber=e.EmployeeNumber
        JOIN dbo.Departments d ON d.DepartmentCode=i.DepartmentCode
        JOIN dbo.Locations l ON l.LocationCode=i.LocationCode
        LEFT JOIN #WasActive w ON w.EmployeeNumber=i.EmployeeNumber;
        SET @Updated=@@ROWCOUNT;

        SET @BadRows=NULL;
        SELECT @BadRows=STRING_AGG(CONVERT(NVARCHAR(10),i.RowNumber),N',')
        FROM #Input i
        WHERE i.ManagerEmployeeNumber IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.Employees m WHERE m.EmployeeNumber=i.ManagerEmployeeNumber);
        IF @BadRows IS NOT NULL
        BEGIN
            DECLARE @ManagerError NVARCHAR(2048)=CONCAT(N'Unknown managerEmployeeNumber at row(s): ',@BadRows);
            THROW 50400,@ManagerError,1;
        END

        UPDATE e SET ManagerEmployeeId=m.EmployeeId,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@ActorUserId
        FROM dbo.Employees e
        JOIN #Input i ON i.EmployeeNumber=e.EmployeeNumber
        LEFT JOIN dbo.Employees m ON m.EmployeeNumber=i.ManagerEmployeeNumber
        WHERE ISNULL(e.ManagerEmployeeId,-1)<>ISNULL(m.EmployeeId,-1);

        DECLARE @EmployeeId INT,@Number NVARCHAR(30),@Status NVARCHAR(20),@EndDate DATE,@JoinDate DATE;
        DECLARE deact CURSOR LOCAL FAST_FORWARD FOR
            SELECT e.EmployeeId,e.EmployeeNumber,i.EmploymentStatus,COALESCE(i.EndDate,CONVERT(DATE,SYSUTCDATETIME())),i.JoinDate
            FROM dbo.Employees e JOIN #Input i ON i.EmployeeNumber=e.EmployeeNumber
            JOIN #WasActive w ON w.EmployeeNumber=i.EmployeeNumber;
        OPEN deact;
        FETCH NEXT FROM deact INTO @EmployeeId,@Number,@Status,@EndDate,@JoinDate;
        WHILE @@FETCH_STATUS=0
        BEGIN
            IF @EndDate<@JoinDate SET @EndDate=@JoinDate;
            EXEC dbo.usp_Employee_Deactivate @ActorUserId,@EmployeeId,@Status,@EndDate,N'Employment status synchronized from HR.',@CorrelationId,@IpAddress;
            UPDATE u SET IsActive=0,UpdatedAtUtc=SYSUTCDATETIME()
            FROM dbo.Users u JOIN dbo.Employees e ON e.UserId=u.UserId WHERE e.EmployeeId=@EmployeeId;
            SET @Deactivated+=1;
            FETCH NEXT FROM deact INTO @EmployeeId,@Number,@Status,@EndDate,@JoinDate;
        END
        CLOSE deact;
        DEALLOCATE deact;

        EXEC dbo.usp_Internal_GrantAutoRoles NULL;
        DECLARE @Summary NVARCHAR(500)=CONCAT(N'Employee sync completed: ',@Inserted,N' inserted, ',@Updated,N' updated, ',@Deactivated,N' deactivated.');
        DECLARE @AfterJson NVARCHAR(MAX)=(SELECT @Inserted AS inserted,@Updated AS updated,@Deactivated AS deactivated FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId,N'Employee.Sync',N'EmployeeBatch',N'HR',@Summary,NULL,@AfterJson,NULL,@CorrelationId,@IpAddress;
        COMMIT;
        SELECT @Inserted AS Inserted,@Updated AS Updated,@Deactivated AS Deactivated;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local','deact')>=0 CLOSE deact;
        IF CURSOR_STATUS('local','deact')>-3 DEALLOCATE deact;
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
    END CATCH
END
GO
