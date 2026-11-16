/*=====================================================================
  EIWAMS - 08_SP_Visitors.sql
  Visitors and visitor passes:
  PendingApproval -> Approved -> Active (check-in) -> CheckedOut, or Expired / Revoked.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Visitor_Search
    @ActorUserId INT,
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

    SELECT COUNT(*) AS TotalCount FROM dbo.vw_Visitors v
    WHERE @Search IS NULL OR v.DisplayName LIKE N'%' + @Search + N'%' OR v.Organization LIKE N'%' + @Search + N'%';

    SELECT v.VisitorId, v.DisplayName, v.Organization, v.ContactReference, v.VisitPurpose, v.SponsorUserId, v.SponsorName, v.IsBlacklisted,
           v.CreatedAtUtc, v.PassCount
    FROM dbo.vw_Visitors v
    WHERE @Search IS NULL OR v.DisplayName LIKE N'%' + @Search + N'%' OR v.Organization LIKE N'%' + @Search + N'%'
    ORDER BY v.CreatedAtUtc DESC, v.VisitorId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Visitor_Create
    @ActorUserId      INT,
    @DisplayName      NVARCHAR(150),
    @Organization     NVARCHAR(150) = NULL,
    @ContactReference NVARCHAR(150) = NULL,
    @VisitPurpose     NVARCHAR(500),
    @SponsorUserId    INT = NULL,
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @DisplayName = NULLIF(LTRIM(RTRIM(@DisplayName)), N'');
        SET @VisitPurpose = NULLIF(LTRIM(RTRIM(@VisitPurpose)), N'');
        IF @DisplayName IS NULL OR @VisitPurpose IS NULL THROW 50400, N'Display name and visit purpose are required.', 1;
        IF @SponsorUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @SponsorUserId AND IsActive = 1)
            THROW 50400, N'The sponsor does not exist or is inactive.', 1;
        BEGIN TRAN;
        INSERT dbo.Visitors (DisplayName, Organization, ContactReference, VisitPurpose, SponsorUserId, CreatedByUserId)
        VALUES (@DisplayName, NULLIF(LTRIM(RTRIM(@Organization)), N''), NULLIF(LTRIM(RTRIM(@ContactReference)), N''), @VisitPurpose,
                ISNULL(@SponsorUserId, @ActorUserId), @ActorUserId);
        DECLARE @Id INT = SCOPE_IDENTITY();
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Visitor ', @DisplayName, N' registered.');
        DECLARE @After NVARCHAR(MAX) = (SELECT VisitorId, DisplayName, Organization, VisitPurpose, SponsorName FROM dbo.vw_Visitors WHERE VisitorId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Visitor.Created', N'Visitor', @Id, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;
        COMMIT;
        SELECT v.VisitorId, v.DisplayName, v.Organization, v.ContactReference, v.VisitPurpose, v.SponsorUserId, v.SponsorName, v.IsBlacklisted,
               v.CreatedAtUtc, v.PassCount
        FROM dbo.vw_Visitors v WHERE v.VisitorId = @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_VisitorPass_Search
    @ActorUserId INT,
    @Status      NVARCHAR(20) = NULL,
    @LocationId  INT = NULL,
    @From        DATETIME2(3) = NULL,
    @To          DATETIME2(3) = NULL,
    @OnSite      BIT = NULL,
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
    IF @From IS NOT NULL AND @To IS NOT NULL AND @From > @To THROW 50400, N'from must be on or before to.', 1;

    CREATE TABLE #f (VisitorPassId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT p.VisitorPassId
    FROM dbo.vw_VisitorPasses p
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = p.LocationId
    WHERE (@Status IS NULL OR p.Status = @Status)
      AND (@LocationId IS NULL OR p.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@From IS NULL OR p.ValidToUtc >= @From)
      AND (@To IS NULL OR p.ValidFromUtc <= @To)
      AND (ISNULL(@OnSite, 0) = 0 OR p.Status = N'Active')
      AND (@Search IS NULL OR p.PassNumber LIKE N'%' + @Search + N'%' OR p.VisitorName LIKE N'%' + @Search + N'%' OR p.Organization LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT p.VisitorPassId, p.PassNumber, p.VisitorId, p.VisitorName, p.Organization, p.LocationId, p.LocationName, p.SponsorUserId, p.SponsorName,
           p.ValidFromUtc, p.ValidToUtc, p.Status, p.ApprovedByName, p.ApprovedAtUtc, p.CheckedInAtUtc, p.CheckedOutAtUtc, p.RevokeReason
    FROM dbo.vw_VisitorPasses p JOIN #f f ON f.VisitorPassId = p.VisitorPassId
    ORDER BY p.ValidFromUtc DESC, p.VisitorPassId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectVisitorPass
    @VisitorPassId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.VisitorPassId, p.PassNumber, p.VisitorId, p.VisitorName, p.Organization, p.LocationId, p.LocationName, p.SponsorUserId, p.SponsorName,
           p.ValidFromUtc, p.ValidToUtc, p.Status, p.ApprovedByName, p.ApprovedAtUtc, p.CheckedInAtUtc, p.CheckedOutAtUtc, p.RevokeReason
    FROM dbo.vw_VisitorPasses p WHERE p.VisitorPassId = @VisitorPassId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_VisitorPass_Create
    @ActorUserId   INT,
    @VisitorId     INT,
    @LocationId    INT,
    @ValidFromUtc  DATETIME2(3),
    @ValidToUtc    DATETIME2(3),
    @SponsorUserId INT = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @ValidFromUtc IS NULL OR @ValidToUtc IS NULL THROW 50400, N'Valid-from and valid-to are required.', 1;
        IF @ValidToUtc <= @ValidFromUtc THROW 50400, N'Valid-to must be after valid-from.', 1;
        IF @ValidToUtc <= SYSUTCDATETIME() THROW 50400, N'Valid-to must be in the future.', 1;
        DECLARE @MaxHours INT = dbo.fn_SettingInt(N'Visitor.MaxPassHours', 24);
        IF DATEDIFF(MINUTE, @ValidFromUtc, @ValidToUtc) > @MaxHours * 60
        BEGIN
            DECLARE @Msg NVARCHAR(200) = CONCAT(N'A visitor pass cannot exceed ', @MaxHours, N' hours.');
            THROW 50400, @Msg, 1;
        END
        DECLARE @VisitorName NVARCHAR(150), @VisitorSponsor INT;
        SELECT @VisitorName = DisplayName, @VisitorSponsor = SponsorUserId FROM dbo.Visitors WHERE VisitorId = @VisitorId;
        IF @VisitorName IS NULL THROW 50404, N'Visitor not found.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @LocationId AND IsActive = 1) THROW 50400, N'The location does not exist or is inactive.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0 THROW 50403, N'The location is outside your facility scope.', 1;
        IF @SponsorUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @SponsorUserId AND IsActive = 1)
            THROW 50400, N'The sponsor does not exist or is inactive.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Blacklist WHERE SubjectType = N'Visitor' AND SubjectId = @VisitorId AND IsActive = 1)
            THROW 50422, N'The visitor is blacklisted; a pass cannot be issued.', 1;

        BEGIN TRAN;
        DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_VisitorPassNumber;
        DECLARE @Number NVARCHAR(20) = CONCAT(N'VP-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'00000', @Seq), 5));
        INSERT dbo.VisitorPasses (PassNumber, VisitorId, LocationId, SponsorUserId, ValidFromUtc, ValidToUtc, Status, CreatedByUserId)
        VALUES (@Number, @VisitorId, @LocationId, COALESCE(@SponsorUserId, @VisitorSponsor, @ActorUserId), @ValidFromUtc, @ValidToUtc, N'PendingApproval', @ActorUserId);
        DECLARE @Id BIGINT = SCOPE_IDENTITY();
        DECLARE @Summary NVARCHAR(500) = (SELECT CONCAT(N'Visitor pass ', PassNumber, N' requested for ', VisitorName, N' at ', LocationName, N'.')
                                          FROM dbo.vw_VisitorPasses WHERE VisitorPassId = @Id);
        DECLARE @After NVARCHAR(MAX) = (SELECT VisitorPassId, PassNumber, VisitorName, LocationName, ValidFromUtc, ValidToUtc, Status
                                        FROM dbo.vw_VisitorPasses WHERE VisitorPassId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'VisitorPass.Created', N'VisitorPass', @Id, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Notification_CreateForRole N'AccessControlTeam', @LocationId, N'VisitorPassApproval', N'Visitor pass awaiting approval', @Summary,
             N'VisitorPass', @Id, N'/visitors', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectVisitorPass @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- Shared state machine for approve / check-in / check-out / revoke.
CREATE OR ALTER PROCEDURE dbo.usp_VisitorPass_Transition
    @ActorUserId   INT,
    @VisitorPassId BIGINT,
    @Action        NVARCHAR(20),
    @Comments      NVARCHAR(1000) = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Comments = NULLIF(LTRIM(RTRIM(@Comments)), N'');
        IF @Action NOT IN (N'Approve', N'CheckIn', N'CheckOut', N'Revoke') THROW 50400, N'Invalid visitor pass action.', 1;
        IF @Action = N'Revoke' AND @Comments IS NULL THROW 50400, N'A reason is required to revoke a pass.', 1;
        DECLARE @LocId INT;
        SELECT @LocId = LocationId FROM dbo.VisitorPasses WHERE VisitorPassId = @VisitorPassId;
        IF @LocId IS NULL OR dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50404, N'Visitor pass not found.', 1;

        BEGIN TRAN;
        DECLARE @Status NVARCHAR(20), @From DATETIME2(3), @To DATETIME2(3), @CreatedBy INT, @Sponsor INT, @VisitorId INT, @Number NVARCHAR(20);
        SELECT @Status = Status, @From = ValidFromUtc, @To = ValidToUtc, @CreatedBy = CreatedByUserId, @Sponsor = SponsorUserId,
               @VisitorId = VisitorId, @Number = PassNumber
        FROM dbo.VisitorPasses WITH (UPDLOCK) WHERE VisitorPassId = @VisitorPassId;
        DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
        IF @Status IN (N'PendingApproval', N'Approved') AND @To <= @Now SET @Status = N'Expired';

        DECLARE @NewStatus NVARCHAR(20);
        IF @Action = N'Approve'
        BEGIN
            IF @Status <> N'PendingApproval' THROW 50409, N'Only passes pending approval can be approved.', 1;
            IF @CreatedBy = @ActorUserId THROW 50403, N'You cannot approve a visitor pass you created.', 1;
            SET @NewStatus = N'Approved';
            UPDATE dbo.VisitorPasses SET Status = @NewStatus, ApprovedByUserId = @ActorUserId, ApprovedAtUtc = @Now, ApprovalComments = @Comments
            WHERE VisitorPassId = @VisitorPassId;
        END
        ELSE IF @Action = N'CheckIn'
        BEGIN
            IF @Status <> N'Approved' THROW 50409, N'Only approved passes can be checked in.', 1;
            IF @Now < DATEADD(MINUTE, -30, @From) OR @Now >= @To THROW 50422, N'Check-in is only allowed within the pass validity window.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Blacklist WHERE SubjectType = N'Visitor' AND SubjectId = @VisitorId AND IsActive = 1)
                THROW 50422, N'The visitor is blacklisted; check-in is not allowed.', 1;
            SET @NewStatus = N'Active';
            UPDATE dbo.VisitorPasses SET Status = @NewStatus, CheckedInAtUtc = @Now WHERE VisitorPassId = @VisitorPassId;
        END
        ELSE IF @Action = N'CheckOut'
        BEGIN
            IF @Status <> N'Active' THROW 50409, N'Only checked-in passes can be checked out.', 1;
            SET @NewStatus = N'CheckedOut';
            UPDATE dbo.VisitorPasses SET Status = @NewStatus, CheckedOutAtUtc = @Now WHERE VisitorPassId = @VisitorPassId;
        END
        ELSE
        BEGIN
            IF @Status NOT IN (N'PendingApproval', N'Approved', N'Active') THROW 50409, N'The pass can no longer be revoked.', 1;
            SET @NewStatus = N'Revoked';
            UPDATE dbo.VisitorPasses SET Status = @NewStatus, RevokedByUserId = @ActorUserId, RevokedAtUtc = @Now, RevokeReason = @Comments,
                   CheckedOutAtUtc = CASE WHEN @Status = N'Active' THEN @Now ELSE CheckedOutAtUtc END
            WHERE VisitorPassId = @VisitorPassId;
        END

        DECLARE @AuditAction NVARCHAR(100) = CONCAT(N'VisitorPass.', CASE @Action WHEN N'Approve' THEN N'Approved' WHEN N'CheckIn' THEN N'CheckedIn'
                                                                          WHEN N'CheckOut' THEN N'CheckedOut' ELSE N'Revoked' END);
        DECLARE @Summary NVARCHAR(500) = (SELECT CONCAT(N'Visitor pass ', PassNumber, N' for ', VisitorName, N': ', @Status, N' -> ', @NewStatus, N'.')
                                          FROM dbo.vw_VisitorPasses WHERE VisitorPassId = @VisitorPassId);
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT @NewStatus AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, @AuditAction, N'VisitorPass', @VisitorPassId, @Summary, @Before, @After, @Comments, @CorrelationId, @IpAddress;
        IF @Action IN (N'Approve', N'Revoke')
        BEGIN
            EXEC dbo.usp_Notification_Create @CreatedBy, N'VisitorPassUpdated', N'Visitor pass updated', @Summary, N'VisitorPass', @VisitorPassId, N'/visitors', @ActorUserId;
            IF ISNULL(@Sponsor, -1) <> @CreatedBy
                EXEC dbo.usp_Notification_Create @Sponsor, N'VisitorPassUpdated', N'Visitor pass updated', @Summary, N'VisitorPass', @VisitorPassId, N'/visitors', @ActorUserId;
        END
        ELSE IF @Action = N'CheckIn'
            EXEC dbo.usp_Notification_Create @Sponsor, N'VisitorArrived', N'Your visitor has arrived', @Summary, N'VisitorPass', @VisitorPassId, N'/visitors', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectVisitorPass @VisitorPassId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
