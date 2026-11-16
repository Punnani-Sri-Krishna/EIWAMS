/*=====================================================================
  EIWAMS - 05_SP_Cards.sql
  RFID card lifecycle (issue, activate, block, report lost, replace,
  deactivate) and card requests. BR-02 unique UID, BR-03 lost card
  blocks immediately, one active permanent card per employee.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Employees whose cards the user may see: self/team, or in scope with a card-operations permission.
CREATE OR ALTER FUNCTION dbo.fn_CardEmployees (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT v.EmployeeId FROM dbo.fn_VisibleEmployees(@UserId) v
    UNION
    SELECT e.EmployeeId FROM dbo.Employees e
    WHERE (e.LocationId IS NULL OR e.LocationId IN (SELECT LocationId FROM dbo.fn_UserLocationScope(@UserId)))
      AND EXISTS (SELECT 1 FROM dbo.fn_UserPermissions(@UserId) p
                  WHERE p.PermissionCode IN (N'Cards.ViewAll', N'Cards.Issue', N'Cards.Block', N'Cards.Verify'));
GO

CREATE OR ALTER PROCEDURE dbo.usp_Card_Search
    @ActorUserId INT,
    @Search      NVARCHAR(200) = NULL,
    @Status      NVARCHAR(20) = NULL,
    @CardType    NVARCHAR(20) = NULL,
    @EmployeeId  INT = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20,
    @SortBy      NVARCHAR(40) = NULL,
    @SortDir     NVARCHAR(4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @Asc BIT = CASE WHEN LOWER(@SortDir) = N'asc' THEN 1 ELSE 0 END;

    CREATE TABLE #f (CardId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT c.CardId
    FROM dbo.vw_Cards c
    JOIN dbo.fn_CardEmployees(@ActorUserId) ce ON ce.EmployeeId = c.EmployeeId
    WHERE (@Status IS NULL OR c.Status = @Status)
      AND (@CardType IS NULL OR c.CardType = @CardType)
      AND (@EmployeeId IS NULL OR c.EmployeeId = @EmployeeId)
      AND (@Search IS NULL OR c.EmployeeName LIKE N'%' + @Search + N'%' OR c.EmployeeNumber LIKE N'%' + @Search + N'%'
           OR c.MaskedCardUid LIKE N'%' + RIGHT(@Search, 4) + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT c.CardId, c.MaskedCardUid, c.EmployeeId, c.EmployeeNumber, c.EmployeeName, c.CardType, c.Status, c.IssuedAtUtc, c.ActivatedAtUtc,
           c.ExpiresAtUtc, c.BlockedAtUtc, c.BlockReason, c.ControllerSyncStatus, c.ReplacedByCardId, c.CardRequestId, c.Version
    FROM dbo.vw_Cards c JOIN #f f ON f.CardId = c.CardId
    ORDER BY
        CASE WHEN @Asc = 1 AND @SortBy = N'employeeName' THEN c.EmployeeName END ASC,
        CASE WHEN @Asc = 0 AND @SortBy = N'employeeName' THEN c.EmployeeName END DESC,
        CASE WHEN @Asc = 1 AND @SortBy = N'status' THEN c.Status END ASC,
        CASE WHEN @Asc = 0 AND @SortBy = N'status' THEN c.Status END DESC,
        CASE WHEN @Asc = 1 AND ISNULL(@SortBy, N'') NOT IN (N'employeeName', N'status') THEN c.IssuedAtUtc END ASC,
        CASE WHEN @Asc = 0 AND ISNULL(@SortBy, N'') NOT IN (N'employeeName', N'status') THEN c.IssuedAtUtc END DESC,
        c.CardId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectCard
    @CardId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CardId, MaskedCardUid, EmployeeId, EmployeeNumber, EmployeeName, CardType, Status, IssuedAtUtc, ActivatedAtUtc, ExpiresAtUtc,
           BlockedAtUtc, BlockReason, ControllerSyncStatus, ReplacedByCardId, CardRequestId, Version
    FROM dbo.vw_Cards WHERE CardId = @CardId;
END
GO

-- Loads a card for a mutation with scope checks. Returns 404 when the card is not visible, 403 when out of facility scope.
CREATE OR ALTER PROCEDURE dbo.usp_Internal_AssertCardOperable
    @ActorUserId INT,
    @CardId      BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @EmpId INT, @LocId INT;
    SELECT @EmpId = c.EmployeeId, @LocId = e.LocationId FROM dbo.RFIDCards c JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId WHERE c.CardId = @CardId;
    IF @EmpId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.fn_CardEmployees(@ActorUserId) WHERE EmployeeId = @EmpId)
        THROW 50404, N'Card not found.', 1;
    IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0
        THROW 50403, N'The card holder is outside your facility scope.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Card_Create
    @ActorUserId   INT,
    @EmployeeId    INT,
    @CardUid       NVARCHAR(64),
    @CardType      NVARCHAR(20),
    @ExpiresAtUtc  DATETIME2(3) = NULL,
    @CardRequestId BIGINT = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @CardUid = UPPER(LTRIM(RTRIM(@CardUid)));
        IF LEN(ISNULL(@CardUid, N'')) < 4 THROW 50400, N'The card UID must have at least 4 characters.', 1;
        IF @CardType NOT IN (N'Permanent', N'Temporary') THROW 50400, N'Invalid card type.', 1;
        IF @CardType = N'Temporary' AND @ExpiresAtUtc IS NULL THROW 50400, N'Temporary cards need an expiry time.', 1;
        IF @ExpiresAtUtc IS NOT NULL AND @ExpiresAtUtc <= SYSUTCDATETIME() THROW 50400, N'The expiry time must be in the future.', 1;

        DECLARE @EmpStatus NVARCHAR(20), @LocId INT, @EmpUser INT, @Number NVARCHAR(30);
        SELECT @EmpStatus = EmploymentStatus, @LocId = LocationId, @EmpUser = UserId, @Number = EmployeeNumber FROM dbo.Employees WHERE EmployeeId = @EmployeeId;
        IF @EmpStatus IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.fn_CardEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50403, N'The employee is outside your facility scope.', 1;
        IF @EmpStatus <> N'Active' THROW 50422, N'Cards can only be issued to active employees.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.RFIDCards WITH (UPDLOCK, HOLDLOCK) WHERE CardUid = @CardUid)
            THROW 50409, N'This card UID is already registered.', 1;
        IF @CardRequestId IS NOT NULL
        BEGIN
            THROW 50409, N'Card requests must be fulfilled through the v2 card-request workflow.', 1;
        END

        INSERT dbo.RFIDCards (CardUid, EmployeeId, CardType, Status, ExpiresAtUtc, CardRequestId, CreatedByUserId)
        VALUES (@CardUid, @EmployeeId, @CardType, N'Requested', @ExpiresAtUtc, @CardRequestId, @ActorUserId);
        DECLARE @Id BIGINT = SCOPE_IDENTITY();

        DECLARE @After NVARCHAR(MAX) = (SELECT CardId, MaskedCardUid, EmployeeNumber, CardType, Status, ExpiresAtUtc, CardRequestId
                                        FROM dbo.vw_Cards WHERE CardId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(@CardType, N' card ', dbo.fn_MaskCardUid(@CardUid), N' issued to ', @Number, N'.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Card.Issued', N'Card', @Id, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Notification_Create @EmpUser, N'CardIssued', N'ID card issued', @Summary, N'Card', @Id, N'/cards', @ActorUserId;
        COMMIT;

        EXEC dbo.usp_Internal_SelectCard @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Card_Activate
    @ActorUserId   INT,
    @CardId        BIGINT,
    @Version       BINARY(8),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertCardOperable @ActorUserId, @CardId;
        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @EmpId INT, @Type NVARCHAR(20), @Expires DATETIME2(3), @Uid NVARCHAR(64);
        SELECT @Status = Status, @Ver = Version, @EmpId = EmployeeId, @Type = CardType, @Expires = ExpiresAtUtc, @Uid = CardUid
        FROM dbo.RFIDCards WITH (UPDLOCK) WHERE CardId = @CardId;
        IF @Ver <> @Version THROW 50409, N'The card was changed by someone else. Reload and try again.', 1;
        IF @Status <> N'Requested' THROW 50409, N'Only cards in Requested status can be activated.', 1;
        IF @Expires IS NOT NULL AND @Expires <= SYSUTCDATETIME() THROW 50422, N'The card has already expired.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @EmpId AND EmploymentStatus = N'Active')
            THROW 50422, N'Cards can only be activated for active employees.', 1;
        IF @Type = N'Permanent' AND EXISTS (SELECT 1 FROM dbo.RFIDCards WITH (UPDLOCK, HOLDLOCK)
                                            WHERE EmployeeId = @EmpId AND Status = N'Active' AND CardType = N'Permanent' AND CardId <> @CardId)
            THROW 50409, N'The employee already has an active permanent card. Replace or deactivate it first.', 1;

        DECLARE @sync NVARCHAR(20);
        EXEC dbo.usp_Internal_ControllerCommand N'ActivateCard', N'Card', @CardId, NULL, NULL, @CorrelationId, @sync OUTPUT;
        UPDATE dbo.RFIDCards SET Status = N'Active', ActivatedAtUtc = SYSUTCDATETIME(), ControllerSyncStatus = @sync,
               UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
        WHERE CardId = @CardId;

        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card ', dbo.fn_MaskCardUid(@Uid), N' activated.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Card.Activated', N'Card', @CardId, @Summary, N'{"status":"Requested"}', N'{"status":"Active"}', NULL, @CorrelationId, @IpAddress;
        DECLARE @EmpUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @EmpId);
        EXEC dbo.usp_Notification_Create @EmpUser, N'CardActivated', N'ID card activated', @Summary, N'Card', @CardId, N'/cards', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCard @CardId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Shared implementation for Block / Deactivate (and Lost through ReportLost).
CREATE OR ALTER PROCEDURE dbo.usp_Internal_CardChangeStatus
    @ActorUserId   INT,
    @CardId        BIGINT,
    @NewStatus     NVARCHAR(20),
    @Reason        NVARCHAR(500),
    @Version       BINARY(8) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @EmpId INT, @Uid NVARCHAR(64), @LocId INT;
    SELECT @Status = c.Status, @Ver = c.Version, @EmpId = c.EmployeeId, @Uid = c.CardUid, @LocId = e.LocationId
    FROM dbo.RFIDCards c WITH (UPDLOCK) JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId WHERE c.CardId = @CardId;
    IF @Version IS NOT NULL AND @Ver <> @Version THROW 50409, N'The card was changed by someone else. Reload and try again.', 1;
    IF @NewStatus IN (N'Blocked', N'Lost') AND @Status NOT IN (N'Active', N'Requested')
        THROW 50409, N'Only active or requested cards can be blocked or reported lost.', 1;
    IF @NewStatus = N'Deactivated' AND @Status = N'Deactivated'
        THROW 50409, N'The card is already deactivated.', 1;

    DECLARE @sync NVARCHAR(20), @Cmd NVARCHAR(40) = CASE @NewStatus WHEN N'Deactivated' THEN N'DeactivateCard' ELSE N'BlockCard' END;
    EXEC dbo.usp_Internal_ControllerCommand @Cmd, N'Card', @CardId, NULL, NULL, @CorrelationId, @sync OUTPUT;
    UPDATE dbo.RFIDCards
    SET Status = @NewStatus, BlockedAtUtc = ISNULL(BlockedAtUtc, SYSUTCDATETIME()), BlockReason = @Reason, ControllerSyncStatus = @sync,
        UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
    WHERE CardId = @CardId;

    DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card ', dbo.fn_MaskCardUid(@Uid), N' ', LOWER(@Status), N' -> ', LOWER(@NewStatus), N'.');
    DECLARE @Before NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @After NVARCHAR(MAX) = (SELECT @NewStatus AS status, @sync AS controllerSyncStatus FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @Action NVARCHAR(100) = CONCAT(N'Card.', CASE @NewStatus WHEN N'Lost' THEN N'ReportedLost' ELSE @NewStatus END);
    EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'Card', @CardId, @Summary, @Before, @After, @Reason, @CorrelationId, @IpAddress;
    DECLARE @EmpUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @EmpId);
    DECLARE @Title NVARCHAR(200) = CONCAT(N'ID card ', LOWER(@NewStatus));
    EXEC dbo.usp_Notification_Create @EmpUser, N'CardStatusChanged', @Title, @Summary, N'Card', @CardId, N'/cards', @ActorUserId;
    IF @NewStatus IN (N'Blocked', N'Lost')
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @LocId, N'CardBlocked', @Title, @Summary, N'Card', @CardId, N'/cards', @ActorUserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Card_Block
    @ActorUserId   INT,
    @CardId        BIGINT,
    @Reason        NVARCHAR(500),
    @Version       BINARY(8),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A reason is required.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertCardOperable @ActorUserId, @CardId;
        BEGIN TRAN;
        EXEC dbo.usp_Internal_CardChangeStatus @ActorUserId, @CardId, N'Blocked', @Reason, @Version, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCard @CardId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Card_Deactivate
    @ActorUserId   INT,
    @CardId        BIGINT,
    @Reason        NVARCHAR(500),
    @Version       BINARY(8),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A reason is required.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertCardOperable @ActorUserId, @CardId;
        BEGIN TRAN;
        EXEC dbo.usp_Internal_CardChangeStatus @ActorUserId, @CardId, N'Deactivated', @Reason, @Version, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCard @CardId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- BR-03: reporting a lost card blocks it immediately; requests are raised through v1/card-requests.
CREATE OR ALTER PROCEDURE dbo.usp_Card_ReportLost
    @ActorUserId   INT,
    @CardId        BIGINT,
    @Reason        NVARCHAR(500),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A reason is required.', 1;
        DECLARE @EmpId INT, @EmpUser INT, @LocId INT;
        SELECT @EmpId = c.EmployeeId, @EmpUser = e.UserId, @LocId = e.LocationId
        FROM dbo.RFIDCards c JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId WHERE c.CardId = @CardId;
        IF @EmpId IS NULL THROW 50404, N'Card not found.', 1;
        IF ISNULL(@EmpUser, -1) <> @ActorUserId
        BEGIN
            IF dbo.fn_HasPermission(@ActorUserId, N'Cards.Block') = 0
               OR NOT EXISTS (SELECT 1 FROM dbo.fn_CardEmployees(@ActorUserId) WHERE EmployeeId = @EmpId)
                THROW 50404, N'Card not found.', 1;
            IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0
                THROW 50403, N'The card holder is outside your facility scope.', 1;
        END

        BEGIN TRAN;
        EXEC dbo.usp_Internal_CardChangeStatus @ActorUserId, @CardId, N'Blocked', @Reason, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCard @CardId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- The old card is deactivated (when still active) and the replacement is activated in one transaction.
CREATE OR ALTER PROCEDURE dbo.usp_Card_Replace
    @ActorUserId   INT,
    @CardId        BIGINT,
    @NewCardUid    NVARCHAR(64),
    @Reason        NVARCHAR(500),
    @Version       BINARY(8),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @NewCardUid = UPPER(LTRIM(RTRIM(@NewCardUid)));
        IF LEN(ISNULL(@NewCardUid, N'')) < 4 THROW 50400, N'The new card UID must have at least 4 characters.', 1;
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A reason is required.', 1;
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        EXEC dbo.usp_Internal_AssertCardOperable @ActorUserId, @CardId;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @Ver BINARY(8), @EmpId INT, @Type NVARCHAR(20), @Expires DATETIME2(3), @Replaced BIGINT, @OldUid NVARCHAR(64);
        SELECT @Status = Status, @Ver = Version, @EmpId = EmployeeId, @Type = CardType, @Expires = ExpiresAtUtc, @Replaced = ReplacedByCardId, @OldUid = CardUid
        FROM dbo.RFIDCards WITH (UPDLOCK) WHERE CardId = @CardId;
        IF @Ver <> @Version THROW 50409, N'The card was changed by someone else. Reload and try again.', 1;
        IF @Replaced IS NOT NULL THROW 50409, N'The card has already been replaced.', 1;
        IF @Status IN (N'Requested', N'Deactivated') THROW 50409, N'Only issued cards can be replaced.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @EmpId AND EmploymentStatus = N'Active')
            THROW 50422, N'Cards can only be replaced for active employees.', 1;
        IF EXISTS (SELECT 1 FROM dbo.RFIDCards WITH (UPDLOCK, HOLDLOCK) WHERE CardUid = @NewCardUid)
            THROW 50409, N'This card UID is already registered.', 1;
        IF @Type = N'Temporary' AND (@Expires IS NULL OR @Expires <= SYSUTCDATETIME())
            SET @Expires = DATEADD(DAY, 7, SYSUTCDATETIME());

        DECLARE @sync NVARCHAR(20);
        IF @Status = N'Active'
        BEGIN
            EXEC dbo.usp_Internal_ControllerCommand N'DeactivateCard', N'Card', @CardId, NULL, NULL, @CorrelationId, @sync OUTPUT;
            UPDATE dbo.RFIDCards SET Status = N'Deactivated', BlockedAtUtc = SYSUTCDATETIME(), BlockReason = @Reason, ControllerSyncStatus = @sync,
                   UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId
            WHERE CardId = @CardId;
        END

        INSERT dbo.RFIDCards (CardUid, EmployeeId, CardType, Status, ActivatedAtUtc, ExpiresAtUtc, CreatedByUserId)
        VALUES (@NewCardUid, @EmpId, @Type, N'Active', SYSUTCDATETIME(), @Expires, @ActorUserId);
        DECLARE @NewId BIGINT = SCOPE_IDENTITY();
        EXEC dbo.usp_Internal_ControllerCommand N'ActivateCard', N'Card', @NewId, NULL, NULL, @CorrelationId, @sync OUTPUT;
        UPDATE dbo.RFIDCards SET ControllerSyncStatus = @sync WHERE CardId = @NewId;
        UPDATE dbo.RFIDCards SET ReplacedByCardId = @NewId, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedByUserId = @ActorUserId WHERE CardId = @CardId;

        -- Direct replacement is an admin card operation, not a bypass for a pending v2 request.

        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card ', dbo.fn_MaskCardUid(@OldUid), N' replaced by ', dbo.fn_MaskCardUid(@NewCardUid), N'.');
        DECLARE @Before NVARCHAR(MAX) = (SELECT @CardId AS cardId, @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT CardId, MaskedCardUid, Status, ControllerSyncStatus FROM dbo.vw_Cards WHERE CardId = @NewId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Card.Replaced', N'Card', @CardId, @Summary, @Before, @After, @Reason, @CorrelationId, @IpAddress;
        DECLARE @EmpUser INT = (SELECT UserId FROM dbo.Employees WHERE EmployeeId = @EmpId);
        EXEC dbo.usp_Notification_Create @EmpUser, N'CardReplaced', N'Replacement ID card activated', @Summary, N'Card', @NewId, N'/cards', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCard @NewId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*---------------------------- Card requests -------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Search
    @ActorUserId INT,
    @Status      NVARCHAR(30) = NULL,
    @RequestType NVARCHAR(20) = NULL,
    @EmployeeId  INT = NULL,
    @Search      NVARCHAR(200) = NULL,
    @Mine        BIT = NULL,
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @CanViewAll BIT = CASE WHEN dbo.fn_HasPermission(@ActorUserId, N'Cards.ViewAll') = 1 THEN 1 ELSE 0 END;

    CREATE TABLE #f (CardRequestId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT r.CardRequestId
    FROM dbo.vw_CardRequests r
    WHERE (r.RequestedByUserId = @ActorUserId OR r.EmployeeUserId = @ActorUserId
           OR (@CanViewAll = 1 AND dbo.fn_UserCanAccessLocation(@ActorUserId, r.EmployeeLocationId) = 1))
      AND (@CanViewAll = 1 OR r.RequestedByUserId = @ActorUserId OR r.EmployeeUserId = @ActorUserId)
      AND (ISNULL(@Mine, 0) = 0 OR r.RequestedByUserId = @ActorUserId OR r.EmployeeUserId = @ActorUserId)
      AND (@Status IS NULL OR r.Status = @Status)
      AND (@RequestType IS NULL OR r.RequestType = @RequestType)
      AND (@EmployeeId IS NULL OR r.EmployeeId = @EmployeeId)
      AND (@Search IS NULL OR r.RequestNumber LIKE N'%' + @Search + N'%' OR r.EmployeeName LIKE N'%' + @Search + N'%'
           OR r.EmployeeNumber LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT r.CardRequestId, r.RequestNumber, r.RequestType, r.EmployeeId, r.EmployeeName, r.EmployeeNumber, r.Designation,
           r.DepartmentName, r.ManagerName, r.OldCardId, r.OldMaskedCardUid, r.NewCardId, r.NewMaskedCardUid, r.Reason,
           r.Status, r.CurrentStage, r.RequestedByUserId, r.RequestedAtUtc, r.RequestedByName, r.UpdatedAtUtc, r.ClosedAtUtc,
           r.LastActionByName, r.LastActionAtUtc, r.LastComments, r.HasPhoto, r.Version
    FROM dbo.vw_CardRequests r JOIN #f f ON f.CardRequestId = r.CardRequestId
    ORDER BY r.RequestedAtUtc DESC, r.CardRequestId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectCardRequest
    @CardRequestId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CardRequestId, RequestNumber, RequestType, EmployeeId, EmployeeName, EmployeeNumber, OldCardId, NewCardId, Reason,
           Status, RequestedAtUtc, RequestedByName, VerifiedByName, ApprovedByName, DecidedAtUtc, DecisionComments, RequestedValidToUtc
    FROM dbo.vw_CardRequests WHERE CardRequestId = @CardRequestId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Create
    @ActorUserId         INT,
    @EmployeeId          INT,
    @RequestType         NVARCHAR(20),
    @OldCardId           BIGINT = NULL,
    @Reason              NVARCHAR(500),
    @RequestedValidToUtc DATETIME2(3) = NULL,
    @CorrelationId       UNIQUEIDENTIFIER = NULL,
    @IpAddress           VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @RequestType NOT IN (N'New', N'Lost', N'Damaged', N'Replacement', N'Temporary') THROW 50400, N'Invalid request type.', 1;
        IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL THROW 50400, N'A reason is required.', 1;
        IF @RequestType IN (N'Lost', N'Damaged', N'Replacement') AND @OldCardId IS NULL
            THROW 50400, N'The existing card is required for lost, damaged and replacement requests.', 1;
        IF @RequestType = N'Temporary' AND (@RequestedValidToUtc IS NULL OR @RequestedValidToUtc <= SYSUTCDATETIME())
            THROW 50400, N'Temporary card requests need a future valid-to time.', 1;

        DECLARE @EmpStatus NVARCHAR(20), @LocId INT;
        SELECT @EmpStatus = EmploymentStatus, @LocId = LocationId FROM dbo.Employees WHERE EmployeeId = @EmployeeId;
        IF @EmpStatus IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.fn_CardEmployees(@ActorUserId) WHERE EmployeeId = @EmployeeId)
            THROW 50404, N'Employee not found.', 1;
        IF @EmpStatus <> N'Active' THROW 50422, N'Card requests cannot be raised for inactive or exited employees.', 1;
        IF @OldCardId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.RFIDCards WHERE CardId = @OldCardId AND EmployeeId = @EmployeeId)
            THROW 50400, N'The existing card does not belong to the employee.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.CardRequests WITH (UPDLOCK, HOLDLOCK)
                   WHERE EmployeeId = @EmployeeId AND RequestType = @RequestType AND Status IN (N'Submitted', N'VerificationPending', N'Approved')
                     AND ISNULL(OldCardId, 0) = ISNULL(@OldCardId, 0))
            THROW 50409, N'An open card request of this type already exists for the employee.', 1;

        -- BR-03: a lost card is blocked immediately.
        IF @RequestType = N'Lost' AND EXISTS (SELECT 1 FROM dbo.RFIDCards WHERE CardId = @OldCardId AND Status IN (N'Active', N'Requested'))
            EXEC dbo.usp_Internal_CardChangeStatus @ActorUserId, @OldCardId, N'Lost', @Reason, NULL, @CorrelationId, @IpAddress;

        DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_CardRequestNumber;
        DECLARE @Number NVARCHAR(20) = CONCAT(N'CR-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'00000', @Seq), 5));
        INSERT dbo.CardRequests (RequestNumber, RequestType, EmployeeId, OldCardId, Reason, Status, RequestedByUserId, RequestedValidToUtc)
        VALUES (@Number, @RequestType, @EmployeeId, @OldCardId, LTRIM(RTRIM(@Reason)), N'Submitted', @ActorUserId, @RequestedValidToUtc);
        DECLARE @Id BIGINT = SCOPE_IDENTITY();

        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card request ', @Number, N' (', @RequestType, N') submitted.');
        DECLARE @After NVARCHAR(MAX) = (SELECT CardRequestId, RequestNumber, RequestType, EmployeeNumber, OldCardId, Status, RequestedValidToUtc
                                        FROM dbo.vw_CardRequests WHERE CardRequestId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'CardRequest.Created', N'CardRequest', @Id, @Summary, NULL, @After, @Reason, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @LocId, N'CardRequestSubmitted', N'Card request awaiting verification', @Summary,
             N'CardRequest', @Id, N'/cards', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCardRequest @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Decide
    @ActorUserId   INT,
    @CardRequestId BIGINT,
    @Decision      NVARCHAR(20),
    @Comments      NVARCHAR(1000) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Comments = NULLIF(LTRIM(RTRIM(@Comments)), N'');
        IF @Decision NOT IN (N'Verify', N'Approve', N'Reject') THROW 50400, N'Decision must be Verify, Approve or Reject.', 1;
        IF @Decision = N'Reject' AND @Comments IS NULL THROW 50400, N'Comments are required when rejecting a card request.', 1;

        DECLARE @EmpId INT, @LocId INT, @Requester INT, @EmpUser INT;
        SELECT @EmpId = cr.EmployeeId, @LocId = e.LocationId, @Requester = cr.RequestedByUserId, @EmpUser = e.UserId
        FROM dbo.CardRequests cr JOIN dbo.Employees e ON e.EmployeeId = cr.EmployeeId WHERE cr.CardRequestId = @CardRequestId;
        IF @EmpId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.fn_CardEmployees(@ActorUserId) WHERE EmployeeId = @EmpId)
            THROW 50404, N'Card request not found.', 1;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(30), @Number NVARCHAR(20);
        SELECT @Status = Status, @Number = RequestNumber FROM dbo.CardRequests WITH (UPDLOCK) WHERE CardRequestId = @CardRequestId;
        IF (@Decision = N'Verify' AND @Status <> N'Submitted')
           OR (@Decision IN (N'Approve', N'Reject') AND @Status NOT IN (N'Submitted', N'VerificationPending'))
            THROW 50409, N'The card request is not in a state that allows this decision.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50403, N'The employee is outside your facility scope.', 1;
        IF @Requester = @ActorUserId OR @EmpUser = @ActorUserId THROW 50403, N'You cannot decide your own card request.', 1;

        DECLARE @NewStatus NVARCHAR(30) = CASE @Decision WHEN N'Verify' THEN N'VerificationPending' WHEN N'Approve' THEN N'Approved' ELSE N'Rejected' END;
        UPDATE dbo.CardRequests
        SET Status = @NewStatus,
            VerifiedByUserId = CASE WHEN @Decision = N'Verify' THEN @ActorUserId ELSE VerifiedByUserId END,
            VerifiedAtUtc = CASE WHEN @Decision = N'Verify' THEN SYSUTCDATETIME() ELSE VerifiedAtUtc END,
            ApprovedByUserId = CASE WHEN @Decision IN (N'Approve', N'Reject') THEN @ActorUserId ELSE ApprovedByUserId END,
            DecidedAtUtc = CASE WHEN @Decision IN (N'Approve', N'Reject') THEN SYSUTCDATETIME() ELSE DecidedAtUtc END,
            DecisionComments = ISNULL(@Comments, DecisionComments)
        WHERE CardRequestId = @CardRequestId;

        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card request ', @Number, N': ', @Status, N' -> ', @NewStatus, N'.');
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT @NewStatus AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Action NVARCHAR(100) = CONCAT(N'CardRequest.', @Decision);
        EXEC dbo.usp_Audit_Write @ActorUserId, @Action, N'CardRequest', @CardRequestId, @Summary, @Before, @After, @Comments, @CorrelationId, @IpAddress;
        DECLARE @Title NVARCHAR(200) = CONCAT(N'Card request ', LOWER(@NewStatus));
        EXEC dbo.usp_Notification_Create @Requester, N'CardRequestDecided', @Title, @Summary, N'CardRequest', @CardRequestId, N'/cards', @ActorUserId;
        IF ISNULL(@EmpUser, -1) <> @Requester
            EXEC dbo.usp_Notification_Create @EmpUser, N'CardRequestDecided', @Title, @Summary, N'CardRequest', @CardRequestId, N'/cards', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectCardRequest @CardRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/* v2 procedures deliberately replace the legacy two-stage request flow above. */
CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Queue
    @ActorUserId INT,
    @Stage NVARCHAR(20),
    @Search NVARCHAR(200) = NULL,
    @Page INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Stage NOT IN (N'Manager',N'HR',N'Security',N'IdCardTeam') THROW 50400, N'Invalid card request stage.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_UserPermissions(@ActorUserId) WHERE PermissionCode =
        CASE @Stage WHEN N'Manager' THEN N'Cards.ManagerApprove' WHEN N'HR' THEN N'Cards.HrVerify'
                    WHEN N'Security' THEN N'Cards.SecurityReview' ELSE N'Cards.Process' END)
        THROW 50403, N'You are not authorized for this queue.', 1;
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    CREATE TABLE #q (CardRequestId BIGINT PRIMARY KEY);
    INSERT #q
    SELECT r.CardRequestId FROM dbo.vw_CardRequests r
    WHERE r.Status = CASE @Stage WHEN N'Manager' THEN N'PendingManager' WHEN N'HR' THEN N'PendingHR'
        WHEN N'Security' THEN N'PendingSecurity' ELSE r.Status END
      AND (@Stage <> N'IdCardTeam' OR r.Status IN (N'PendingIdCardTeam',N'Printing',N'ReadyToIssue'))
      AND NOT (r.RequestedByUserId = @ActorUserId OR r.EmployeeUserId = @ActorUserId)
      AND dbo.fn_UserCanAccessLocation(@ActorUserId, r.EmployeeLocationId) = 1
      AND (@Search IS NULL OR r.RequestNumber LIKE N'%' + @Search + N'%' OR r.EmployeeName LIKE N'%' + @Search + N'%'
           OR r.EmployeeNumber LIKE N'%' + @Search + N'%')
      AND (@Stage <> N'Manager' OR r.ManagerUserId = @ActorUserId OR (r.ManagerUserId IS NULL AND
           (dbo.fn_HasPermission(@ActorUserId, N'Cards.ManagerApprove') = 1
            OR EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles ro ON ro.RoleId = ur.RoleId
                       WHERE ur.UserId = @ActorUserId AND ro.RoleName = N'SystemAdmin'))));
    SELECT COUNT(*) AS TotalCount FROM #q;
    SELECT r.CardRequestId, r.RequestNumber, r.RequestType, r.EmployeeId, r.EmployeeName, r.EmployeeNumber, r.Designation,
           r.DepartmentName, r.ManagerName, r.OldCardId, r.OldMaskedCardUid, r.NewCardId, r.NewMaskedCardUid, r.Reason,
           r.Status, r.CurrentStage, r.RequestedByUserId, r.RequestedAtUtc, r.RequestedByName, r.UpdatedAtUtc, r.ClosedAtUtc,
           r.LastActionByName, r.LastActionAtUtc, r.LastComments, r.HasPhoto, r.Version
    FROM dbo.vw_CardRequests r JOIN #q q ON q.CardRequestId = r.CardRequestId
    ORDER BY r.RequestedAtUtc, r.CardRequestId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Get
    @ActorUserId INT,
    @CardRequestId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LocationId INT, @ActorEmployeeId INT, @OwnerUserId INT, @RequesterUserId INT;
    SELECT @ActorEmployeeId=EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId;
    SELECT @LocationId = r.EmployeeLocationId, @OwnerUserId=r.EmployeeUserId, @RequesterUserId=r.RequestedByUserId FROM dbo.vw_CardRequests r
    WHERE r.CardRequestId = @CardRequestId
      AND (r.EmployeeUserId = @ActorUserId OR r.RequestedByUserId = @ActorUserId
           OR r.ManagerUserId = @ActorUserId
           OR (dbo.fn_HasPermission(@ActorUserId, N'Cards.ViewAll') = 1 AND dbo.fn_UserCanAccessLocation(@ActorUserId, r.EmployeeLocationId) = 1)
           OR (dbo.fn_HasPermission(@ActorUserId, N'Cards.HrVerify') = 1)
           OR (dbo.fn_HasPermission(@ActorUserId, N'Cards.SecurityReview') = 1)
           OR (dbo.fn_HasPermission(@ActorUserId, N'Cards.Process') = 1)
           OR (dbo.fn_HasPermission(@ActorUserId,N'Approvals.Team')=1 AND r.ManagerEmployeeId=@ActorEmployeeId)
           OR EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles ro ON ro.RoleId = ur.RoleId
                      WHERE ur.UserId = @ActorUserId AND ro.RoleName = N'SystemAdmin'));
    IF @LocationId IS NULL THROW 50404, N'Card request not found.', 1;
    IF @ActorUserId NOT IN (ISNULL(@OwnerUserId,-1),ISNULL(@RequesterUserId,-1))
       AND dbo.fn_UserCanAccessLocation(@ActorUserId,@LocationId)=0
        THROW 50404, N'Card request not found.', 1;
    SELECT r.CardRequestId, r.RequestNumber, r.RequestType, r.EmployeeId, r.EmployeeName, r.EmployeeNumber, r.Designation,
           r.DepartmentName, r.ManagerName, r.WorkEmail, r.LocationName, r.OldCardId, r.OldMaskedCardUid, r.NewCardId,
           r.NewMaskedCardUid, r.Reason, r.Status, r.CurrentStage, r.RequestedByUserId, r.RequestedByName,
           r.RequestedAtUtc, r.UpdatedAtUtc, r.ClosedAtUtc, r.LastActionByName, r.LastActionAtUtc, r.LastComments, r.HasPhoto,
           r.MobileNumber, r.Address, r.BloodGroup, r.EmergencyContactName, r.EmergencyContactNumber, r.Version
    FROM dbo.vw_CardRequests r WHERE r.CardRequestId = @CardRequestId;
    SELECT h.HistoryId, h.FromStatus, h.ToStatus, h.Action, h.Comments, h.ActorUserId, u.DisplayName AS ActorName, h.CreatedAtUtc
    FROM dbo.CardRequestHistory h LEFT JOIN dbo.Users u ON u.UserId = h.ActorUserId
    WHERE h.CardRequestId = @CardRequestId ORDER BY h.CreatedAtUtc, h.HistoryId;
    DECLARE @Status NVARCHAR(30), @EmployeeUserId INT, @Requester INT, @ManagerUserId INT;
    SELECT @Status = r.Status, @EmployeeUserId = r.EmployeeUserId, @Requester = r.RequestedByUserId, @ManagerUserId = r.ManagerUserId
    FROM dbo.vw_CardRequests r WHERE r.CardRequestId = @CardRequestId;
    SELECT v.ActionName AS Value
    FROM (VALUES (1,N'Approve',N'PendingManager'),(1,N'Verify',N'PendingHR'),(1,N'Approve',N'PendingSecurity'),
                 (1,N'Approve',N'PendingIdCardTeam'),(1,N'MarkPrinted',N'Printing'),(1,N'Issue',N'ReadyToIssue'),
                 (2,N'Reject',N'PendingManager'),(2,N'Reject',N'PendingHR'),(2,N'Reject',N'PendingSecurity'),
                 (2,N'Reject',N'PendingIdCardTeam'),(3,N'Cancel',N'PendingManager'),(3,N'Cancel',N'PendingHR'))
        v(Priority,ActionName,ForStatus)
    WHERE @Status = v.ForStatus AND
      ((v.Priority = 3 AND @ActorUserId IN (@Requester,ISNULL(@EmployeeUserId,-1)))
       OR (v.Priority < 3 AND @ActorUserId <> ISNULL(@EmployeeUserId,-1) AND
         CASE @Status
           WHEN N'PendingManager' THEN CASE WHEN @ActorUserId = @ManagerUserId OR dbo.fn_HasPermission(@ActorUserId,N'Cards.ManagerApprove') = 1 THEN 1 ELSE 0 END
           WHEN N'PendingHR' THEN dbo.fn_HasPermission(@ActorUserId,N'Cards.HrVerify')
           WHEN N'PendingSecurity' THEN dbo.fn_HasPermission(@ActorUserId,N'Cards.SecurityReview')
           ELSE dbo.fn_HasPermission(@ActorUserId,N'Cards.Process') END = 1))
    ORDER BY v.Priority;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Create
    @ActorUserId INT,
    @EmployeeId INT = NULL,
    @RequestType NVARCHAR(20),
    @Reason NVARCHAR(500) = NULL,
    @MobileNumber NVARCHAR(20),
    @Address NVARCHAR(400),
    @BloodGroup NVARCHAR(5),
    @EmergencyContactName NVARCHAR(150),
    @EmergencyContactNumber NVARCHAR(20),
    @PhotoContentType NVARCHAR(50) = NULL,
    @Photo VARBINARY(MAX) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Reason = NULLIF(LTRIM(RTRIM(@Reason)),N'');
        IF @RequestType NOT IN (N'New',N'Lost',N'Damaged') THROW 50400,N'Invalid requestType.',1;
        IF @Reason IS NOT NULL AND LEN(@Reason)>500 THROW 50400,N'Reason is too long.',1;
        IF @RequestType=N'Lost' AND LEN(@Reason)<5 THROW 50400,N'A reason is required for lost cards.',1;
        IF @RequestType=N'Damaged' AND @Reason NOT IN (N'Scratched',N'Broken',N'RfidNotWorking',N'CardExpired',N'PhotoNotVisible')
            THROW 50400,N'Invalid damaged-card reason.',1;
        IF NULLIF(@MobileNumber,N'') IS NULL OR NULLIF(@Address,N'') IS NULL OR NULLIF(@BloodGroup,N'') IS NULL
           OR NULLIF(@EmergencyContactName,N'') IS NULL OR NULLIF(@EmergencyContactNumber,N'') IS NULL
            THROW 50400,N'All contact fields are required.',1;
        IF @BloodGroup NOT IN (N'A+',N'A-',N'B+',N'B-',N'AB+',N'AB-',N'O+',N'O-') THROW 50400,N'Invalid bloodGroup.',1;
        IF (@Photo IS NULL AND @PhotoContentType IS NOT NULL) OR (@Photo IS NOT NULL AND (@PhotoContentType IS NULL OR @PhotoContentType NOT IN (N'image/jpeg',N'image/png')))
            THROW 50400,N'Invalid photo content type.',1;
        IF @Photo IS NOT NULL AND (DATALENGTH(@Photo)<1 OR DATALENGTH(@Photo)>1048576) THROW 50400,N'Photo must be at most 1 MB.',1;
        IF @EmployeeId IS NULL SELECT @EmployeeId=EmployeeId FROM dbo.Employees WHERE UserId=@ActorUserId;
        DECLARE @EmployeeUserId INT,@EmpStatus NVARCHAR(20),@LocationId INT,@OldCardId BIGINT;
        SELECT @EmployeeUserId=UserId,@EmpStatus=EmploymentStatus,@LocationId=LocationId FROM dbo.Employees WHERE EmployeeId=@EmployeeId;
        IF @EmpStatus IS NULL THROW 50404,N'Employee not found.',1;
        IF ISNULL(@EmployeeUserId,-1)<>@ActorUserId AND dbo.fn_HasPermission(@ActorUserId,N'Employees.ViewAll')=0
            THROW 50403,N'Employees.ViewAll is required to request for another employee.',1;
        IF @EmpStatus<>N'Active' THROW 50422,N'Card requests require an active employee.',1;
        SELECT TOP(1) @OldCardId=CardId FROM dbo.RFIDCards WHERE EmployeeId=@EmployeeId AND Status IN (N'Active',N'Blocked')
        ORDER BY CASE Status WHEN N'Active' THEN 0 ELSE 1 END, CardId DESC;
        IF @RequestType=N'New' AND EXISTS(SELECT 1 FROM dbo.RFIDCards WHERE EmployeeId=@EmployeeId AND Status=N'Active')
            THROW 50409,N'An active card already exists.',1;
        IF @RequestType=N'Lost' AND @OldCardId IS NULL THROW 50422,N'An active or blocked card is required.',1;
        IF @RequestType=N'Damaged' AND NOT EXISTS(SELECT 1 FROM dbo.RFIDCards WHERE EmployeeId=@EmployeeId AND Status=N'Active')
            THROW 50422,N'An active card is required.',1;
        IF @RequestType=N'New' AND @Photo IS NULL AND NOT EXISTS(SELECT 1 FROM dbo.EmployeePhotos WHERE EmployeeId=@EmployeeId)
            THROW 50422,N'A photo is required for a new ID card.',1;
        BEGIN TRAN;
        IF EXISTS(SELECT 1 FROM dbo.CardRequests WITH(UPDLOCK,HOLDLOCK) WHERE EmployeeId=@EmployeeId AND Status IN
            (N'PendingManager',N'PendingHR',N'PendingSecurity',N'PendingIdCardTeam',N'Printing',N'ReadyToIssue'))
            THROW 50409,N'An open card request already exists.',1;
        UPDATE dbo.Employees SET MobileNumber=@MobileNumber,Address=@Address,BloodGroup=@BloodGroup,
            EmergencyContactName=@EmergencyContactName,EmergencyContactNumber=@EmergencyContactNumber,
            UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@ActorUserId WHERE EmployeeId=@EmployeeId;
        IF @Photo IS NOT NULL
            MERGE dbo.EmployeePhotos t USING(SELECT @EmployeeId EmployeeId)s ON t.EmployeeId=s.EmployeeId
            WHEN MATCHED THEN UPDATE SET ContentType=@PhotoContentType,Photo=@Photo,SizeBytes=DATALENGTH(@Photo),UploadedAtUtc=SYSUTCDATETIME(),UploadedByUserId=@ActorUserId
            WHEN NOT MATCHED THEN INSERT(EmployeeId,ContentType,Photo,SizeBytes,UploadedAtUtc,UploadedByUserId)
                 VALUES(@EmployeeId,@PhotoContentType,@Photo,DATALENGTH(@Photo),SYSUTCDATETIME(),@ActorUserId);
        IF @RequestType=N'Lost' AND EXISTS(SELECT 1 FROM dbo.RFIDCards WHERE CardId=@OldCardId AND Status=N'Active')
            UPDATE dbo.RFIDCards SET Status=N'Blocked',BlockedAtUtc=SYSUTCDATETIME(),BlockReason=CONCAT(N'Reported lost: ',@Reason),
                UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@ActorUserId WHERE CardId=@OldCardId;
        DECLARE @Seq INT=NEXT VALUE FOR dbo.seq_CardRequestNumber;
        DECLARE @Number NVARCHAR(20)=CONCAT(N'CR-',YEAR(SYSUTCDATETIME()),N'-',RIGHT(CONCAT(N'00000',@Seq),5));
        INSERT dbo.CardRequests(RequestNumber,RequestType,EmployeeId,OldCardId,Reason,Status,RequestedByUserId,
            MobileNumber,Address,BloodGroup,EmergencyContactName,EmergencyContactNumber)
        VALUES(@Number,@RequestType,@EmployeeId,CASE WHEN @RequestType IN(N'Lost',N'Damaged') THEN @OldCardId END,
            @Reason,N'PendingManager',@ActorUserId,@MobileNumber,@Address,@BloodGroup,@EmergencyContactName,@EmergencyContactNumber);
        DECLARE @Id BIGINT=SCOPE_IDENTITY();
        INSERT dbo.CardRequestHistory(CardRequestId,FromStatus,ToStatus,Action,Comments,ActorUserId)
        VALUES(@Id,NULL,N'PendingManager',N'Submit',@Reason,@ActorUserId);
        DECLARE @Summary NVARCHAR(500)=CONCAT(N'Card request ',@Number,N' (',@RequestType,N') submitted.');
        DECLARE @After NVARCHAR(MAX)=(SELECT CardRequestId,RequestNumber,RequestType,Status FROM dbo.vw_CardRequests WHERE CardRequestId=@Id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        DECLARE @Route NVARCHAR(200)=CONCAT(N'/cards/requests/',@Id);
        EXEC dbo.usp_Audit_Write @ActorUserId,N'CardRequest.Submit',N'CardRequest',@Id,@Summary,NULL,@After,@Reason,@CorrelationId,@IpAddress;
        DECLARE @ManagerUser INT=(SELECT m.UserId FROM dbo.Employees e JOIN dbo.Employees m ON m.EmployeeId=e.ManagerEmployeeId
                                  WHERE e.EmployeeId=@EmployeeId AND m.EmploymentStatus=N'Active');
        IF @ManagerUser IS NOT NULL
            EXEC dbo.usp_Notification_Create @ManagerUser,N'CardRequest',N'ID card request pending approval',@Summary,N'CardRequest',@Id,@Route,@ActorUserId;
        ELSE
            EXEC dbo.usp_Notification_CreateForRole N'Manager',@LocationId,N'CardRequest',N'ID card request pending approval',@Summary,N'CardRequest',@Id,@Route,@ActorUserId;
        COMMIT;
        EXEC dbo.usp_CardRequest_Get @ActorUserId,@Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CardRequest_Decide
    @ActorUserId INT,
    @CardRequestId BIGINT,
    @Action NVARCHAR(20),
    @Comments NVARCHAR(1000)=NULL,
    @Version BINARY(8),
    @CorrelationId UNIQUEIDENTIFIER=NULL,
    @IpAddress VARCHAR(45)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Comments=NULLIF(LTRIM(RTRIM(@Comments)),N'');
        IF @Action NOT IN(N'Approve',N'Reject',N'Verify',N'MarkPrinted',N'Issue',N'Cancel') THROW 50400,N'Invalid card request action.',1;
        IF @Action=N'Reject' AND @Comments IS NULL THROW 50400,N'Comments are required when rejecting.',1;
        DECLARE @EmpId INT,@Requester INT,@EmpUser INT,@ManagerUser INT,@LocId INT,@Status NVARCHAR(30),@RequestType NVARCHAR(20),
                @Number NVARCHAR(20),@OldCardId BIGINT,@NewCardId BIGINT,@CurrentVersion BINARY(8);
        SELECT @EmpId=r.EmployeeId,@Requester=r.RequestedByUserId,@EmpUser=r.EmployeeUserId,@ManagerUser=r.ManagerUserId,
            @LocId=r.EmployeeLocationId,@Status=r.Status,@RequestType=r.RequestType,@Number=r.RequestNumber,
            @OldCardId=r.OldCardId,@NewCardId=r.NewCardId,@CurrentVersion=r.Version
        FROM dbo.vw_CardRequests r WHERE r.CardRequestId=@CardRequestId;
        IF @EmpId IS NULL OR dbo.fn_UserCanAccessLocation(@ActorUserId,@LocId)=0 THROW 50404,N'Card request not found.',1;
        BEGIN TRAN;
        SELECT @Status=Status,@CurrentVersion=Version FROM dbo.CardRequests WITH(UPDLOCK,HOLDLOCK) WHERE CardRequestId=@CardRequestId;
        IF @CurrentVersion<>@Version THROW 50409,N'The card request was changed. Reload and try again.',1;
        IF NOT ((@Status=N'PendingManager' AND @Action IN(N'Approve',N'Reject',N'Cancel'))
             OR (@Status=N'PendingHR' AND @Action IN(N'Verify',N'Reject',N'Cancel'))
             OR (@Status=N'PendingSecurity' AND @Action IN(N'Approve',N'Reject'))
             OR (@Status=N'PendingIdCardTeam' AND @Action IN(N'Approve',N'Reject'))
             OR (@Status=N'Printing' AND @Action=N'MarkPrinted')
             OR (@Status=N'ReadyToIssue' AND @Action=N'Issue'))
            THROW 50409,N'This action is not allowed in the current status.',1;
        DECLARE @IsAdmin BIT=CASE WHEN EXISTS(SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles ro ON ro.RoleId=ur.RoleId
            WHERE ur.UserId=@ActorUserId AND ro.RoleName=N'SystemAdmin') THEN 1 ELSE 0 END;
        DECLARE @Allowed BIT=0;
        IF @Action=N'Cancel'
        BEGIN
            IF @Status NOT IN(N'PendingManager',N'PendingHR') THROW 50409,N'Cancel is not allowed in this status.',1;
            IF @ActorUserId NOT IN(@Requester,ISNULL(@EmpUser,-1)) THROW 50403,N'You cannot cancel this card request.',1;
        END
        ELSE
        BEGIN
            IF @ActorUserId=@EmpUser THROW 50403,N'You cannot act on your own request.',1;
            IF @Status=N'PendingManager' AND @Action IN(N'Approve',N'Reject')
                SET @Allowed=CASE WHEN @ManagerUser=@ActorUserId OR @IsAdmin=1 OR (@ManagerUser IS NULL AND dbo.fn_HasPermission(@ActorUserId,N'Cards.ManagerApprove')=1) THEN 1 ELSE 0 END;
            IF @Status=N'PendingHR' AND @Action IN(N'Verify',N'Reject') SET @Allowed=dbo.fn_HasPermission(@ActorUserId,N'Cards.HrVerify');
            IF @Status=N'PendingSecurity' AND @Action IN(N'Approve',N'Reject') SET @Allowed=dbo.fn_HasPermission(@ActorUserId,N'Cards.SecurityReview');
            IF @Status=N'PendingIdCardTeam' AND @Action IN(N'Approve',N'Reject') OR @Status=N'Printing' AND @Action=N'MarkPrinted' OR @Status=N'ReadyToIssue' AND @Action=N'Issue'
                SET @Allowed=dbo.fn_HasPermission(@ActorUserId,N'Cards.Process');
            IF @Allowed=0 THROW 50403,N'You are not authorized for the current card request stage.',1;
        END
        DECLARE @Now DATETIME2(3)=SYSUTCDATETIME(),@Next NVARCHAR(30)=@Status;
        IF @Action=N'Cancel' SET @Next=N'Cancelled';
        ELSE IF @Action=N'Reject' SET @Next=N'Rejected';
        ELSE IF @Status=N'PendingManager' SET @Next=N'PendingHR';
        ELSE IF @Status=N'PendingHR' SET @Next=CASE WHEN @RequestType=N'Lost' THEN N'PendingSecurity' ELSE N'PendingIdCardTeam' END;
        ELSE IF @Status=N'PendingSecurity' SET @Next=N'PendingIdCardTeam';
        ELSE IF @Status=N'PendingIdCardTeam' SET @Next=N'Printing';
        ELSE IF @Status=N'Printing' SET @Next=N'ReadyToIssue';
        ELSE IF @Status=N'ReadyToIssue' SET @Next=N'Closed';
        ELSE THROW 50409,N'This action is not allowed in the current status.',1;
        IF @Status=N'PendingSecurity' AND @Action=N'Approve' AND @OldCardId IS NOT NULL
            UPDATE dbo.RFIDCards SET Status=N'Deactivated',UpdatedAtUtc=@Now,UpdatedByUserId=@ActorUserId WHERE CardId=@OldCardId;
        IF @Action=N'MarkPrinted'
        BEGIN
            DECLARE @Uid NVARCHAR(64)=UPPER(LEFT(REPLACE(CONVERT(NVARCHAR(36),NEWID()),N'-',N''),16));
            INSERT dbo.RFIDCards(CardUid,EmployeeId,CardType,Status,CardRequestId,CreatedByUserId)
            VALUES(@Uid,@EmpId,N'Permanent',N'Requested',@CardRequestId,@ActorUserId);
            SET @NewCardId=SCOPE_IDENTITY();
        END
        IF @Action=N'Issue'
        BEGIN
            IF @NewCardId IS NULL THROW 50422,N'Printed card record is missing.',1;
            UPDATE dbo.RFIDCards SET Status=N'Active',IssuedAtUtc=@Now,ActivatedAtUtc=@Now,ExpiresAtUtc=DATEADD(YEAR,3,@Now),
                UpdatedAtUtc=@Now,UpdatedByUserId=@ActorUserId WHERE CardId=@NewCardId AND EmployeeId=@EmpId;
            IF @RequestType IN(N'Lost',N'Damaged') AND @OldCardId IS NOT NULL
                UPDATE dbo.RFIDCards SET Status=N'Deactivated',UpdatedAtUtc=@Now,UpdatedByUserId=@ActorUserId
                WHERE CardId=@OldCardId AND Status<>N'Deactivated';
        END
        UPDATE dbo.CardRequests SET Status=@Next,NewCardId=ISNULL(@NewCardId,NewCardId),UpdatedAtUtc=@Now,
            VerifiedByUserId=CASE WHEN @Action=N'Verify' THEN @ActorUserId ELSE VerifiedByUserId END,
            VerifiedAtUtc=CASE WHEN @Action=N'Verify' THEN @Now ELSE VerifiedAtUtc END,
            ApprovedByUserId=CASE WHEN @Action IN(N'Approve',N'Reject',N'Issue') THEN @ActorUserId ELSE ApprovedByUserId END,
            DecidedAtUtc=CASE WHEN @Next IN(N'Rejected',N'Cancelled',N'Closed') THEN @Now ELSE DecidedAtUtc END,
            ClosedAtUtc=CASE WHEN @Next=N'Closed' THEN @Now ELSE ClosedAtUtc END,DecisionComments=ISNULL(@Comments,DecisionComments)
        WHERE CardRequestId=@CardRequestId;
        INSERT dbo.CardRequestHistory(CardRequestId,FromStatus,ToStatus,Action,Comments,ActorUserId)
        VALUES(@CardRequestId,@Status,@Next,@Action,@Comments,@ActorUserId);
        DECLARE @Summary NVARCHAR(500)=CONCAT(N'Card request ',@Number,N': ',@Status,N' -> ',@Next,N'.');
        DECLARE @Before NVARCHAR(MAX)=(SELECT @Status status FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),@After NVARCHAR(MAX)=(SELECT @Next status FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        DECLARE @AuditAction NVARCHAR(100)=CONCAT(N'CardRequest.',@Action),@Route NVARCHAR(200)=CONCAT(N'/cards/requests/',@CardRequestId),
                @Title NVARCHAR(200)=CASE WHEN @Next=N'ReadyToIssue' THEN N'Your ID card is ready for collection' ELSE N'ID card request updated' END;
        EXEC dbo.usp_Audit_Write @ActorUserId,@AuditAction,N'CardRequest',@CardRequestId,@Summary,@Before,@After,@Comments,@CorrelationId,@IpAddress;
        EXEC dbo.usp_Notification_Create @Requester,N'CardRequest',@Title,@Summary,N'CardRequest',@CardRequestId,@Route,@ActorUserId;
        IF @Next=N'PendingHR' EXEC dbo.usp_Notification_CreateForRole N'HRAdmin',@LocId,N'CardRequest',N'ID card request requires HR verification',@Summary,N'CardRequest',@CardRequestId,@Route,@ActorUserId;
        IF @Next=N'PendingSecurity' EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam',@LocId,N'CardRequest',N'Lost card requires security review',@Summary,N'CardRequest',@CardRequestId,@Route,@ActorUserId;
        IF @Next=N'PendingIdCardTeam' EXEC dbo.usp_Notification_CreateForRole N'IdCardTeam',@LocId,N'CardRequest',N'ID card request requires processing',@Summary,N'CardRequest',@CardRequestId,@Route,@ActorUserId;
        COMMIT;
        EXEC dbo.usp_CardRequest_Get @ActorUserId,@CardRequestId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
    END CATCH
END
GO
