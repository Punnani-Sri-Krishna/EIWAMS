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
    JOIN dbo.fn_UserLocationScope(@UserId) s ON s.LocationId = e.LocationId
    WHERE EXISTS (SELECT 1 FROM dbo.fn_UserPermissions(@UserId) p
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
            DECLARE @CrStatus NVARCHAR(30), @CrEmp INT;
            SELECT @CrStatus = Status, @CrEmp = EmployeeId FROM dbo.CardRequests WITH (UPDLOCK) WHERE CardRequestId = @CardRequestId;
            IF @CrStatus IS NULL THROW 50404, N'Card request not found.', 1;
            IF @CrEmp <> @EmployeeId THROW 50400, N'The card request belongs to another employee.', 1;
            IF @CrStatus <> N'Approved' THROW 50409, N'Only approved card requests can be fulfilled.', 1;
        END

        INSERT dbo.RFIDCards (CardUid, EmployeeId, CardType, Status, ExpiresAtUtc, CardRequestId, CreatedByUserId)
        VALUES (@CardUid, @EmployeeId, @CardType, N'Requested', @ExpiresAtUtc, @CardRequestId, @ActorUserId);
        DECLARE @Id BIGINT = SCOPE_IDENTITY();

        IF @CardRequestId IS NOT NULL
            UPDATE dbo.CardRequests SET Status = N'Issued', NewCardId = @Id WHERE CardRequestId = @CardRequestId;

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

-- BR-03: the card is blocked immediately and a Lost card request is raised for replacement.
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
        EXEC dbo.usp_Internal_CardChangeStatus @ActorUserId, @CardId, N'Lost', @Reason, NULL, @CorrelationId, @IpAddress;

        DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_CardRequestNumber;
        DECLARE @Number NVARCHAR(20) = CONCAT(N'CR-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'00000', @Seq), 5));
        INSERT dbo.CardRequests (RequestNumber, RequestType, EmployeeId, OldCardId, Reason, Status, RequestedByUserId)
        VALUES (@Number, N'Lost', @EmpId, @CardId, @Reason, N'Submitted', @ActorUserId);
        DECLARE @CrId BIGINT = SCOPE_IDENTITY();
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Card request ', @Number, N' (Lost) raised for replacement.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'CardRequest.Created', N'CardRequest', @CrId, @Summary, NULL, NULL, @Reason, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @LocId, N'CardRequestSubmitted', N'Lost card reported', @Summary,
             N'CardRequest', @CrId, N'/cards', @ActorUserId;
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

        -- Close any open Lost/Damaged/Replacement request for the old card; otherwise record the replacement as an issued request.
        DECLARE @CrId BIGINT = (SELECT TOP (1) CardRequestId FROM dbo.CardRequests
                                WHERE OldCardId = @CardId AND Status IN (N'Submitted', N'VerificationPending', N'Approved') ORDER BY CardRequestId DESC);
        IF @CrId IS NOT NULL
            UPDATE dbo.CardRequests SET Status = N'Issued', NewCardId = @NewId,
                   ApprovedByUserId = ISNULL(ApprovedByUserId, @ActorUserId), DecidedAtUtc = ISNULL(DecidedAtUtc, SYSUTCDATETIME())
            WHERE CardRequestId = @CrId;
        ELSE
        BEGIN
            DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_CardRequestNumber;
            INSERT dbo.CardRequests (RequestNumber, RequestType, EmployeeId, OldCardId, NewCardId, Reason, Status, RequestedByUserId, ApprovedByUserId, DecidedAtUtc)
            VALUES (CONCAT(N'CR-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'00000', @Seq), 5)), N'Replacement', @EmpId, @CardId, @NewId, @Reason,
                    N'Issued', @ActorUserId, @ActorUserId, SYSUTCDATETIME());
            SET @CrId = SCOPE_IDENTITY();
        END
        UPDATE dbo.RFIDCards SET CardRequestId = @CrId WHERE CardId = @NewId;

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
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    CREATE TABLE #f (CardRequestId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT r.CardRequestId
    FROM dbo.vw_CardRequests r
    WHERE (r.RequestedByUserId = @ActorUserId OR r.EmployeeId IN (SELECT EmployeeId FROM dbo.fn_CardEmployees(@ActorUserId)))
      AND (@Status IS NULL OR r.Status = @Status)
      AND (@RequestType IS NULL OR r.RequestType = @RequestType)
      AND (@EmployeeId IS NULL OR r.EmployeeId = @EmployeeId)
      AND (@Search IS NULL OR r.RequestNumber LIKE N'%' + @Search + N'%' OR r.EmployeeName LIKE N'%' + @Search + N'%'
           OR r.EmployeeNumber LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT r.CardRequestId, r.RequestNumber, r.RequestType, r.EmployeeId, r.EmployeeName, r.EmployeeNumber, r.OldCardId, r.NewCardId, r.Reason,
           r.Status, r.RequestedAtUtc, r.RequestedByName, r.VerifiedByName, r.ApprovedByName, r.DecidedAtUtc, r.DecisionComments, r.RequestedValidToUtc
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
