/*=====================================================================
  EIWAMS - 07_SP_Rfid_Security.sql
  RFID event ingest (idempotent per reader + external event id),
  access log search, violations, incidents (with notes) and blacklist.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*------------------------------ RFID ingest -------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_RfidEvent_Ingest
    @ActorUserId     INT,
    @ReaderId        NVARCHAR(80),
    @ExternalEventId NVARCHAR(100),
    @CardUid         NVARCHAR(64),
    @EventType       NVARCHAR(10),
    @EventAtUtc      DATETIME2(3),
    @CorrelationId   UNIQUEIDENTIFIER = NULL,
    @IpAddress       VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @ReaderId = NULLIF(LTRIM(RTRIM(@ReaderId)), N'');
        SET @ExternalEventId = NULLIF(LTRIM(RTRIM(@ExternalEventId)), N'');
        SET @CardUid = UPPER(NULLIF(LTRIM(RTRIM(@CardUid)), N''));
        IF @ReaderId IS NULL OR @ExternalEventId IS NULL OR @CardUid IS NULL OR @EventAtUtc IS NULL
            THROW 50400, N'readerId, externalEventId, cardUid and eventAtUtc are required.', 1;
        IF @EventType NOT IN (N'Entry', N'Exit') THROW 50400, N'eventType must be Entry or Exit.', 1;
        IF @EventAtUtc > DATEADD(MINUTE, 5, SYSUTCDATETIME()) THROW 50400, N'eventAtUtc cannot be in the future.', 1;

        DECLARE @ReaderLoc INT, @ReaderActive BIT;
        SELECT @ReaderLoc = LocationId, @ReaderActive = IsActive FROM dbo.Readers WHERE ReaderId = @ReaderId;
        IF @ReaderLoc IS NULL THROW 50404, N'Reader not found.', 1;
        IF @ReaderActive = 0 THROW 50422, N'The reader is inactive; events are not accepted.', 1;
        IF dbo.fn_UserCanAccessLocation(@ActorUserId, @ReaderLoc) = 0 THROW 50403, N'The reader is outside your facility scope.', 1;

        BEGIN TRAN;
        DECLARE @ExistingId BIGINT;
        SELECT @ExistingId = AccessLogId FROM dbo.AccessLogs WITH (UPDLOCK, HOLDLOCK)
        WHERE ReaderId = @ReaderId AND ExternalEventId = @ExternalEventId;
        IF @ExistingId IS NOT NULL
        BEGIN
            COMMIT;
            SELECT l.AccessLogId, l.ProcessingStatus, l.Decision, l.DenialReason,
                   (SELECT MIN(v.ViolationId) FROM dbo.AccessViolations v WHERE v.AccessLogId = l.AccessLogId) AS ViolationId,
                   CAST(1 AS BIT) AS IsDuplicate
            FROM dbo.AccessLogs l WHERE l.AccessLogId = @ExistingId;
            RETURN;
        END

        DECLARE @Hash VARBINARY(32) = HASHBYTES('SHA2_256', @CardUid);
        DECLARE @Masked NVARCHAR(16) = dbo.fn_MaskCardUid(@CardUid);
        DECLARE @CardId BIGINT, @CardStatus NVARCHAR(20), @CardExpires DATETIME2(3), @EmpId INT, @EmpStatus NVARCHAR(20);
        SELECT @CardId = c.CardId, @CardStatus = c.Status, @CardExpires = c.ExpiresAtUtc, @EmpId = c.EmployeeId, @EmpStatus = e.EmploymentStatus
        FROM dbo.RFIDCards c JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId
        WHERE c.CardUid = @CardUid;

        DECLARE @Decision NVARCHAR(10) = N'Granted', @Denial NVARCHAR(40), @VType NVARCHAR(30), @Severity NVARCHAR(10),
                @Processing NVARCHAR(20) = N'Processed', @PermissionId BIGINT;
        -- Nearest restricted location at or above the reader. A permission opens the reader when it is on that location,
        -- on a location between it and the reader, or on an area inside the reader's location (access to an inner area
        -- includes passage through its parents). Building access alone does not open restricted floors/wings/zones.
        DECLARE @RestrictedDepth INT = (SELECT MIN(a.Depth) FROM dbo.fn_LocationAncestors(@ReaderLoc) a
                                        JOIN dbo.Locations l ON l.LocationId = a.LocationId WHERE l.IsRestricted = 1);
        DECLARE @Covering TABLE (LocationId INT PRIMARY KEY, SortOrder INT NOT NULL);
        IF @RestrictedDepth IS NOT NULL
        BEGIN
            INSERT @Covering (LocationId, SortOrder)
            SELECT LocationId, Depth FROM dbo.fn_LocationAncestors(@ReaderLoc) WHERE Depth <= @RestrictedDepth;
            INSERT @Covering (LocationId, SortOrder)
            SELECT LocationId, 100 + Depth FROM dbo.fn_LocationDescendants(@ReaderLoc) WHERE Depth > 0;
        END

        IF @CardId IS NULL
            SELECT @Decision = N'Denied', @Denial = N'UnknownCard', @VType = N'EventAnomaly', @Severity = N'Medium', @Processing = N'Review';
        ELSE IF @CardStatus IN (N'Lost', N'Blocked')
            SELECT @Decision = N'Denied', @Denial = CASE @CardStatus WHEN N'Lost' THEN N'CardLost' ELSE N'CardBlocked' END, @VType = N'BlockedCard', @Severity = N'High';
        ELSE IF @CardStatus <> N'Active'
            SELECT @Decision = N'Denied', @Denial = N'CardInactive', @VType = N'BlockedCard', @Severity = N'Medium';
        ELSE IF @CardExpires IS NOT NULL AND @CardExpires <= @EventAtUtc
            SELECT @Decision = N'Denied', @Denial = N'CardExpired', @VType = N'BlockedCard', @Severity = N'Medium';
        ELSE IF @EmpStatus <> N'Active'
            SELECT @Decision = N'Denied', @Denial = N'EmployeeInactive', @VType = N'UnauthorizedZone', @Severity = N'High';
        ELSE IF EXISTS (SELECT 1 FROM dbo.Blacklist WHERE IsActive = 1
                        AND ((SubjectType = N'Employee' AND SubjectId = @EmpId) OR (SubjectType = N'Card' AND SubjectId = @CardId)))
            SELECT @Decision = N'Denied', @Denial = N'Blacklisted', @VType = N'UnauthorizedZone', @Severity = N'Critical';
        ELSE IF @EventType = N'Entry' AND @RestrictedDepth IS NOT NULL
        BEGIN
            SELECT TOP (1) @PermissionId = p.PermissionId
            FROM dbo.AccessPermissions p JOIN @Covering c ON c.LocationId = p.LocationId
            WHERE p.EmployeeId = @EmpId
              AND p.Status = N'Active' AND p.ValidFromUtc <= @EventAtUtc AND p.ValidToUtc > @EventAtUtc
            ORDER BY c.SortOrder;
            IF @PermissionId IS NULL
            BEGIN
                IF EXISTS (SELECT 1 FROM dbo.AccessPermissions p JOIN @Covering c ON c.LocationId = p.LocationId
                           WHERE p.EmployeeId = @EmpId
                             AND (p.Status = N'Expired' OR (p.Status = N'Active' AND (p.ValidToUtc <= @EventAtUtc OR p.ValidFromUtc > @EventAtUtc))))
                    SELECT @Decision = N'Denied', @Denial = N'PermissionExpired', @VType = N'ExpiredPermission', @Severity = N'Medium';
                ELSE
                    SELECT @Decision = N'Denied', @Denial = N'NoPermission', @VType = N'UnauthorizedZone', @Severity = N'High';
            END
        END

        INSERT dbo.AccessLogs (ExternalEventId, ReaderId, MaskedCardUid, CardUidHash, CardId, EmployeeId, LocationId, EventType, Decision,
                               DenialReason, PermissionId, EventAtUtc, ProcessingStatus, CorrelationId)
        VALUES (@ExternalEventId, @ReaderId, @Masked, @Hash, @CardId, @EmpId, @ReaderLoc, @EventType, @Decision,
                @Denial, @PermissionId, @EventAtUtc, @Processing, @CorrelationId);
        DECLARE @LogId BIGINT = SCOPE_IDENTITY(), @ViolationId BIGINT;

        IF @VType IS NOT NULL
        BEGIN
            INSERT dbo.AccessViolations (AccessLogId, EmployeeId, CardId, LocationId, ViolationType, Severity)
            VALUES (@LogId, @EmpId, @CardId, @ReaderLoc, @VType, @Severity);
            SET @ViolationId = SCOPE_IDENTITY();
        END

        -- Repeated denials of the same card within the configured window raise one extra RepeatedDenied violation per window.
        IF @Decision = N'Denied'
        BEGIN
            DECLARE @Threshold INT = dbo.fn_SettingInt(N'Rfid.RepeatedDeniedThreshold', 3);
            DECLARE @Window INT = dbo.fn_SettingInt(N'Rfid.RepeatedDeniedWindowMinutes', 10);
            DECLARE @WindowStart DATETIME2(3) = DATEADD(MINUTE, -@Window, @EventAtUtc);
            IF (SELECT COUNT(*) FROM dbo.AccessLogs WHERE CardUidHash = @Hash AND Decision = N'Denied' AND EventAtUtc > @WindowStart AND EventAtUtc <= @EventAtUtc) >= @Threshold
               AND NOT EXISTS (SELECT 1 FROM dbo.AccessViolations v JOIN dbo.AccessLogs l ON l.AccessLogId = v.AccessLogId
                               WHERE v.ViolationType = N'RepeatedDenied' AND l.CardUidHash = @Hash AND l.EventAtUtc > @WindowStart)
            BEGIN
                INSERT dbo.AccessViolations (AccessLogId, EmployeeId, CardId, LocationId, ViolationType, Severity)
                VALUES (@LogId, @EmpId, @CardId, @ReaderLoc, N'RepeatedDenied', N'High');
                IF @ViolationId IS NULL SET @ViolationId = SCOPE_IDENTITY();
                SET @Severity = N'High';
            END
        END

        UPDATE dbo.Readers SET LastSeenAtUtc = SYSUTCDATETIME() WHERE ReaderId = @ReaderId;

        DECLARE @Summary NVARCHAR(500) = CONCAT(@EventType, N' ', LOWER(@Decision), N' at reader ', @ReaderId, N' for card ', @Masked,
                                                CASE WHEN @Denial IS NOT NULL THEN CONCAT(N' (', @Denial, N')') ELSE N'' END, N'.');
        DECLARE @After NVARCHAR(MAX) = (SELECT @LogId AS accessLogId, @ExternalEventId AS externalEventId, @Masked AS maskedCardUid,
                                               @Decision AS decision, @Denial AS denialReason, @ViolationId AS violationId
                                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Rfid.EventIngested', N'AccessLog', @LogId, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;

        IF @ViolationId IS NOT NULL
        BEGIN
            DECLARE @LocName NVARCHAR(150) = (SELECT LocationName FROM dbo.Locations WHERE LocationId = @ReaderLoc);
            DECLARE @Title NVARCHAR(200) = CONCAT(@Severity, N' access violation at ', @LocName);
            EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @ReaderLoc, N'ViolationDetected', @Title, @Summary,
                 N'AccessViolation', @ViolationId, N'/violations', @ActorUserId;
        END
        COMMIT;

        SELECT @LogId AS AccessLogId, @Processing AS ProcessingStatus, @Decision AS Decision, @Denial AS DenialReason,
               @ViolationId AS ViolationId, CAST(0 AS BIT) AS IsDuplicate;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        -- A concurrent insert of the same (reader, event) pair is still idempotent.
        IF ERROR_NUMBER() IN (2601, 2627) AND EXISTS (SELECT 1 FROM dbo.AccessLogs WHERE ReaderId = @ReaderId AND ExternalEventId = @ExternalEventId)
        BEGIN
            SELECT l.AccessLogId, l.ProcessingStatus, l.Decision, l.DenialReason,
                   (SELECT MIN(v.ViolationId) FROM dbo.AccessViolations v WHERE v.AccessLogId = l.AccessLogId) AS ViolationId,
                   CAST(1 AS BIT) AS IsDuplicate
            FROM dbo.AccessLogs l WHERE l.ReaderId = @ReaderId AND l.ExternalEventId = @ExternalEventId;
            RETURN;
        END;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_AccessLog_Search
    @ActorUserId INT,
    @From        DATETIME2(3) = NULL,
    @To          DATETIME2(3) = NULL,
    @LocationId  INT = NULL,
    @ReaderId    NVARCHAR(80) = NULL,
    @EventType   NVARCHAR(10) = NULL,
    @Decision    NVARCHAR(10) = NULL,
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
    IF @From IS NOT NULL AND @To IS NOT NULL AND @From > @To THROW 50400, N'from must be on or before to.', 1;

    CREATE TABLE #f (AccessLogId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT l.AccessLogId
    FROM dbo.vw_AccessLogs l
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = l.LocationId
    WHERE (@From IS NULL OR l.EventAtUtc >= @From)
      AND (@To IS NULL OR l.EventAtUtc <= @To)
      AND (@LocationId IS NULL OR l.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@ReaderId IS NULL OR l.ReaderId = @ReaderId)
      AND (@EventType IS NULL OR l.EventType = @EventType)
      AND (@Decision IS NULL OR l.Decision = @Decision)
      AND (@EmployeeId IS NULL OR l.EmployeeId = @EmployeeId)
      AND (@Search IS NULL OR l.EmployeeName LIKE N'%' + @Search + N'%' OR l.ExternalEventId LIKE N'%' + @Search + N'%'
           OR l.ReaderName LIKE N'%' + @Search + N'%' OR l.MaskedCardUid LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT l.AccessLogId, l.ExternalEventId, l.ReaderId, l.ReaderName, l.MaskedCardUid, l.CardId, l.EmployeeId, l.EmployeeName,
           l.LocationId, l.LocationName, l.EventType, l.Decision, l.DenialReason, l.EventAtUtc, l.ReceivedAtUtc, l.ProcessingStatus
    FROM dbo.vw_AccessLogs l JOIN #f f ON f.AccessLogId = l.AccessLogId
    ORDER BY l.EventAtUtc DESC, l.AccessLogId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/*------------------------------ Violations --------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Violation_Search
    @ActorUserId   INT,
    @Status        NVARCHAR(20) = NULL,
    @ViolationType NVARCHAR(30) = NULL,
    @Severity      NVARCHAR(10) = NULL,
    @LocationId    INT = NULL,
    @From          DATETIME2(3) = NULL,
    @To            DATETIME2(3) = NULL,
    @Search        NVARCHAR(200) = NULL,
    @Page          INT = 1,
    @PageSize      INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    IF @From IS NOT NULL AND @To IS NOT NULL AND @From > @To THROW 50400, N'from must be on or before to.', 1;

    CREATE TABLE #f (ViolationId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT v.ViolationId
    FROM dbo.vw_Violations v
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = v.LocationId
    WHERE (@Status IS NULL OR v.Status = @Status)
      AND (@ViolationType IS NULL OR v.ViolationType = @ViolationType)
      AND (@Severity IS NULL OR v.Severity = @Severity)
      AND (@LocationId IS NULL OR v.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@From IS NULL OR v.DetectedAtUtc >= @From)
      AND (@To IS NULL OR v.DetectedAtUtc <= @To)
      AND (@Search IS NULL OR v.EmployeeName LIKE N'%' + @Search + N'%' OR v.LocationName LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT v.ViolationId, v.AccessLogId, v.EmployeeId, v.EmployeeName, v.LocationId, v.LocationName, v.ViolationType, v.Severity, v.Status,
           v.DetectedAtUtc, v.ReviewNotes, v.ReviewedByName, v.ReviewedAtUtc, v.IncidentId
    FROM dbo.vw_Violations v JOIN #f f ON f.ViolationId = v.ViolationId
    ORDER BY CASE v.Status WHEN N'Open' THEN 0 WHEN N'UnderReview' THEN 1 ELSE 2 END,
             CASE v.Severity WHEN N'Critical' THEN 0 WHEN N'High' THEN 1 WHEN N'Medium' THEN 2 ELSE 3 END,
             v.DetectedAtUtc DESC, v.ViolationId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER FUNCTION dbo.fn_SecurityTransitionAllowed (@From NVARCHAR(20), @To NVARCHAR(20), @AllowReopen BIT)
RETURNS BIT
AS
BEGIN
    RETURN CASE
        WHEN @From = N'Open' AND @To IN (N'UnderReview', N'Confirmed', N'FalsePositive') THEN 1
        WHEN @From = N'UnderReview' AND @To IN (N'Confirmed', N'FalsePositive') THEN 1
        WHEN @From IN (N'Confirmed', N'FalsePositive') AND @To = N'Closed' THEN 1
        WHEN @AllowReopen = 1 AND @From = N'Closed' AND @To = N'UnderReview' THEN 1
        ELSE 0 END;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_CreateIncident
    @ActorUserId      INT,
    @Title            NVARCHAR(200),
    @Description      NVARCHAR(4000),
    @IncidentType     NVARCHAR(30),
    @Severity         NVARCHAR(10),
    @ViolationId      BIGINT = NULL,
    @LocationId       INT = NULL,
    @AssignedToUserId INT = NULL,
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL,
    @IncidentId       INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_IncidentNumber;
    DECLARE @Number NVARCHAR(20) = CONCAT(N'INC-', YEAR(SYSUTCDATETIME()), N'-', RIGHT(CONCAT(N'00000', @Seq), 5));
    INSERT dbo.SecurityIncidents (IncidentNumber, ViolationId, IncidentType, Title, Description, Severity, LocationId, AssignedToUserId, OpenedByUserId)
    VALUES (@Number, @ViolationId, @IncidentType, @Title, @Description, @Severity, @LocationId, @AssignedToUserId, @ActorUserId);
    SET @IncidentId = SCOPE_IDENTITY();
    IF @ViolationId IS NOT NULL
        UPDATE dbo.AccessViolations SET IncidentId = @IncidentId WHERE ViolationId = @ViolationId;

    DECLARE @After NVARCHAR(MAX) = (SELECT IncidentId, IncidentNumber, IncidentType, Title, Severity, Status, LocationName, AssignedToName, ViolationId
                                    FROM dbo.vw_Incidents WHERE IncidentId = @IncidentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DECLARE @Summary NVARCHAR(500) = CONCAT(N'Incident ', @Number, N' opened: ', @Title);
    EXEC dbo.usp_Audit_Write @ActorUserId, N'Incident.Created', N'SecurityIncident', @IncidentId, @Summary, NULL, @After, NULL, @CorrelationId, @IpAddress;
    DECLARE @Route NVARCHAR(200) = CONCAT(N'/incidents/', @IncidentId);
    IF @AssignedToUserId IS NOT NULL
        EXEC dbo.usp_Notification_Create @AssignedToUserId, N'IncidentAssigned', N'Incident assigned to you', @Summary, N'SecurityIncident', @IncidentId, @Route, @ActorUserId;
    IF @Severity IN (N'High', N'Critical')
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', @LocationId, N'IncidentOpened', N'High-severity incident opened', @Summary,
             N'SecurityIncident', @IncidentId, @Route, @ActorUserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Violation_Review
    @ActorUserId    INT,
    @ViolationId    BIGINT,
    @Status         NVARCHAR(20),
    @ReviewNotes    NVARCHAR(2000),
    @CreateIncident BIT = 0,
    @CorrelationId  UNIQUEIDENTIFIER = NULL,
    @IpAddress      VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @ReviewNotes = NULLIF(LTRIM(RTRIM(@ReviewNotes)), N'');
        IF @Status NOT IN (N'UnderReview', N'Confirmed', N'FalsePositive', N'Closed') THROW 50400, N'Status must be UnderReview, Confirmed, FalsePositive or Closed.', 1;
        IF @ReviewNotes IS NULL THROW 50400, N'Review notes are required.', 1;
        DECLARE @LocId INT;
        SELECT @LocId = LocationId FROM dbo.AccessViolations WHERE ViolationId = @ViolationId;
        IF @LocId IS NULL OR dbo.fn_UserCanAccessLocation(@ActorUserId, @LocId) = 0 THROW 50404, N'Violation not found.', 1;
        IF ISNULL(@CreateIncident, 0) = 1 AND dbo.fn_HasPermission(@ActorUserId, N'Incidents.Manage') = 0
            THROW 50403, N'You do not have permission to open incidents.', 1;

        BEGIN TRAN;
        DECLARE @Old NVARCHAR(20), @IncidentId INT, @VType NVARCHAR(30), @Severity NVARCHAR(10);
        SELECT @Old = Status, @IncidentId = IncidentId, @VType = ViolationType, @Severity = Severity
        FROM dbo.AccessViolations WITH (UPDLOCK) WHERE ViolationId = @ViolationId;
        IF @Old <> @Status AND dbo.fn_SecurityTransitionAllowed(@Old, @Status, 0) = 0
        BEGIN
            DECLARE @Msg NVARCHAR(200) = CONCAT(N'A violation cannot move from ', @Old, N' to ', @Status, N'.');
            THROW 50409, @Msg, 1;
        END
        IF ISNULL(@CreateIncident, 0) = 1 AND @IncidentId IS NOT NULL THROW 50409, N'An incident is already linked to this violation.', 1;

        UPDATE dbo.AccessViolations SET Status = @Status, ReviewNotes = @ReviewNotes, ReviewedByUserId = @ActorUserId, ReviewedAtUtc = SYSUTCDATETIME()
        WHERE ViolationId = @ViolationId;
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Violation #', @ViolationId, N' (', @VType, N') reviewed: ', @Old, N' -> ', @Status, N'.');
        DECLARE @Before NVARCHAR(MAX) = (SELECT @Old AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @After NVARCHAR(MAX) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Violation.Reviewed', N'AccessViolation', @ViolationId, @Summary, @Before, @After, @ReviewNotes, @CorrelationId, @IpAddress;

        IF ISNULL(@CreateIncident, 0) = 1
        BEGIN
            DECLARE @IncType NVARCHAR(30) = CASE WHEN EXISTS (SELECT 1 FROM dbo.AccessLogs l JOIN dbo.AccessViolations v ON v.AccessLogId = l.AccessLogId
                                                              WHERE v.ViolationId = @ViolationId AND l.DenialReason = N'Blacklisted') THEN N'BlacklistHit'
                                                 WHEN @VType = N'EventAnomaly' THEN N'EquipmentFault' ELSE N'UnauthorizedAccess' END;
            DECLARE @IncTitle NVARCHAR(200) = (SELECT CONCAT(ViolationType, N' at ', LocationName, ISNULL(N' - ' + EmployeeName, N''))
                                               FROM dbo.vw_Violations WHERE ViolationId = @ViolationId);
            DECLARE @NewIncident INT;
            EXEC dbo.usp_Internal_CreateIncident @ActorUserId, @IncTitle, @ReviewNotes, @IncType, @Severity, @ViolationId, @LocId, @ActorUserId,
                 @CorrelationId, @IpAddress, @NewIncident OUTPUT;
        END
        COMMIT;

        SELECT ViolationId, AccessLogId, EmployeeId, EmployeeName, LocationId, LocationName, ViolationType, Severity, Status,
               DetectedAtUtc, ReviewNotes, ReviewedByName, ReviewedAtUtc, IncidentId
        FROM dbo.vw_Violations WHERE ViolationId = @ViolationId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------------- Incidents --------------------------*/
CREATE OR ALTER FUNCTION dbo.fn_VisibleIncidents (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT i.IncidentId FROM dbo.SecurityIncidents i
    WHERE i.LocationId IS NULL OR i.AssignedToUserId = @UserId
       OR i.LocationId IN (SELECT LocationId FROM dbo.fn_UserLocationScope(@UserId));
GO

CREATE OR ALTER PROCEDURE dbo.usp_Incident_Search
    @ActorUserId      INT,
    @Status           NVARCHAR(20) = NULL,
    @Severity         NVARCHAR(10) = NULL,
    @AssignedToUserId INT = NULL,
    @Search           NVARCHAR(200) = NULL,
    @Page             INT = 1,
    @PageSize         INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    CREATE TABLE #f (IncidentId INT PRIMARY KEY);
    INSERT #f
    SELECT i.IncidentId
    FROM dbo.vw_Incidents i JOIN dbo.fn_VisibleIncidents(@ActorUserId) x ON x.IncidentId = i.IncidentId
    WHERE (@Status IS NULL OR i.Status = @Status)
      AND (@Severity IS NULL OR i.Severity = @Severity)
      AND (@AssignedToUserId IS NULL OR i.AssignedToUserId = @AssignedToUserId)
      AND (@Search IS NULL OR i.IncidentNumber LIKE N'%' + @Search + N'%' OR i.Title LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;

    SELECT i.IncidentId, i.IncidentNumber, i.ViolationId, i.IncidentType, i.Title, i.Description, i.Severity, i.Status, i.LocationId, i.LocationName,
           i.AssignedToUserId, i.AssignedToName, i.Resolution, i.OpenedByName, i.OpenedAtUtc, i.ClosedAtUtc, i.Version
    FROM dbo.vw_Incidents i JOIN #f f ON f.IncidentId = i.IncidentId
    ORDER BY CASE WHEN i.Status = N'Closed' THEN 1 ELSE 0 END,
             CASE i.Severity WHEN N'Critical' THEN 0 WHEN N'High' THEN 1 WHEN N'Medium' THEN 2 ELSE 3 END,
             i.OpenedAtUtc DESC, i.IncidentId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectIncident
    @IncidentId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT i.IncidentId, i.IncidentNumber, i.ViolationId, i.IncidentType, i.Title, i.Description, i.Severity, i.Status, i.LocationId, i.LocationName,
           i.AssignedToUserId, i.AssignedToName, i.Resolution, i.OpenedByName, i.OpenedAtUtc, i.ClosedAtUtc, i.Version
    FROM dbo.vw_Incidents i WHERE i.IncidentId = @IncidentId;
    SELECT n.NoteId, n.Note, u.DisplayName AS CreatedByName, n.CreatedAtUtc
    FROM dbo.IncidentNotes n JOIN dbo.Users u ON u.UserId = n.CreatedByUserId
    WHERE n.IncidentId = @IncidentId ORDER BY n.CreatedAtUtc DESC, n.NoteId DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Incident_Get
    @ActorUserId INT,
    @IncidentId  INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleIncidents(@ActorUserId) WHERE IncidentId = @IncidentId)
        THROW 50404, N'Incident not found.', 1;
    EXEC dbo.usp_Internal_SelectIncident @IncidentId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Incident_Create
    @ActorUserId      INT,
    @Title            NVARCHAR(200),
    @Description      NVARCHAR(4000),
    @IncidentType     NVARCHAR(30),
    @Severity         NVARCHAR(10),
    @ViolationId      BIGINT = NULL,
    @LocationId       INT = NULL,
    @AssignedToUserId INT = NULL,
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Title = NULLIF(LTRIM(RTRIM(@Title)), N'');
        SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');
        IF @Title IS NULL OR @Description IS NULL THROW 50400, N'Title and description are required.', 1;
        IF @IncidentType NOT IN (N'UnauthorizedAccess', N'Tailgating', N'LostCard', N'BlacklistHit', N'EquipmentFault', N'Other')
            THROW 50400, N'Invalid incident type.', 1;
        IF @Severity NOT IN (N'Low', N'Medium', N'High', N'Critical') THROW 50400, N'Invalid severity.', 1;
        IF @AssignedToUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AssignedToUserId AND IsActive = 1)
            THROW 50400, N'The assignee does not exist or is inactive.', 1;
        IF @ViolationId IS NOT NULL
        BEGIN
            DECLARE @VLoc INT = (SELECT LocationId FROM dbo.AccessViolations WHERE ViolationId = @ViolationId);
            IF @VLoc IS NULL OR dbo.fn_UserCanAccessLocation(@ActorUserId, @VLoc) = 0 THROW 50404, N'Violation not found.', 1;
            SET @LocationId = ISNULL(@LocationId, @VLoc);
        END
        IF @LocationId IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE LocationId = @LocationId) THROW 50400, N'The location does not exist.', 1;
            IF dbo.fn_UserCanAccessLocation(@ActorUserId, @LocationId) = 0 THROW 50403, N'The location is outside your facility scope.', 1;
        END

        BEGIN TRAN;
        IF @ViolationId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.AccessViolations WITH (UPDLOCK) WHERE ViolationId = @ViolationId AND IncidentId IS NOT NULL)
            THROW 50409, N'An incident is already linked to this violation.', 1;
        DECLARE @Id INT;
        EXEC dbo.usp_Internal_CreateIncident @ActorUserId, @Title, @Description, @IncidentType, @Severity, @ViolationId, @LocationId, @AssignedToUserId,
             @CorrelationId, @IpAddress, @Id OUTPUT;
        COMMIT;
        EXEC dbo.usp_Internal_SelectIncident @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Incident_Update
    @ActorUserId      INT,
    @IncidentId       INT,
    @Status           NVARCHAR(20) = NULL,
    @AssignedToUserId INT = NULL,
    @Resolution       NVARCHAR(4000) = NULL,
    @Note             NVARCHAR(4000) = NULL,
    @Version          BINARY(8),
    @CorrelationId    UNIQUEIDENTIFIER = NULL,
    @IpAddress        VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Resolution = NULLIF(LTRIM(RTRIM(@Resolution)), N'');
        SET @Note = NULLIF(LTRIM(RTRIM(@Note)), N'');
        IF @Version IS NULL THROW 50400, N'Version is required.', 1;
        IF @Status IS NOT NULL AND @Status NOT IN (N'Open', N'UnderReview', N'Confirmed', N'FalsePositive', N'Closed') THROW 50400, N'Invalid status.', 1;
        IF @Status IS NULL AND @AssignedToUserId IS NULL AND @Resolution IS NULL AND @Note IS NULL THROW 50400, N'Nothing to update.', 1;
        IF @AssignedToUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AssignedToUserId AND IsActive = 1)
            THROW 50400, N'The assignee does not exist or is inactive.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.fn_VisibleIncidents(@ActorUserId) WHERE IncidentId = @IncidentId) THROW 50404, N'Incident not found.', 1;

        BEGIN TRAN;
        DECLARE @Old NVARCHAR(20), @Ver BINARY(8), @OldAssignee INT, @OldResolution NVARCHAR(4000), @Number NVARCHAR(20);
        SELECT @Old = Status, @Ver = Version, @OldAssignee = AssignedToUserId, @OldResolution = Resolution, @Number = IncidentNumber
        FROM dbo.SecurityIncidents WITH (UPDLOCK) WHERE IncidentId = @IncidentId;
        IF @Ver <> @Version THROW 50409, N'The incident was changed by someone else. Reload and try again.', 1;
        DECLARE @NewStatus NVARCHAR(20) = ISNULL(@Status, @Old);
        IF @NewStatus <> @Old AND dbo.fn_SecurityTransitionAllowed(@Old, @NewStatus, 1) = 0
        BEGIN
            DECLARE @Msg NVARCHAR(200) = CONCAT(N'An incident cannot move from ', @Old, N' to ', @NewStatus, N'.');
            THROW 50409, @Msg, 1;
        END
        IF @NewStatus = N'Closed' AND @Old <> N'Closed' AND COALESCE(@Resolution, @OldResolution) IS NULL
            THROW 50400, N'A resolution is required to close an incident.', 1;

        DECLARE @Before NVARCHAR(MAX) = (SELECT Status, AssignedToUserId, Resolution FROM dbo.SecurityIncidents WHERE IncidentId = @IncidentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE dbo.SecurityIncidents
        SET Status = @NewStatus,
            AssignedToUserId = ISNULL(@AssignedToUserId, AssignedToUserId),
            Resolution = ISNULL(@Resolution, Resolution),
            ClosedAtUtc = CASE WHEN @NewStatus = N'Closed' AND @Old <> N'Closed' THEN SYSUTCDATETIME() WHEN @NewStatus <> N'Closed' THEN NULL ELSE ClosedAtUtc END,
            UpdatedAtUtc = SYSUTCDATETIME()
        WHERE IncidentId = @IncidentId;
        IF @Note IS NOT NULL
            INSERT dbo.IncidentNotes (IncidentId, Note, CreatedByUserId) VALUES (@IncidentId, @Note, @ActorUserId);
        DECLARE @After NVARCHAR(MAX) = (SELECT Status, AssignedToUserId, Resolution FROM dbo.SecurityIncidents WHERE IncidentId = @IncidentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        DECLARE @Summary NVARCHAR(500) = CONCAT(N'Incident ', @Number, N' updated',
            CASE WHEN @NewStatus <> @Old THEN CONCAT(N': ', @Old, N' -> ', @NewStatus) ELSE N'' END,
            CASE WHEN @Note IS NOT NULL THEN N' (note added)' ELSE N'' END, N'.');
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Incident.Updated', N'SecurityIncident', @IncidentId, @Summary, @Before, @After, @Note, @CorrelationId, @IpAddress;
        DECLARE @Route NVARCHAR(200) = CONCAT(N'/incidents/', @IncidentId);
        IF @AssignedToUserId IS NOT NULL AND @AssignedToUserId <> ISNULL(@OldAssignee, -1)
            EXEC dbo.usp_Notification_Create @AssignedToUserId, N'IncidentAssigned', N'Incident assigned to you', @Summary, N'SecurityIncident', @IncidentId, @Route, @ActorUserId;
        ELSE IF @OldAssignee IS NOT NULL
            EXEC dbo.usp_Notification_Create @OldAssignee, N'IncidentUpdated', N'Incident updated', @Summary, N'SecurityIncident', @IncidentId, @Route, @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectIncident @IncidentId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

/*------------------------------- Blacklist --------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Blacklist_Search
    @ActorUserId INT,
    @IsActive    BIT = NULL,
    @SubjectType NVARCHAR(20) = NULL,
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

    SELECT COUNT(*) AS TotalCount FROM dbo.vw_Blacklist b
    WHERE (@IsActive IS NULL OR b.IsActive = @IsActive) AND (@SubjectType IS NULL OR b.SubjectType = @SubjectType)
      AND (@Search IS NULL OR b.SubjectName LIKE N'%' + @Search + N'%' OR b.Reason LIKE N'%' + @Search + N'%');

    SELECT b.BlacklistId, b.SubjectType, b.SubjectId, b.SubjectName, b.Reason, b.ReviewDate, b.IsActive, b.CreatedByName, b.CreatedAtUtc,
           b.LiftedByName, b.LiftedAtUtc, b.LiftReason
    FROM dbo.vw_Blacklist b
    WHERE (@IsActive IS NULL OR b.IsActive = @IsActive) AND (@SubjectType IS NULL OR b.SubjectType = @SubjectType)
      AND (@Search IS NULL OR b.SubjectName LIKE N'%' + @Search + N'%' OR b.Reason LIKE N'%' + @Search + N'%')
    ORDER BY b.IsActive DESC, b.CreatedAtUtc DESC, b.BlacklistId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Internal_SelectBlacklist
    @BlacklistId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.BlacklistId, b.SubjectType, b.SubjectId, b.SubjectName, b.Reason, b.ReviewDate, b.IsActive, b.CreatedByName, b.CreatedAtUtc,
           b.LiftedByName, b.LiftedAtUtc, b.LiftReason
    FROM dbo.vw_Blacklist b WHERE b.BlacklistId = @BlacklistId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Blacklist_Create
    @ActorUserId   INT,
    @SubjectType   NVARCHAR(20),
    @SubjectId     BIGINT,
    @Reason        NVARCHAR(1000),
    @ReviewDate    DATE = NULL,
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Reason = NULLIF(LTRIM(RTRIM(@Reason)), N'');
        IF @SubjectType NOT IN (N'Employee', N'Visitor', N'Card') THROW 50400, N'subjectType must be Employee, Visitor or Card.', 1;
        IF @Reason IS NULL THROW 50400, N'A reason is required.', 1;
        IF @ReviewDate IS NOT NULL AND @ReviewDate < CAST(SYSUTCDATETIME() AS DATE) THROW 50400, N'The review date cannot be in the past.', 1;
        IF (@SubjectType = N'Employee' AND NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE EmployeeId = @SubjectId))
           OR (@SubjectType = N'Visitor' AND NOT EXISTS (SELECT 1 FROM dbo.Visitors WHERE VisitorId = @SubjectId))
           OR (@SubjectType = N'Card' AND NOT EXISTS (SELECT 1 FROM dbo.RFIDCards WHERE CardId = @SubjectId))
            THROW 50404, N'The blacklist subject was not found.', 1;

        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.Blacklist WITH (UPDLOCK, HOLDLOCK) WHERE SubjectType = @SubjectType AND SubjectId = @SubjectId AND IsActive = 1)
            THROW 50409, N'The subject is already on the active blacklist.', 1;
        INSERT dbo.Blacklist (SubjectType, SubjectId, Reason, ReviewDate, CreatedByUserId)
        VALUES (@SubjectType, @SubjectId, @Reason, @ReviewDate, @ActorUserId);
        DECLARE @Id INT = SCOPE_IDENTITY();
        DECLARE @Summary NVARCHAR(500) = (SELECT CONCAT(SubjectType, N' ', SubjectName, N' added to the blacklist.') FROM dbo.vw_Blacklist WHERE BlacklistId = @Id);
        DECLARE @After NVARCHAR(MAX) = (SELECT BlacklistId, SubjectType, SubjectId, SubjectName, ReviewDate FROM dbo.vw_Blacklist WHERE BlacklistId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Blacklist.Added', N'Blacklist', @Id, @Summary, NULL, @After, @Reason, @CorrelationId, @IpAddress;
        EXEC dbo.usp_Notification_CreateForRole N'SecurityTeam', NULL, N'BlacklistAdded', N'Blacklist entry added', @Summary, N'Blacklist', @Id, N'/blacklist', @ActorUserId;
        COMMIT;
        EXEC dbo.usp_Internal_SelectBlacklist @Id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Blacklist_Lift
    @ActorUserId   INT,
    @BlacklistId   INT,
    @Reason        NVARCHAR(1000),
    @CorrelationId UNIQUEIDENTIFIER = NULL,
    @IpAddress     VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        SET @Reason = NULLIF(LTRIM(RTRIM(@Reason)), N'');
        IF @Reason IS NULL THROW 50400, N'A reason is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Blacklist WHERE BlacklistId = @BlacklistId) THROW 50404, N'Blacklist entry not found.', 1;
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.Blacklist WITH (UPDLOCK) WHERE BlacklistId = @BlacklistId AND IsActive = 1)
            THROW 50409, N'The blacklist entry has already been lifted.', 1;
        UPDATE dbo.Blacklist SET IsActive = 0, LiftedByUserId = @ActorUserId, LiftedAtUtc = SYSUTCDATETIME(), LiftReason = @Reason
        WHERE BlacklistId = @BlacklistId;
        DECLARE @Summary NVARCHAR(500) = (SELECT CONCAT(SubjectType, N' ', SubjectName, N' lifted from the blacklist.') FROM dbo.vw_Blacklist WHERE BlacklistId = @BlacklistId);
        EXEC dbo.usp_Audit_Write @ActorUserId, N'Blacklist.Lifted', N'Blacklist', @BlacklistId, @Summary, N'{"isActive":true}', N'{"isActive":false}',
             @Reason, @CorrelationId, @IpAddress;
        COMMIT;
        EXEC dbo.usp_Internal_SelectBlacklist @BlacklistId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
