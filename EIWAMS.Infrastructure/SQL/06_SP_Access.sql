/*=====================================================================
  EIWAMS - 06_SP_Access.sql
  Access requests (draft, submit, edit, cancel), multi-stage approvals
  (Manager -> SecurityHead/Security -> AccessControl) and access permissions
  (provision, revoke, search). BR: separation of duties, facility scope,
  return/reject need comments, provisioning only after approval.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION dbo.fn_StageOrder (@Stage NVARCHAR(20))
RETURNS INT
AS
BEGIN
    RETURN CASE @Stage WHEN N'Manager' THEN 1 WHEN N'SecurityHead' THEN 2 WHEN N'Security' THEN 2 WHEN N'AccessControl' THEN 3 END;
END
GO

-- Assigns approvers to the stage row of the current cycle. Throws 50422 when nobody can approve.
CREATE OR ALTER PROCEDURE dbo.usp_Internal_AssignApprovers
    @AccessRequestId BIGINT,
    @Stage           NVARCHAR(20),
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Cycle INT, @LocId INT, @Requester INT, @EmpUser INT, @MgrUser INT, @Number NVARCHAR(20), @EmpName NVARCHAR(250), @LocName NVARCHAR(150);
    SELECT @Cycle = ar.Cycle, @LocId = ar.LocationId, @Requester = ar.RequesterUserId, @EmpUser = e.UserId, @MgrUser = m.UserId,
           @Number = ar.RequestNumber, @EmpName = CONCAT(e.FirstName, N' ', e.LastName), @LocName = l.LocationName
    FROM dbo.AccessRequests ar
    JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId
    JOIN dbo.Locations l ON l.LocationId = ar.LocationId
    LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
    WHERE ar.AccessRequestId = @AccessRequestId;

    DECLARE @ApprovalId BIGINT = (SELECT ApprovalId FROM dbo.AccessRequestApprovals WHERE AccessRequestId = @AccessRequestId AND Cycle = @Cycle AND Stage = @Stage);

    -- Requester, employee and anyone who already approved an earlier stage of this cycle are excluded (separation of duties).
    DECLARE @Excluded TABLE (UserId INT PRIMARY KEY);
    INSERT @Excluded SELECT @Requester;
    IF @EmpUser IS NOT NULL AND @EmpUser <> @Requester INSERT @Excluded SELECT @EmpUser;
    INSERT @Excluded SELECT DISTINCT a.DecidedByUserId FROM dbo.AccessRequestApprovals a
    WHERE a.AccessRequestId = @AccessRequestId AND a.Cycle = @Cycle AND a.DecidedByUserId IS NOT NULL
      AND a.DecidedByUserId NOT IN (SELECT UserId FROM @Excluded);

    DECLARE @Candidates TABLE (UserId INT PRIMARY KEY);
    IF @Stage = N'Manager' AND @MgrUser IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @MgrUser AND IsActive = 1)
       AND dbo.fn_HasPermission(@MgrUser, N'Approvals.Decide') = 1
       AND @MgrUser NOT IN (SELECT UserId FROM @Excluded)
        INSERT @Candidates VALUES (@MgrUser);

    IF NOT EXISTS (SELECT 1 FROM @Candidates)
    BEGIN
        DECLARE @Role NVARCHAR(50) = CASE @Stage WHEN N'Manager' THEN N'Manager' WHEN N'Security' THEN N'SecurityTeam'
                                                  WHEN N'SecurityHead' THEN N'SecurityHead' ELSE N'AccessControlTeam' END;
        INSERT @Candidates
        SELECT DISTINCT u.UserId
        FROM dbo.Users u
        JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
        JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.RoleName = @Role
        WHERE u.IsActive = 1 AND u.UserId NOT IN (SELECT UserId FROM @Excluded)
          AND dbo.fn_UserCanAccessLocation(u.UserId, @LocId) = 1
          AND dbo.fn_HasPermission(u.UserId, N'Approvals.Decide') = 1;
    END

    IF NOT EXISTS (SELECT 1 FROM @Candidates)
        INSERT @Candidates
        SELECT DISTINCT u.UserId
        FROM dbo.Users u
        JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
        JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.RoleName = N'SystemAdmin'
        WHERE u.IsActive = 1 AND u.UserId NOT IN (SELECT UserId FROM @Excluded);

    IF NOT EXISTS (SELECT 1 FROM @Candidates)
        THROW 50422, N'No eligible approver is available for this approval stage.', 1;

    DELETE dbo.AccessRequestApprovalAssignees WHERE ApprovalId = @ApprovalId;
    INSERT dbo.AccessRequestApprovalAssignees (ApprovalId, UserId) SELECT @ApprovalId, UserId FROM @Candidates;
    UPDATE dbo.AccessRequestApprovals SET AssignedAtUtc = SYSUTCDATETIME() WHERE ApprovalId = @ApprovalId;

    DECLARE @Title NVARCHAR(200) = CONCAT(N'Approval needed: ', @Number);
    DECLARE @Msg NVARCHAR(1000) = CONCAT(@Stage, N' approval requested for ', @EmpName, N' to access ', @LocName, N'.');
    INSERT dbo.Notifications (UserId, Type, Title, Message, RelatedEntityType, RelatedEntityId, Route)
    SELECT c.UserId, N'ApprovalRequested', @Title, @Msg, N'AccessRequest', CAST(@AccessRequestId AS NVARCHAR(60)), CONCAT(N'/access-requests/', @AccessRequestId)
    FROM @Candidates c WHERE c.UserId <> ISNULL(@ActorUserId, -1);
END
GO

/*--------------------------- Read procedures ------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Search
    @ActorUserId  INT,
    @Status       NVARCHAR(20) = NULL,
    @CurrentStage NVARCHAR(20) = NULL,
    @AccessType   NVARCHAR(20) = NULL,
    @LocationId   INT = NULL,
    @EmployeeId   INT = NULL,
    @Mine         BIT = NULL,
    @Search       NVARCHAR(200) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @SortBy       NVARCHAR(40) = NULL,
    @SortDir      NVARCHAR(4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @Asc BIT = CASE WHEN LOWER(@SortDir) = N'asc' THEN 1 ELSE 0 END;

    CREATE TABLE #f (AccessRequestId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT v.AccessRequestId
    FROM dbo.vw_AccessRequests v
    JOIN dbo.fn_VisibleAccessRequests(@ActorUserId) x ON x.AccessRequestId = v.AccessRequestId
    WHERE (@Status IS NULL OR v.Status = @Status)
      AND (@CurrentStage IS NULL OR v.CurrentStage = @CurrentStage)
      AND (@AccessType IS NULL OR v.AccessType = @AccessType)
      AND (@LocationId IS NULL OR v.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@EmployeeId IS NULL OR v.EmployeeId = @EmployeeId)
      AND (ISNULL(@Mine, 0) = 0 OR v.RequesterUserId = @ActorUserId OR v.EmployeeUserId = @ActorUserId)
      AND (@Search IS NULL OR v.RequestNumber LIKE N'%' + @Search + N'%' OR v.EmployeeName LIKE N'%' + @Search + N'%'
           OR v.EmployeeNumber LIKE N'%' + @Search + N'%' OR v.LocationName LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT v.AccessRequestId, v.RequestNumber, v.EmployeeId, v.EmployeeName, v.EmployeeNumber, v.AccessType, v.BuildingLocationId,
           v.BuildingLocationName, v.DurationCode, v.LocationId, v.LocationName, v.LocationCode,
           v.IsRestricted, v.RequesterUserId, v.RequesterName, v.BusinessJustification, v.ValidFromUtc, v.ValidToUtc, v.Status, v.CurrentStage,
           v.CurrentApproverNames, v.SubmittedAtUtc, v.CreatedAtUtc, v.UpdatedAtUtc, v.Version
    FROM dbo.vw_AccessRequests v JOIN #f f ON f.AccessRequestId = v.AccessRequestId
    ORDER BY
        CASE WHEN @Asc = 1 AND @SortBy = N'requestNumber' THEN v.RequestNumber END ASC,
        CASE WHEN @Asc = 0 AND @SortBy = N'requestNumber' THEN v.RequestNumber END DESC,
        CASE WHEN @Asc = 1 AND @SortBy = N'status' THEN v.Status END ASC,
        CASE WHEN @Asc = 0 AND @SortBy = N'status' THEN v.Status END DESC,
        CASE WHEN @Asc = 1 AND @SortBy = N'employeeName' THEN v.EmployeeName END ASC,
        CASE WHEN @Asc = 0 AND @SortBy = N'employeeName' THEN v.EmployeeName END DESC,
        CASE WHEN @Asc = 1 AND ISNULL(@SortBy, N'') NOT IN (N'requestNumber', N'status', N'employeeName') THEN v.CreatedAtUtc END ASC,
        CASE WHEN @Asc = 0 AND ISNULL(@SortBy, N'') NOT IN (N'requestNumber', N'status', N'employeeName') THEN v.CreatedAtUtc END DESC,
        v.AccessRequestId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- RS1: request + action flags; RS2: approvals (current cycle plus decided rows of earlier cycles).
CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectAccessRequestDetail
    @ActorUserId     INT,
    @AccessRequestId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IsOwner BIT, @Status NVARCHAR(20), @LocId INT, @Requester INT, @EmpUser INT, @Cycle INT, @Stage NVARCHAR(20);
    SELECT @Status = v.Status, @LocId = v.LocationId, @Requester = v.RequesterUserId, @EmpUser = v.EmployeeUserId, @Cycle = v.Cycle, @Stage = v.CurrentStage
    FROM dbo.vw_AccessRequests v WHERE v.AccessRequestId = @AccessRequestId;
    SET @IsOwner = CASE WHEN @Requester = @ActorUserId OR @EmpUser = @ActorUserId THEN 1 ELSE 0 END;

    DECLARE @CanDecide BIT = CASE WHEN @Status = N'PendingApproval' AND EXISTS (
        SELECT 1 FROM dbo.AccessRequestApprovals a JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId
        WHERE a.AccessRequestId = @AccessRequestId AND a.Cycle = @Cycle AND a.Stage = @Stage AND a.Decision = N'Pending' AND x.UserId = @ActorUserId)
        THEN 1 ELSE 0 END;
    DECLARE @CanProvision BIT = CASE WHEN @Status = N'Approved' AND @IsOwner = 0
        AND dbo.fn_HasPermission(@ActorUserId, N'Permissions.Provision') = 1 AND dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 1 THEN 1 ELSE 0 END;

    SELECT v.AccessRequestId, v.RequestNumber, v.EmployeeId, v.EmployeeName, v.EmployeeNumber, v.AccessType, v.BuildingLocationId,
           v.BuildingLocationName, v.DurationCode, v.LocationId, v.LocationName, v.LocationCode,
           v.IsRestricted, v.RequesterUserId, v.RequesterName, v.BusinessJustification, v.ValidFromUtc, v.ValidToUtc, v.Status, v.CurrentStage,
           v.CurrentApproverNames, v.SubmittedAtUtc, v.CreatedAtUtc, v.UpdatedAtUtc, v.Version,
           ap.PermissionId, ap.Status AS PermissionStatus,
           CAST(CASE WHEN @IsOwner = 1 AND v.Status IN (N'Draft', N'Returned') THEN 1 ELSE 0 END AS BIT) AS CanEdit,
           CAST(CASE WHEN @IsOwner = 1 AND v.Status IN (N'Draft', N'Returned') THEN 1 ELSE 0 END AS BIT) AS CanSubmit,
           CAST(CASE WHEN @IsOwner = 1 AND v.Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved') THEN 1 ELSE 0 END AS BIT) AS CanCancel,
           @CanDecide AS CanDecide,
           @CanProvision AS CanProvision
    FROM dbo.vw_AccessRequests v
    LEFT JOIN dbo.vw_AccessPermissions ap ON ap.AccessRequestId = v.AccessRequestId
    WHERE v.AccessRequestId = @AccessRequestId;

    SELECT a.ApprovalId, a.Stage, a.StageOrder,
           (SELECT STRING_AGG(u.DisplayName, N', ') WITHIN GROUP (ORDER BY u.DisplayName)
            FROM dbo.AccessRequestApprovalAssignees x JOIN dbo.Users u ON u.UserId = x.UserId WHERE x.ApprovalId = a.ApprovalId) AS AssignedToNames,
           du.DisplayName AS DecidedByName, a.Decision, a.Comments, a.DecidedAtUtc
    FROM dbo.AccessRequestApprovals a
    LEFT JOIN dbo.Users du ON du.UserId = a.DecidedByUserId
    WHERE a.AccessRequestId = @AccessRequestId
      AND (a.Cycle = @Cycle OR a.Decision IN (N'Approved', N'Returned', N'Rejected'))
    ORDER BY a.Cycle, a.StageOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Get
    @ActorUserId     INT,
    @AccessRequestId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleAccessRequests(@ActorUserId) WHERE AccessRequestId = @AccessRequestId)
        THROW 50404, N'Access request not found.', 1;
    EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @AccessRequestId;
END
GO

/*------------------------------ Mutations ---------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Internal_ValidateAccessWindow
    @ValidFromUtc DATETIME2(3),
    @ValidToUtc   DATETIME2(3),
    @DurationCode NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @ValidFromUtc IS NULL OR @ValidToUtc IS NULL THROW 50400, N'Valid-from and valid-to are required.', 1;
    IF @ValidToUtc <= @ValidFromUtc THROW 50400, N'Valid-to must be after valid-from.', 1;
    IF @ValidToUtc <= SYSUTCDATETIME() THROW 50400, N'Valid-to must be in the future.', 1;
    DECLARE @MaxDays INT = CASE WHEN @DurationCode = N'Permanent' THEN 3653 ELSE dbo.fn_SettingInt(N'AccessRequest.MaxValidityDays', 365) END;
    IF DATEDIFF(DAY, @ValidFromUtc, @ValidToUtc) > @MaxDays
    BEGIN
        DECLARE @Msg NVARCHAR(200) = CONCAT(N'The access window cannot exceed ', @MaxDays, N' days.');
        THROW 50400, @Msg, 1;
    END
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SubmitAccessRequest
    @ActorUserId     INT,
    @AccessRequestId BIGINT,
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Cycle INT, @Number NVARCHAR(20), @From DATETIME2(3), @To DATETIME2(3), @EmpStatus NVARCHAR(20), @OldStatus NVARCHAR(20), @AccessType NVARCHAR(20), @DurationCode NVARCHAR(20);
    SELECT @Cycle = ar.Cycle + 1, @Number = ar.RequestNumber, @From = ar.ValidFromUtc, @To = ar.ValidToUtc,
           @EmpStatus = e.EmploymentStatus, @OldStatus = ar.Status, @AccessType = ar.AccessType, @DurationCode = ar.DurationCode
    FROM dbo.AccessRequests ar JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId WHERE ar.AccessRequestId = @AccessRequestId;
    IF @EmpStatus <> N'Active' THROW 50422, N'Access cannot be requested for an inactive or exited employee.', 1;
    EXEC dbo.usp_Internal_ValidateAccessWindow @From, @To, @DurationCode;

    UPDATE dbo.AccessRequests SET Status = N'PendingApproval', CurrentStage = N'Manager', Cycle = @Cycle, SubmittedAtUtc = SYSUTCDATETIME(),
           DecidedAtUtc = NULL, UpdatedAtUtc = SYSUTCDATETIME()
    WHERE AccessRequestId = @AccessRequestId;
    DECLARE @SecurityStage NVARCHAR(20) = CASE @AccessType WHEN N'WingFloor' THEN N'Security' ELSE N'SecurityHead' END;
    INSERT dbo.AccessRequestApprovals (AccessRequestId, Cycle, Stage, StageOrder)
    VALUES (@AccessRequestId, @Cycle, N'Manager', 1), (@AccessRequestId, @Cycle, @SecurityStage, 2), (@AccessRequestId, @Cycle, N'AccessControl', 3);
    EXEC dbo.usp_Internal_AssignApprovers @AccessRequestId, N'Manager', @ActorUserId;

    DECLARE @Summary NVARCHAR(500) = CONCAT(N'Access request ', @Number, N' submitted (cycle ', @Cycle, N'); awaiting Manager approval.');
    DECLARE @Before NVARCHAR(MAX) = (SELECT @OldStatus AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, N'AccessRequest.Submitted', N'AccessRequest', @AccessRequestId, @Summary, @Before,
         N'{"status":"PendingApproval","currentStage":"Manager"}', NULL, @CorrelationId, @IpAddress;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Create
    @ActorUserId           INT,
    @EmployeeId            INT = NULL,
    @AccessType             NVARCHAR(20),
    @BuildingLocationId     INT,
    @LocationId            INT,
    @DurationCode           NVARCHAR(20),
    @BusinessJustification NVARCHAR(1000),
    @ValidFromUtc          DATETIME2(3) = NULL,
    @ValidToUtc            DATETIME2(3) = NULL,
    @CorrelationId         UNIQUEIDENTIFIER = NULL,
    @IpAddress             VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @BusinessJustification = NULLIF(LTRIM(RTRIM(@BusinessJustification)), N'');
        IF @BusinessJustification IS NULL THROW 50400, N'A business justification is required.', 1;
        IF @AccessType NOT IN (N'Building', N'WingFloor') THROW 50400, N'Invalid accessType.', 1;
        IF @DurationCode NOT IN (N'OneWeek',N'OneMonth',N'ThreeMonths',N'SixMonths',N'OneYear',N'Permanent',N'Custom')
            THROW 50400, N'Invalid durationCode.', 1;
        DECLARE @Now DATETIME2(3) = SYSUTCDATETIME(), @EffectiveFrom DATETIME2(3) = COALESCE(@ValidFromUtc, SYSUTCDATETIME()),
                @EffectiveTo DATETIME2(3);
        IF @EffectiveFrom < DATEADD(MINUTE, -5, @Now) THROW 50400, N'validFromUtc cannot be earlier than five minutes ago.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @BuildingLocationId AND LocationType = N'Building' AND IsActive = 1)
            THROW 50400, N'buildingLocationId must identify an active building.', 1;
        IF @AccessType = N'Building' AND @LocationId <> @BuildingLocationId
            THROW 50400, N'For Building access, locationId must equal buildingLocationId.', 1;
        IF @AccessType = N'WingFloor' AND (@LocationId = @BuildingLocationId OR NOT EXISTS
            (SELECT 1 FROM dbo.fn_LocationDescendants(@BuildingLocationId) d JOIN dbo.Locations l ON l.LocationId = d.LocationId
             WHERE d.LocationId = @LocationId AND l.LocationType IN (N'Floor',N'Wing',N'Zone') AND l.IsActive = 1))
            THROW 50400, N'WingFloor location must be an active Floor, Wing or Zone within the selected building.', 1;
        IF @DurationCode = N'Custom'
        BEGIN
            SET @EffectiveTo = @ValidToUtc;
            IF @EffectiveTo IS NULL OR @EffectiveTo <= @EffectiveFrom OR @EffectiveTo > DATEADD(YEAR, 1, @EffectiveFrom)
                THROW 50400, N'Custom validToUtc must be after validFromUtc and no more than one year later.', 1;
        END
        ELSE
            SET @EffectiveTo = CASE @DurationCode WHEN N'OneWeek' THEN DATEADD(DAY,7,@EffectiveFrom)
                WHEN N'OneMonth' THEN DATEADD(MONTH,1,@EffectiveFrom) WHEN N'ThreeMonths' THEN DATEADD(MONTH,3,@EffectiveFrom)
                WHEN N'SixMonths' THEN DATEADD(MONTH,6,@EffectiveFrom) WHEN N'OneYear' THEN DATEADD(YEAR,1,@EffectiveFrom)
                ELSE DATEADD(YEAR,10,@EffectiveFrom) END;

        DECLARE @EmpStatus NVARCHAR(20), @EmpUser INT, @MgrUser INT, @EmpLoc INT;
        IF @EmployeeId IS NULL SELECT @EmployeeId = EmployeeId FROM dbo.Employees WHERE UserId = @ActorUserId;
        SELECT @EmpStatus = e.EmploymentStatus, @EmpUser = e.UserId, @MgrUser = m.UserId, @EmpLoc = e.LocationId
        FROM dbo.Employees e LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId WHERE e.EmployeeId = @EmployeeId;
        IF @EmpStatus IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.fn_OperationalEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;
        IF NOT (ISNULL(@EmpUser, -1) = @ActorUserId OR ISNULL(@MgrUser, -1) = @ActorUserId
                OR (dbo.fn_HasPermission(@ActorUserId, N'Employees.Manage') = 1 AND dbo.fn_UserCanAccessLocation(@ActorUserId, @EmpLoc) = 1))
            THROW 50403, N'You can request access only for yourself or your direct reports.', 1;
        IF @EmpStatus <> N'Active' THROW 50422, N'Access cannot be requested for an inactive or exited employee.', 1;
        IF @EmpUser <> @ActorUserId AND NOT (ISNULL(@MgrUser, -1) = @ActorUserId
            OR dbo.fn_HasPermission(@ActorUserId, N'Employees.Manage') = 1)
            THROW 50403, N'You can request access only for yourself or authorized direct reports.', 1;

        BEGIN TRAN;
        -- Access to an inner area includes passage through its parents, so the target or any location inside it counts.
        IF EXISTS (SELECT 1 FROM dbo.AccessRequests WITH (UPDLOCK, HOLDLOCK)
                   WHERE EmployeeId = @EmployeeId AND LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId))
                     AND Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved'))
            THROW 50409, N'An open access request already exists for this location or an area inside it.', 1;
        -- Renewal is allowed only in the final 7 days of the current access.
        IF EXISTS (SELECT 1 FROM dbo.AccessPermissions
                   WHERE EmployeeId = @EmployeeId AND LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId))
                     AND Status = N'Active' AND ValidToUtc > DATEADD(DAY, 7, @Now))
            THROW 50409, N'This employee already has active access to this location (or to an area inside it, which includes this location). You can request a renewal in the last 7 days before it expires.', 1;

        DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_AccessRequestNumber;
        DECLARE @Number NVARCHAR(20) = CONCAT(N'EAW-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'000000', @Seq), 6));
        INSERT dbo.AccessRequests (RequestNumber, EmployeeId, LocationId, RequesterUserId, BusinessJustification,
            ValidFromUtc, ValidToUtc, Status, AccessType, BuildingLocationId, DurationCode)
        VALUES (@Number, @EmployeeId, @LocationId, @ActorUserId, @BusinessJustification,
            @EffectiveFrom, @EffectiveTo, N'Draft', @AccessType, @BuildingLocationId, @DurationCode);
        DECLARE @Id BIGINT = SCOPE_IDENTITY();

        DECLARE @After NVARCHAR(MAX) = (SELECT AccessRequestId, RequestNumber, EmployeeNumber, LocationName, ValidFromUtc, ValidToUtc, Status
                                        FROM dbo.vw_AccessRequests WHERE AccessRequestId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Access request ', @Number, N' created.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'AccessRequest.Created', N'AccessRequest', @Id, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;

        EXEC dbo.usp_Internal_SubmitAccessRequest @ActorUserId, @Id, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_AssertAccessRequestOwner
    @ActorUserId     INT,
    @AccessRequestId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleAccessRequests(@ActorUserId) WHERE AccessRequestId = @AccessRequestId)
        THROW 50404, N'Access request not found.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.vw_AccessRequests WHERE AccessRequestId = @AccessRequestId
                   AND (RequesterUserId = @ActorUserId OR EmployeeUserId = @ActorUserId))
        THROW 50403, N'Only the requester or the employee can change this request.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Update
    @ActorUserId           INT,
    @AccessRequestId       BIGINT,
    @AccessType            NVARCHAR(20),
    @BuildingLocationId    INT,
    @LocationId            INT,
    @DurationCode          NVARCHAR(20),
    @BusinessJustification NVARCHAR(1000),
    @ValidFromUtc          DATETIME2(3) = NULL,
    @ValidToUtc            DATETIME2(3) = NULL,
    @Version               BINARY(8),
    @CorrelationId         UNIQUEIDENTIFIER = NULL,
    @IpAddress             VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @BusinessJustification = NULLIF(LTRIM(RTRIM(@BusinessJustification)), N'');
        IF @BusinessJustification IS NULL THROW 50400, N'A business justification is required.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        IF @AccessType NOT IN (N'Building', N'WingFloor') THROW 50400, N'Invalid accessType.', 1;
        IF @DurationCode NOT IN (N'OneWeek',N'OneMonth',N'ThreeMonths',N'SixMonths',N'OneYear',N'Permanent',N'Custom')
            THROW 50400, N'Invalid durationCode.', 1;
        DECLARE @Now DATETIME2(3) = SYSUTCDATETIME(), @EffectiveFrom DATETIME2(3) = COALESCE(@ValidFromUtc, SYSUTCDATETIME()),
                @EffectiveTo DATETIME2(3);
        IF @EffectiveFrom < DATEADD(MINUTE, -5, @Now) THROW 50400, N'validFromUtc cannot be earlier than five minutes ago.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @BuildingLocationId AND LocationType = N'Building' AND IsActive = 1)
            THROW 50400, N'buildingLocationId must identify an active building.', 1;
        IF @AccessType = N'Building' AND @LocationId <> @BuildingLocationId THROW 50400, N'For Building access, locationId must equal buildingLocationId.', 1;
        IF @AccessType = N'WingFloor' AND (@LocationId = @BuildingLocationId OR NOT EXISTS
            (SELECT 1 FROM dbo.fn_LocationDescendants(@BuildingLocationId) d JOIN dbo.Locations l ON l.LocationId = d.LocationId
             WHERE d.LocationId = @LocationId AND l.LocationType IN (N'Floor',N'Wing',N'Zone') AND l.IsActive = 1))
            THROW 50400, N'WingFloor location must be an active Floor, Wing or Zone within the selected building.', 1;
        IF @DurationCode = N'Custom'
        BEGIN
            SET @EffectiveTo = @ValidToUtc;
            IF @EffectiveTo IS NULL OR @EffectiveTo <= @EffectiveFrom OR @EffectiveTo > DATEADD(YEAR,1,@EffectiveFrom)
                THROW 50400, N'Custom validToUtc must be after validFromUtc and no more than one year later.', 1;
        END
        ELSE
            SET @EffectiveTo = CASE @DurationCode WHEN N'OneWeek' THEN DATEADD(DAY,7,@EffectiveFrom)
                WHEN N'OneMonth' THEN DATEADD(MONTH,1,@EffectiveFrom) WHEN N'ThreeMonths' THEN DATEADD(MONTH,3,@EffectiveFrom)
                WHEN N'SixMonths' THEN DATEADD(MONTH,6,@EffectiveFrom) WHEN N'OneYear' THEN DATEADD(YEAR,1,@EffectiveFrom)
                ELSE DATEADD(YEAR,10,@EffectiveFrom) END;
        EXEC dbo.usp_Internal_AssertAccessRequestOwner @ActorUserId, @AccessRequestId;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @EmpId INT, @Number NVARCHAR(20);
        SELECT @Status = Status, @Ver = Version, @EmpId = EmployeeId, @Number = RequestNumber FROM dbo.AccessRequests WITH (UPDLOCK) WHERE AccessRequestId = @AccessRequestId;
        IF @Ver <> @Version THROW 50409, N'The request was changed by someone else. Reload and try again.', 1;
        IF @Status NOT IN (N'Draft', N'Returned') THROW 50409, N'Only draft or returned requests can be edited.', 1;
        IF EXISTS (SELECT 1 FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND AccessRequestId <> @AccessRequestId
                   AND LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId))
                   AND Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved'))
            THROW 50409, N'An open access request already exists for this location or an area inside it.', 1;
        IF EXISTS (SELECT 1 FROM dbo.AccessPermissions
                   WHERE EmployeeId = @EmpId AND LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId))
                     AND Status = N'Active' AND ValidToUtc > DATEADD(DAY, 7, @Now))
            THROW 50409, N'This employee already has active access to this location (or to an area inside it, which includes this location). You can request a renewal in the last 7 days before it expires.', 1;

        DECLARE @Before NVARCHAR(MAX) = (SELECT LocationName, BusinessJustification, ValidFromUtc, ValidToUtc FROM dbo.vw_AccessRequests
                                         WHERE AccessRequestId = @AccessRequestId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE dbo.AccessRequests SET AccessType = @AccessType, BuildingLocationId = @BuildingLocationId, LocationId = @LocationId,
               DurationCode = @DurationCode, BusinessJustification = @BusinessJustification, ValidFromUtc = @EffectiveFrom,
               ValidToUtc = @EffectiveTo, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE AccessRequestId = @AccessRequestId AND Version = @Version;
        IF @@ROWCOUNT = 0 THROW 50409, N'The request was changed by someone else. Reload and try again.', 1;
        DECLARE @After NVARCHAR(MAX) = (SELECT LocationName, BusinessJustification, ValidFromUtc, ValidToUtc FROM dbo.vw_AccessRequests
                                        WHERE AccessRequestId = @AccessRequestId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Access request ', @Number, N' updated.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'AccessRequest.Updated', N'AccessRequest', @AccessRequestId, @Summary, @Before, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @AccessRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Submit
    @ActorUserId     INT,
    @AccessRequestId BIGINT,
    @Version         BINARY(8),
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertAccessRequestOwner @ActorUserId, @AccessRequestId;
        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8);
        SELECT @Status = Status, @Ver = Version FROM dbo.AccessRequests WITH (UPDLOCK) WHERE AccessRequestId = @AccessRequestId;
        IF @Ver <> @Version THROW 50409, N'The request was changed by someone else. Reload and try again.', 1;
        IF @Status NOT IN (N'Draft', N'Returned') THROW 50409, N'Only draft or returned requests can be submitted.', 1;
        EXEC dbo.usp_Internal_SubmitAccessRequest @ActorUserId, @AccessRequestId, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @AccessRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessRequest_Cancel
    @ActorUserId     INT,
    @AccessRequestId BIGINT,
    @Reason          NVARCHAR(500),
    @Version         BINARY(8),
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A cancellation reason is required.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertAccessRequestOwner @ActorUserId, @AccessRequestId;
        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @Number NVARCHAR(20), @Cycle INT;
        SELECT @Status = Status, @Ver = Version, @Number = RequestNumber, @Cycle = Cycle FROM dbo.AccessRequests WITH (UPDLOCK) WHERE AccessRequestId = @AccessRequestId;
        IF @Ver <> @Version THROW 50409, N'The request was changed by someone else. Reload and try again.', 1;
        IF @Status NOT IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved')
            THROW 50409, N'The request can no longer be cancelled.', 1;

        -- Assignees of the pending stage are told the task is gone.
        INSERT dbo.Notifications (UserId, Type, Title, Message, RelatedEntityType, RelatedEntityId, Route)
        SELECT x.UserId, N'AccessRequestCancelled', CONCAT(N'Request ', @Number, N' cancelled'), CONCAT(N'Access request ', @Number, N' was cancelled by the requester.'),
               N'AccessRequest', CAST(@AccessRequestId AS NVARCHAR(60)), CONCAT(N'/access-requests/', @AccessRequestId)
        FROM dbo.AccessRequestApprovals a JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId
        WHERE a.AccessRequestId = @AccessRequestId AND a.Cycle = @Cycle AND a.Decision = N'Pending' AND x.UserId <> @ActorUserId
          AND @Status = N'PendingApproval';

        UPDATE dbo.AccessRequestApprovals SET Decision = N'Skipped' WHERE AccessRequestId = @AccessRequestId AND Decision = N'Pending';
        UPDATE dbo.AccessRequests SET Status = N'Cancelled', CurrentStage = NULL, CancelReason = @Reason, DecidedAtUtc = SYSUTCDATETIME(),
               UpdatedAtUtc = SYSUTCDATETIME()
        WHERE AccessRequestId = @AccessRequestId;
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Access request ', @Number, N' cancelled.');
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'AccessRequest.Cancelled', N'AccessRequest', @AccessRequestId, @Summary, @Before, N'{"status":"Cancelled"}',
             @Reason, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @AccessRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------------ Approvals ---------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Approval_Pending
    @ActorUserId INT,
    @Search      NVARCHAR(200) = NULL,
    @Stage       NVARCHAR(20) = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Stage IS NOT NULL AND @Stage NOT IN (N'Manager',N'SecurityHead',N'Security',N'AccessControl')
        THROW 50400, N'Invalid approval stage.', 1;
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    CREATE TABLE #f (AccessRequestId BIGINT PRIMARY KEY, Stage NVARCHAR(20), AssignedAtUtc DATETIME2(3));
    INSERT #f
    SELECT ar.AccessRequestId, a.Stage, a.AssignedAtUtc
    FROM dbo.AccessRequests ar
    JOIN dbo.AccessRequestApprovals a ON a.AccessRequestId = ar.AccessRequestId AND a.Cycle = ar.Cycle AND a.Stage = ar.CurrentStage AND a.Decision = N'Pending'
    JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId AND x.UserId = @ActorUserId
    WHERE ar.Status = N'PendingApproval';
    DELETE #f WHERE @Stage IS NOT NULL AND Stage <> @Stage;

    SELECT COUNT(*) AS TotalCount FROM #f f JOIN dbo.vw_AccessRequests v ON v.AccessRequestId = f.AccessRequestId
    WHERE (@Search IS NULL OR v.RequestNumber LIKE N'%' + @Search + N'%' OR v.EmployeeName LIKE N'%' + @Search + N'%');

    SELECT v.AccessRequestId, v.RequestNumber, v.EmployeeName, v.EmployeeNumber, v.AccessType, v.BuildingLocationName,
           v.LocationName, v.IsRestricted, v.DurationCode, f.Stage,
           v.BusinessJustification, v.ValidFromUtc, v.ValidToUtc, v.SubmittedAtUtc,
           CAST(DATEDIFF(MINUTE, ISNULL(f.AssignedAtUtc, v.SubmittedAtUtc), SYSUTCDATETIME()) / 60.0 AS DECIMAL(10, 1)) AS AgeHours,
           v.Version
    FROM #f f JOIN dbo.vw_AccessRequests v ON v.AccessRequestId = f.AccessRequestId
    WHERE (@Search IS NULL OR v.RequestNumber LIKE N'%' + @Search + N'%' OR v.EmployeeName LIKE N'%' + @Search + N'%')
    ORDER BY v.SubmittedAtUtc, v.AccessRequestId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Approval_Decide
    @ActorUserId     INT,
    @AccessRequestId BIGINT,
    @Decision        NVARCHAR(20),
    @Comments        NVARCHAR(1000) = NULL,
    @Version         BINARY(8),
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Comments = NULLIF(LTRIM(RTRIM(@Comments)), N'');
        IF @Decision NOT IN (N'Approve', N'Return', N'Reject') THROW 50400, N'Decision must be Approve, Return or Reject.', 1;
        IF @Decision IN (N'Return', N'Reject') AND @Comments IS NULL THROW 50400, N'Comments are required to return or reject a request.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.AccessRequests WHERE AccessRequestId = @AccessRequestId)
            THROW 50404, N'Access request not found.', 1;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @Stage NVARCHAR(20), @Cycle INT, @Number NVARCHAR(20), @Requester INT, @EmpUser INT, @LocId INT, @AccessType NVARCHAR(20);
        SELECT @Status = ar.Status, @Ver = ar.Version, @Stage = ar.CurrentStage, @Cycle = ar.Cycle, @Number = ar.RequestNumber,
               @Requester = ar.RequesterUserId, @EmpUser = e.UserId, @LocId = ar.LocationId, @AccessType = ar.AccessType
        FROM dbo.AccessRequests ar WITH (UPDLOCK) JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId
        WHERE ar.AccessRequestId = @AccessRequestId;
        IF @Status <> N'PendingApproval' THROW 50409, N'The request is not pending approval.', 1;
        IF @Ver <> @Version THROW 50409, N'The request was changed by someone else (it may already have been decided). Reload and try again.', 1;
        IF @ActorUserId = @Requester OR @ActorUserId = ISNULL(@EmpUser, -1)
            THROW 50403, N'You cannot approve your own access request.', 1;

        DECLARE @ApprovalId BIGINT;
        SELECT @ApprovalId = a.ApprovalId FROM dbo.AccessRequestApprovals a
        WHERE a.AccessRequestId = @AccessRequestId AND a.Cycle = @Cycle AND a.Stage = @Stage AND a.Decision = N'Pending';
        IF @ApprovalId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.AccessRequestApprovalAssignees WHERE ApprovalId = @ApprovalId AND UserId = @ActorUserId)
            THROW 50403, N'You are not an approver for the current stage of this request.', 1;
        IF EXISTS (SELECT 1 FROM dbo.AccessRequestApprovals WHERE AccessRequestId = @AccessRequestId AND Cycle = @Cycle AND DecidedByUserId = @ActorUserId)
            THROW 50403, N'You already approved an earlier stage of this request.', 1;

        DECLARE @RowDecision NVARCHAR(20) = CASE @Decision WHEN N'Approve' THEN N'Approved' WHEN N'Return' THEN N'Returned' ELSE N'Rejected' END;
        UPDATE dbo.AccessRequestApprovals SET Decision = @RowDecision, DecidedByUserId = @ActorUserId, Comments = @Comments, DecidedAtUtc = SYSUTCDATETIME()
        WHERE ApprovalId = @ApprovalId;

        DECLARE @NextStage NVARCHAR(20) = CASE WHEN @Decision = N'Approve' THEN
            CASE WHEN @Stage = N'Manager' THEN CASE @AccessType WHEN N'WingFloor' THEN N'Security' ELSE N'SecurityHead' END
                 WHEN @Stage IN (N'Security', N'SecurityHead') THEN N'AccessControl' END END;
        DECLARE @NewStatus NVARCHAR(20), @Summary NVARCHAR(500), @Route NVARCHAR(200) = CONCAT(N'/access-requests/', @AccessRequestId);
        IF @Decision = N'Approve' AND @NextStage IS NOT NULL
        BEGIN
            SET @NewStatus = N'PendingApproval';
            UPDATE dbo.AccessRequests SET CurrentStage = @NextStage, UpdatedAtUtc = SYSUTCDATETIME() WHERE AccessRequestId = @AccessRequestId;
            EXEC dbo.usp_Internal_AssignApprovers @AccessRequestId, @NextStage, @ActorUserId;
            SET @Summary = CONCAT(N'Access request ', @Number, N': ', @Stage, N' approved; awaiting ', @NextStage, N'.');
        END
        ELSE IF @Decision = N'Approve'
        BEGIN
            SET @NewStatus = N'Approved';
            UPDATE dbo.AccessRequests SET Status = N'Approved', CurrentStage = NULL, DecidedAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME()
            WHERE AccessRequestId = @AccessRequestId;
            SET @Summary = CONCAT(N'Access request ', @Number, N' fully approved; ready for provisioning.');
            EXEC dbo.usp_Notification_CreateForRole N'AccessControlTeam', @LocId, N'ProvisioningRequired', N'Access ready to provision', @Summary,
                 N'AccessRequest', @AccessRequestId, @Route, @ActorUserId;
        END
        ELSE
        BEGIN
            SET @NewStatus = @RowDecision;
            UPDATE dbo.AccessRequestApprovals SET Decision = N'Skipped' WHERE AccessRequestId = @AccessRequestId AND Cycle = @Cycle AND Decision = N'Pending';
            UPDATE dbo.AccessRequests SET Status = @NewStatus, CurrentStage = NULL, DecidedAtUtc = CASE WHEN @NewStatus = N'Rejected' THEN SYSUTCDATETIME() END,
                   UpdatedAtUtc = SYSUTCDATETIME()
            WHERE AccessRequestId = @AccessRequestId;
            SET @Summary = CONCAT(N'Access request ', @Number, N' ', LOWER(@NewStatus), N' at ', @Stage, N' stage.');
        END

        DECLARE @Action NVARCHAR(100) = CONCAT(N'AccessRequest.', @RowDecision);
        DECLARE @Before NVARCHAR(MAX) = (SELECT N'PendingApproval' AS status, @Stage AS currentStage FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT @NewStatus AS status, @NextStage AS currentStage, @Stage AS decidedStage FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'AccessRequest', @AccessRequestId, @Summary, @Before, @After, @Comments, @CorrelationId, @IpAddress;
        DECLARE @Title NVARCHAR(200) = CONCAT(N'Request ', @Number, N' ', LOWER(@RowDecision));
        EXEC dbo.usp_Notification_Create @Requester, N'AccessRequestDecision', @Title, @Summary, N'AccessRequest', @AccessRequestId, @Route, @ActorUserId;
        IF ISNULL(@EmpUser, -1) <> @Requester
            EXEC dbo.usp_Notification_Create @EmpUser, N'AccessRequestDecision', @Title, @Summary, N'AccessRequest', @AccessRequestId, @Route, @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectAccessRequestDetail @ActorUserId, @AccessRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*----------------------------- Permissions --------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Permission_Search
    @ActorUserId        INT,
    @Status             NVARCHAR(20) = NULL,
    @LocationId         INT = NULL,
    @EmployeeId         INT = NULL,
    @ExpiringWithinDays INT = NULL,
    @Search             NVARCHAR(200) = NULL,
    @Page               INT = 1,
    @PageSize           INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();

    CREATE TABLE #f (PermissionId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT p.PermissionId
    FROM dbo.vw_AccessPermissions p
    WHERE (p.EmployeeId IN (SELECT EmployeeId FROM dbo.fn_OperationalEmployees(@ActorUserId))
           OR p.LocationId IN (SELECT LocationId FROM dbo.fn_UserLocationScope(@ActorUserId)))
      AND (@Status IS NULL OR p.Status = @Status)
      AND (@LocationId IS NULL OR p.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@EmployeeId IS NULL OR p.EmployeeId = @EmployeeId)
      AND (@ExpiringWithinDays IS NULL OR (p.Status = N'Active' AND p.ValidToUtc <= DATEADD(DAY, @ExpiringWithinDays, @Now)))
      AND (@Search IS NULL OR p.EmployeeName LIKE N'%' + @Search + N'%' OR p.EmployeeNumber LIKE N'%' + @Search + N'%'
           OR p.LocationName LIKE N'%' + @Search + N'%' OR p.RequestNumber LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT p.PermissionId, p.EmployeeId, p.EmployeeName, p.EmployeeNumber, p.LocationId, p.LocationName, p.AccessRequestId, p.RequestNumber,
           p.ValidFromUtc, p.ValidToUtc, p.Status, p.ProvisionedByName, p.ProvisionedAtUtc, p.RevokedAtUtc, p.RevokeReason, p.ControllerSyncStatus
    FROM dbo.vw_AccessPermissions p JOIN #f f ON f.PermissionId = p.PermissionId
    ORDER BY CASE WHEN @ExpiringWithinDays IS NOT NULL THEN p.ValidToUtc END ASC, p.ProvisionedAtUtc DESC, p.PermissionId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectPermission
    @PermissionId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT PermissionId, EmployeeId, EmployeeName, EmployeeNumber, LocationId, LocationName, AccessRequestId, RequestNumber,
           ValidFromUtc, ValidToUtc, Status, ProvisionedByName, ProvisionedAtUtc, RevokedAtUtc, RevokeReason, ControllerSyncStatus
    FROM dbo.vw_AccessPermissions WHERE PermissionId = @PermissionId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Permission_Provision
    @ActorUserId     INT,
    @AccessRequestId BIGINT,
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.AccessRequests WHERE AccessRequestId = @AccessRequestId)
            THROW 50404, N'Access request not found.', 1;
        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @EmpId INT, @LocId INT, @From DATETIME2(3), @To DATETIME2(3), @Requester INT, @EmpUser INT,
                @EmpStatus NVARCHAR(20), @Number NVARCHAR(20);
        SELECT @Status = ar.Status, @EmpId = ar.EmployeeId, @LocId = ar.LocationId, @From = ar.ValidFromUtc, @To = ar.ValidToUtc,
               @Requester = ar.RequesterUserId, @EmpUser = e.UserId, @EmpStatus = e.EmploymentStatus, @Number = ar.RequestNumber
        FROM dbo.AccessRequests ar WITH (UPDLOCK) JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId
        WHERE ar.AccessRequestId = @AccessRequestId;
        IF @Status = N'Provisioned' THROW 50409, N'The request has already been provisioned.', 1;
        IF @Status <> N'Approved' THROW 50409, N'Only fully approved requests can be provisioned.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50403, N'The location is outside your facility scope.', 1;
        IF @ActorUserId = @Requester OR @ActorUserId = ISNULL(@EmpUser, -1) THROW 50403, N'You cannot provision your own access request.', 1;
        IF @EmpStatus <> N'Active' THROW 50422, N'Access cannot be provisioned for an inactive or exited employee.', 1;
        IF @To <= SYSUTCDATETIME() THROW 50422, N'The approved access window has already ended.', 1;

        INSERT dbo.AccessPermissions (EmployeeId, LocationId, AccessRequestId, ValidFromUtc, ValidToUtc, Status, ProvisionedByUserId)
        VALUES (@EmpId, @LocId, @AccessRequestId, @From, @To, N'Active', @ActorUserId);
        DECLARE @PermId BIGINT = SCOPE_IDENTITY();
        DECLARE @sync NVARCHAR(20);
        DECLARE @Payload NVARCHAR(MAX) = (SELECT @EmpId AS employeeId, @LocId AS locationId, @From AS validFromUtc, @To AS validToUtc FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Internal_ControllerCommand N'GrantPermission', N'AccessPermission', @PermId, @LocId, @Payload, @CorrelationId, @sync OUTPUT;
        UPDATE dbo.AccessPermissions SET ControllerSyncStatus = @sync WHERE PermissionId = @PermId;
        UPDATE dbo.AccessRequests SET Status = N'Provisioned', UpdatedAtUtc = SYSUTCDATETIME() WHERE AccessRequestId = @AccessRequestId;

        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Access request ', @Number, N' provisioned as permission #', @PermId, N'.');
        DECLARE @After NVARCHAR(MAX) = (SELECT PermissionId, EmployeeNumber, LocationName, ValidFromUtc, ValidToUtc, Status, ControllerSyncStatus
                                        FROM dbo.vw_AccessPermissions WHERE PermissionId = @PermId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Permission.Provisioned', N'AccessPermission', @PermId, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Audit_Write @ActorUserId, N'AccessRequest.Provisioned', N'AccessRequest', @AccessRequestId, @Summary,
             N'{"status":"Approved"}', N'{"status":"Provisioned"}', NULL, @CorrelationId, @IpAddress;
        DECLARE @Route NVARCHAR(200) = CONCAT(N'/access-requests/', @AccessRequestId);
        EXEC dbo.usp_Notification_Create @Requester, N'PermissionProvisioned', N'Access provisioned', @Summary, N'AccessRequest', @AccessRequestId, @Route, @ActorUserId;
        IF ISNULL(@EmpUser, -1) <> @Requester
            EXEC dbo.usp_Notification_Create @EmpUser, N'PermissionProvisioned', N'Access provisioned', @Summary, N'AccessRequest', @AccessRequestId, @Route, @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectPermission @PermId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Permission_Revoke
    @ActorUserId   INT,
    @PermissionId  BIGINT,
    @Reason        NVARCHAR(500),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A revocation reason is required.', 1;
        DECLARE @EmpId INT, @LocId INT;
        SELECT @EmpId = EmployeeId, @LocId = LocationId FROM dbo.AccessPermissions WHERE PermissionId = @PermissionId;
        IF @EmpId IS NULL OR NOT (@EmpId IN (SELECT EmployeeId FROM dbo.fn_OperationalEmployees(@ActorUserId))
                                  OR @LocId IN (SELECT LocationId FROM dbo.fn_UserLocationScope(@ActorUserId)))
            THROW 50404, N'Permission not found.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50403, N'The location is outside your facility scope.', 1;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20) = (SELECT Status FROM dbo.AccessPermissions WITH (UPDLOCK) WHERE PermissionId = @PermissionId);
        IF @Status NOT IN (N'Active', N'Suspended') THROW 50409, N'Only active or suspended permissions can be revoked.', 1;
        DECLARE @sync NVARCHAR(20);
        EXEC dbo.usp_Internal_ControllerCommand N'RevokePermission', N'AccessPermission', @PermissionId, @LocId, NULL, @CorrelationId, @sync OUTPUT;
        UPDATE dbo.AccessPermissions SET Status = N'Revoked', RevokedByUserId = @ActorUserId, RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = @Reason,
               ControllerSyncStatus = @sync
        WHERE PermissionId = @PermissionId;

        DECLARE @Summary NVARCHAR(500) = (SELECT CONCAT(N'Permission #', PermissionId, N' for ', EmployeeName, N' at ', LocationName, N' revoked.')
                                          FROM dbo.vw_AccessPermissions WHERE PermissionId = @PermissionId);
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Permission.Revoked', N'AccessPermission', @PermissionId, @Summary, @Before, N'{"status":"Revoked"}',
             @Reason, @CorrelationId, @IpAddress;
        DECLARE @EmpUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @EmpId);
        EXEC dbo.usp_Notification_Create @EmpUser, N'PermissionRevoked', N'Access permission revoked', @Summary, N'AccessPermission', @PermissionId, N'/permissions', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectPermission @PermissionId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Approval_TeamSearch
    @ActorUserId INT,
    @RequestKind NVARCHAR(20) = NULL,
    @Status NVARCHAR(20) = NULL,
    @Search NVARCHAR(200) = NULL,
    @Page INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF dbo.fn_HasPermission(@ActorUserId,N'Approvals.Team')=0
        THROW 50403,N'Team approval permission is required.',1;
    IF @RequestKind IS NOT NULL AND @RequestKind NOT IN (N'Card',N'Access')
        THROW 50400,N'requestKind must be Card or Access.',1;
    IF @Page<1 SET @Page=1;
    IF @PageSize<1 SET @PageSize=20;
    IF @PageSize>100 SET @PageSize=100;
    SET @Search=NULLIF(LTRIM(RTRIM(@Search)),N'');
    DECLARE @ActorEmployeeId INT=ISNULL((SELECT EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId),-1);
    CREATE TABLE #TeamRequests
    (
        RequestKind NVARCHAR(20) NOT NULL,
        RequestId BIGINT NOT NULL,
        RequestNumber NVARCHAR(30) NOT NULL,
        RequestType NVARCHAR(30) NOT NULL,
        EmployeeId INT NOT NULL,
        EmployeeName NVARCHAR(201) NOT NULL,
        EmployeeNumber NVARCHAR(30) NOT NULL,
        Status NVARCHAR(30) NOT NULL,
        CurrentStage NVARCHAR(30) NULL,
        SubmittedAtUtc DATETIME2(3) NULL,
        Route NVARCHAR(200) NOT NULL
    );
    INSERT #TeamRequests
    SELECT N'Card',cr.CardRequestId,cr.RequestNumber,cr.RequestType,e.EmployeeId,
           CONCAT(e.FirstName,N' ',e.LastName),e.EmployeeNumber,cr.Status,
           CASE cr.Status WHEN N'PendingManager' THEN N'Manager' WHEN N'PendingHR' THEN N'HR'
                WHEN N'PendingSecurity' THEN N'Security' WHEN N'PendingIdCardTeam' THEN N'IdCardTeam'
                WHEN N'Printing' THEN N'IdCardTeam' WHEN N'ReadyToIssue' THEN N'IdCardTeam' END,
           cr.RequestedAtUtc,CONCAT(N'/cards/requests/',cr.CardRequestId)
    FROM dbo.CardRequests cr
    JOIN dbo.Employees e ON e.EmployeeId=cr.EmployeeId
    WHERE e.ManagerEmployeeId=@ActorEmployeeId
      AND dbo.fn_UserCanAccessLocation(@ActorUserId,e.LocationId)=1
      AND (@RequestKind IS NULL OR @RequestKind=N'Card');
    INSERT #TeamRequests
    SELECT N'Access',ar.AccessRequestId,ar.RequestNumber,ar.AccessType,e.EmployeeId,
           CONCAT(e.FirstName,N' ',e.LastName),e.EmployeeNumber,ar.Status,ar.CurrentStage,
           ar.SubmittedAtUtc,CONCAT(N'/access-requests/',ar.AccessRequestId)
    FROM dbo.AccessRequests ar
    JOIN dbo.Employees e ON e.EmployeeId=ar.EmployeeId
    WHERE e.ManagerEmployeeId=@ActorEmployeeId
      AND dbo.fn_UserCanAccessLocation(@ActorUserId,e.LocationId)=1
      AND (@RequestKind IS NULL OR @RequestKind=N'Access');
    SELECT COUNT(*) AS TotalCount
    FROM #TeamRequests t
    WHERE (@Status IS NULL OR t.Status=@Status)
      AND (@Search IS NULL OR t.RequestNumber LIKE N'%'+@Search+N'%'
           OR t.EmployeeName LIKE N'%'+@Search+N'%' OR t.EmployeeNumber LIKE N'%'+@Search+N'%');
    SELECT t.RequestKind,t.RequestId,t.RequestNumber,t.RequestType,t.EmployeeId,t.EmployeeName,t.EmployeeNumber,
           t.Status,t.CurrentStage,t.SubmittedAtUtc,t.Route
    FROM #TeamRequests t
    WHERE (@Status IS NULL OR t.Status=@Status)
      AND (@Search IS NULL OR t.RequestNumber LIKE N'%'+@Search+N'%'
           OR t.EmployeeName LIKE N'%'+@Search+N'%' OR t.EmployeeNumber LIKE N'%'+@Search+N'%')
    ORDER BY t.SubmittedAtUtc DESC,t.RequestId DESC
    OFFSET (@Page-1)*@PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO
