/*=====================================================================
  EIWAMS - 09_SP_Dashboard_Reports.sql
  Dashboard widgets (scoped), the seven operational reports (paged or
  export), audit search and per-entity audit timeline.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*------------------------------- Dashboard --------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_Summary
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Today DATETIME2(3) = CAST(CAST(@Now AS DATE) AS DATETIME2(3));

    CREATE TABLE #emp (EmployeeId INT PRIMARY KEY);
    INSERT #emp SELECT EmployeeId FROM dbo.fn_OperationalEmployees(@ActorUserId);
    CREATE TABLE #loc (LocationId INT PRIMARY KEY);
    INSERT #loc SELECT LocationId FROM dbo.fn_UserLocationScope(@ActorUserId);
    CREATE TABLE #req (AccessRequestId BIGINT PRIMARY KEY);
    INSERT #req SELECT AccessRequestId FROM dbo.fn_VisibleAccessRequests(@ActorUserId);

    SELECT
        (SELECT COUNT(*) FROM dbo.Employees e JOIN #emp x ON x.EmployeeId = e.EmployeeId WHERE e.EmploymentStatus = N'Active') AS ActiveEmployees,
        (SELECT COUNT(*) FROM dbo.vw_Cards c JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = c.EmployeeId WHERE c.Status = N'Active') AS ActiveCards,
        (SELECT COUNT(*) FROM dbo.vw_Cards c JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = c.EmployeeId WHERE c.Status IN (N'Blocked', N'Lost')) AS BlockedCards,
        (SELECT COUNT(*) FROM dbo.AccessRequests a JOIN #req x ON x.AccessRequestId = a.AccessRequestId WHERE a.Status IN (N'Submitted', N'PendingApproval')) AS PendingAccessRequests,
        (SELECT COUNT(*) FROM dbo.AccessRequests ar
           JOIN dbo.AccessRequestApprovals a ON a.AccessRequestId = ar.AccessRequestId AND a.Cycle = ar.Cycle AND a.Stage = ar.CurrentStage AND a.Decision = N'Pending'
           JOIN dbo.AccessRequestApprovalAssignees s ON s.ApprovalId = a.ApprovalId AND s.UserId = @ActorUserId
         WHERE ar.Status = N'PendingApproval') AS MyPendingApprovals,
        (SELECT COUNT(*) FROM dbo.AccessPermissions p WHERE p.Status = N'Active' AND p.ValidToUtc > @Now
           AND (p.EmployeeId IN (SELECT EmployeeId FROM #emp) OR p.LocationId IN (SELECT LocationId FROM #loc))) AS ActivePermissions,
        (SELECT COUNT(*) FROM dbo.AccessPermissions p WHERE p.Status = N'Active' AND p.ValidToUtc > @Now AND p.ValidToUtc <= DATEADD(DAY, 7, @Now)
           AND (p.EmployeeId IN (SELECT EmployeeId FROM #emp) OR p.LocationId IN (SELECT LocationId FROM #loc))) AS PermissionsExpiring7d,
        (SELECT COUNT(*) FROM dbo.AccessLogs l JOIN #loc x ON x.LocationId = l.LocationId WHERE l.EventAtUtc >= @Today) AS EventsToday,
        (SELECT COUNT(*) FROM dbo.AccessLogs l JOIN #loc x ON x.LocationId = l.LocationId WHERE l.EventAtUtc >= @Today AND l.Decision = N'Denied') AS DeniedToday,
        (SELECT COUNT(*) FROM dbo.AccessViolations v JOIN #loc x ON x.LocationId = v.LocationId WHERE v.Status IN (N'Open', N'UnderReview')) AS OpenViolations,
        (SELECT COUNT(*) FROM dbo.SecurityIncidents i JOIN dbo.fn_VisibleIncidents(@ActorUserId) x ON x.IncidentId = i.IncidentId WHERE i.Status <> N'Closed') AS OpenIncidents,
        (SELECT COUNT(*) FROM dbo.VisitorPasses vp JOIN #loc x ON x.LocationId = vp.LocationId WHERE vp.Status = N'Active') AS VisitorsOnSite,
        (SELECT CAST(AVG(CAST(DATEDIFF(MINUTE, a.SubmittedAtUtc, a.DecidedAtUtc) AS DECIMAL(18, 2)) / 60.0) AS DECIMAL(10, 1))
         FROM dbo.AccessRequests a JOIN #req x ON x.AccessRequestId = a.AccessRequestId
         WHERE a.Status IN (N'Approved', N'Provisioned', N'Rejected') AND a.SubmittedAtUtc IS NOT NULL AND a.DecidedAtUtc IS NOT NULL
           AND a.DecidedAtUtc >= DATEADD(DAY, -90, @Now)) AS AvgApprovalTurnaroundHours;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_EventsTrend
    @ActorUserId INT,
    @Days        INT = 14
AS
BEGIN
    SET NOCOUNT ON;
    IF @Days IS NULL OR @Days < 1 SET @Days = 14;
    IF @Days > 90 SET @Days = 90;
    DECLARE @Start DATE = DATEADD(DAY, 1 - @Days, CAST(SYSUTCDATETIME() AS DATE));

    WITH d AS (
        SELECT TOP (@Days) DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @Start) AS [Date]
        FROM sys.all_objects
    ), l AS (
        SELECT CAST(al.EventAtUtc AS DATE) AS [Date], al.EventType, al.Decision
        FROM dbo.AccessLogs al JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = al.LocationId
        WHERE al.EventAtUtc >= CAST(@Start AS DATETIME2(3))
    )
    SELECT d.[Date],
           COUNT(CASE WHEN l.Decision = N'Granted' AND l.EventType = N'Entry' THEN 1 END) AS Entries,
           COUNT(CASE WHEN l.Decision = N'Granted' AND l.EventType = N'Exit' THEN 1 END) AS Exits,
           COUNT(CASE WHEN l.Decision = N'Denied' THEN 1 END) AS Denied
    FROM d LEFT JOIN l ON l.[Date] = d.[Date]
    GROUP BY d.[Date]
    ORDER BY d.[Date];
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_RequestsByStatus
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT a.Status AS Label, COUNT(*) AS [Count]
    FROM dbo.AccessRequests a JOIN dbo.fn_VisibleAccessRequests(@ActorUserId) x ON x.AccessRequestId = a.AccessRequestId
    GROUP BY a.Status
    ORDER BY COUNT(*) DESC, a.Status;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_ViolationsByType
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT v.ViolationType AS Label, COUNT(*) AS [Count]
    FROM dbo.AccessViolations v JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = v.LocationId
    WHERE v.DetectedAtUtc >= DATEADD(DAY, -30, SYSUTCDATETIME())
    GROUP BY v.ViolationType
    ORDER BY COUNT(*) DESC, v.ViolationType;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_CardsByStatus
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.Status AS Label, COUNT(*) AS [Count]
    FROM dbo.vw_Cards c JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = c.EmployeeId
    GROUP BY c.Status
    ORDER BY COUNT(*) DESC, c.Status;
END
GO

-- Estimated occupancy: granted entries minus granted exits today per location (reader coverage dependent).
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_Occupancy
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today DATETIME2(3) = CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2(3));
    SELECT l.LocationId, l.LocationName,
           CASE WHEN SUM(CASE WHEN al.EventType = N'Entry' THEN 1 ELSE -1 END) < 0 THEN 0
                ELSE SUM(CASE WHEN al.EventType = N'Entry' THEN 1 ELSE -1 END) END AS OnSite
    FROM dbo.AccessLogs al
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = al.LocationId
    JOIN dbo.Locations l ON l.LocationId = al.LocationId
    WHERE al.EventAtUtc >= @Today AND al.Decision = N'Granted'
    GROUP BY l.LocationId, l.LocationName
    ORDER BY OnSite DESC, l.LocationName;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_MyWork
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @w TABLE (ItemType NVARCHAR(30), ReferenceId BIGINT, ReferenceNumber NVARCHAR(40), Title NVARCHAR(300), Status NVARCHAR(30),
                      CreatedAtUtc DATETIME2(3), Route NVARCHAR(200));

    INSERT @w
    SELECT N'Approval', v.AccessRequestId, v.RequestNumber, CONCAT(a.Stage, N' approval: ', v.EmployeeName, N' - ', v.LocationName), v.Status,
           ISNULL(a.AssignedAtUtc, v.SubmittedAtUtc), CONCAT(N'/access-requests/', v.AccessRequestId)
    FROM dbo.vw_AccessRequests v
    JOIN dbo.AccessRequestApprovals a ON a.AccessRequestId = v.AccessRequestId AND a.Cycle = v.Cycle AND a.Stage = v.CurrentStage AND a.Decision = N'Pending'
    JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId AND x.UserId = @ActorUserId
    WHERE v.Status = N'PendingApproval';

    INSERT @w
    SELECT N'AccessRequest', v.AccessRequestId, v.RequestNumber, CONCAT(N'Your request for ', v.LocationName, N' is ', LOWER(v.Status)), v.Status,
           ISNULL(v.UpdatedAtUtc, v.CreatedAtUtc), CONCAT(N'/access-requests/', v.AccessRequestId)
    FROM dbo.vw_AccessRequests v
    WHERE (v.RequesterUserId = @ActorUserId OR v.EmployeeUserId = @ActorUserId) AND v.Status IN (N'Draft', N'Returned');

    IF dbo.fn_HasPermission(@ActorUserId, N'Permissions.Provision') = 1
        INSERT @w
        SELECT N'Provisioning', v.AccessRequestId, v.RequestNumber, CONCAT(N'Provision access: ', v.EmployeeName, N' - ', v.LocationName), v.Status,
               ISNULL(v.DecidedAtUtc, v.UpdatedAtUtc), CONCAT(N'/access-requests/', v.AccessRequestId)
        FROM dbo.vw_AccessRequests v
        WHERE v.Status = N'Approved' AND dbo.fn_UserCanAccessLocation(@ActorUserId, v.LocationId) = 1
          AND v.RequesterUserId <> @ActorUserId AND ISNULL(v.EmployeeUserId, -1) <> @ActorUserId;

    IF dbo.fn_HasPermission(@ActorUserId, N'Cards.Verify') = 1
        INSERT @w
        SELECT N'CardRequest', r.CardRequestId, r.RequestNumber, CONCAT(r.RequestType, N' card request: ', r.EmployeeName), r.Status,
               r.RequestedAtUtc, N'/cards'
        FROM dbo.vw_CardRequests r JOIN dbo.fn_CardEmployees(@ActorUserId) ce ON ce.EmployeeId = r.EmployeeId
        WHERE r.Status IN (N'Submitted', N'VerificationPending') AND r.RequestedByUserId <> @ActorUserId;

    INSERT @w
    SELECT N'Incident', i.IncidentId, i.IncidentNumber, i.Title, i.Status, i.OpenedAtUtc, CONCAT(N'/incidents/', i.IncidentId)
    FROM dbo.vw_Incidents i
    WHERE i.AssignedToUserId = @ActorUserId AND i.Status <> N'Closed';

    IF dbo.fn_HasPermission(@ActorUserId, N'Visitors.Approve') = 1
        INSERT @w
        SELECT N'VisitorPass', p.VisitorPassId, p.PassNumber, CONCAT(N'Approve visitor pass: ', p.VisitorName, N' - ', p.LocationName), p.Status,
               p.CreatedAtUtc, N'/visitors'
        FROM dbo.vw_VisitorPasses p
        WHERE p.Status = N'PendingApproval' AND p.CreatedByUserId <> @ActorUserId AND dbo.fn_UserCanAccessLocation(@ActorUserId, p.LocationId) = 1;

    SELECT TOP (50) ItemType, ReferenceId, ReferenceNumber, Title, Status, CreatedAtUtc, Route
    FROM @w ORDER BY CreatedAtUtc ASC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_Activity
    @ActorUserId INT,
    @Top         INT = 15
AS
BEGIN
    SET NOCOUNT ON;
    IF @Top IS NULL OR @Top < 1 SET @Top = 15;
    IF @Top > 50 SET @Top = 50;
    DECLARE @All BIT = dbo.fn_HasPermission(@ActorUserId, N'Audit.View');
    SELECT TOP (@Top) a.AuditLogId, a.Action, a.EntityType, a.EntityId, a.ActorName, a.Summary, a.OccurredAtUtc
    FROM dbo.vw_AuditLogs a
    WHERE @All = 1 OR a.ActorUserId = @ActorUserId
    ORDER BY a.OccurredAtUtc DESC, a.AuditLogId DESC;
END
GO

/*-------------------------------- Reports ---------------------------*/
-- Every report: RS1 TotalCount, RS2 rows. @Export = 1 returns up to 10000 rows on one page.
CREATE OR ALTER PROCEDURE dbo.usp_Report_EmployeeRegister
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    SELECT e.* INTO #r
    FROM dbo.vw_Employees e JOIN dbo.fn_OperationalEmployees(@ActorUserId) x ON x.EmployeeId = e.EmployeeId
    WHERE (@From IS NULL OR e.JoinDate >= CAST(@From AS DATE))
      AND (@To IS NULL OR e.JoinDate <= CAST(@To AS DATE))
      AND (@LocationId IS NULL OR e.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR e.EmploymentStatus = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT EmployeeNumber, FullName, EmployeeType, DepartmentName, ManagerName, LocationName, EmploymentStatus, JoinDate, EndDate, ActiveCardCount, ActivePermissionCount
    FROM #r ORDER BY EmployeeNumber
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_CardLifecycle
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    SELECT c.CardId, c.MaskedCardUid, c.EmployeeNumber, c.EmployeeName, d.DepartmentName, c.CardType, c.Status, c.IssuedAtUtc, c.ActivatedAtUtc,
           c.ExpiresAtUtc, c.BlockedAtUtc, c.BlockReason, c.ReplacedByCardId, c.ControllerSyncStatus
    INTO #r
    FROM dbo.vw_Cards c
    JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = c.EmployeeId
    JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId
    JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    WHERE (@From IS NULL OR c.IssuedAtUtc >= @From)
      AND (@To IS NULL OR c.IssuedAtUtc <= @To)
      AND (@LocationId IS NULL OR e.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR c.Status = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT CardId, MaskedCardUid, EmployeeNumber, EmployeeName, DepartmentName, CardType, Status, IssuedAtUtc, ActivatedAtUtc, ExpiresAtUtc,
           BlockedAtUtc, BlockReason, ReplacedByCardId, ControllerSyncStatus
    FROM #r ORDER BY IssuedAtUtc DESC, CardId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_AccessPermissions
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    SELECT p.PermissionId, p.EmployeeNumber, p.EmployeeName, d.DepartmentName, p.LocationName, p.Status, p.ValidFromUtc, p.ValidToUtc,
           p.RequestNumber, p.ProvisionedByName, p.ProvisionedAtUtc, p.RevokedAtUtc, p.RevokeReason, p.ControllerSyncStatus
    INTO #r
    FROM dbo.vw_AccessPermissions p
    JOIN dbo.Employees e ON e.EmployeeId = p.EmployeeId
    JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    WHERE (p.EmployeeId IN (SELECT EmployeeId FROM dbo.fn_OperationalEmployees(@ActorUserId))
           OR p.LocationId IN (SELECT LocationId FROM dbo.fn_UserLocationScope(@ActorUserId)))
      AND (@From IS NULL OR p.ValidToUtc >= @From)
      AND (@To IS NULL OR p.ValidFromUtc <= @To)
      AND (@LocationId IS NULL OR p.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR p.Status = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT PermissionId, EmployeeNumber, EmployeeName, DepartmentName, LocationName, Status, ValidFromUtc, ValidToUtc, RequestNumber,
           ProvisionedByName, ProvisionedAtUtc, RevokedAtUtc, RevokeReason, ControllerSyncStatus
    FROM #r ORDER BY ValidToUtc, PermissionId
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_AccessActivity
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    SELECT l.AccessLogId, l.EventAtUtc, l.ReaderId, l.ReaderName, l.LocationName, l.EventType, l.Decision, l.DenialReason,
           e.EmployeeNumber, l.EmployeeName, l.MaskedCardUid, l.ProcessingStatus
    INTO #r
    FROM dbo.vw_AccessLogs l
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = l.LocationId
    LEFT JOIN dbo.Employees e ON e.EmployeeId = l.EmployeeId
    WHERE (@From IS NULL OR l.EventAtUtc >= @From)
      AND (@To IS NULL OR l.EventAtUtc <= @To)
      AND (@LocationId IS NULL OR l.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR l.Decision = @Status OR l.ProcessingStatus = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT AccessLogId, EventAtUtc, ReaderId, ReaderName, LocationName, EventType, Decision, DenialReason, EmployeeNumber, EmployeeName,
           MaskedCardUid, ProcessingStatus
    FROM #r ORDER BY EventAtUtc DESC, AccessLogId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_RequestAging
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();

    SELECT v.AccessRequestId, v.RequestNumber, v.EmployeeNumber, v.EmployeeName, d.DepartmentName, v.LocationName, v.RequesterName, v.Status,
           v.CurrentStage, v.CurrentApproverNames, v.CreatedAtUtc, v.SubmittedAtUtc, v.DecidedAtUtc,
           CAST(CASE WHEN v.SubmittedAtUtc IS NULL THEN NULL
                     ELSE DATEDIFF(MINUTE, v.SubmittedAtUtc, ISNULL(v.DecidedAtUtc, CASE WHEN v.Status IN (N'PendingApproval', N'Submitted') THEN @Now END)) / 60.0 END
                AS DECIMAL(10, 1)) AS AgeHours,
           (SELECT STRING_AGG(CONCAT(a.Stage, N': ', a.Decision, ISNULL(N' by ' + u.DisplayName, N'')), N'; ') WITHIN GROUP (ORDER BY a.Cycle, a.StageOrder)
            FROM dbo.AccessRequestApprovals a LEFT JOIN dbo.Users u ON u.UserId = a.DecidedByUserId
            WHERE a.AccessRequestId = v.AccessRequestId AND a.Decision <> N'Skipped') AS ApprovalHistory
    INTO #r
    FROM dbo.vw_AccessRequests v
    JOIN dbo.fn_VisibleAccessRequests(@ActorUserId) x ON x.AccessRequestId = v.AccessRequestId
    JOIN dbo.Employees e ON e.EmployeeId = v.EmployeeId
    JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    WHERE (@From IS NULL OR v.CreatedAtUtc >= @From)
      AND (@To IS NULL OR v.CreatedAtUtc <= @To)
      AND (@LocationId IS NULL OR v.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR v.Status = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT RequestNumber, EmployeeNumber, EmployeeName, DepartmentName, LocationName, RequesterName, Status, CurrentStage, CurrentApproverNames,
           CreatedAtUtc, SubmittedAtUtc, DecidedAtUtc, AgeHours, ApprovalHistory
    FROM #r ORDER BY AgeHours DESC, AccessRequestId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_ViolationsIncidents
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    SELECT v.ViolationId, v.DetectedAtUtc, v.ViolationType, v.Severity, v.Status AS ViolationStatus, v.LocationName, v.EmployeeName,
           v.ReviewedByName, v.ReviewNotes, i.IncidentNumber, i.Status AS IncidentStatus, i.AssignedToName, i.Resolution, i.ClosedAtUtc
    INTO #r
    FROM dbo.vw_Violations v
    JOIN dbo.fn_UserLocationScope(@ActorUserId) s ON s.LocationId = v.LocationId
    LEFT JOIN dbo.vw_Incidents i ON i.IncidentId = v.IncidentId
    LEFT JOIN dbo.Employees e ON e.EmployeeId = v.EmployeeId
    WHERE (@From IS NULL OR v.DetectedAtUtc >= @From)
      AND (@To IS NULL OR v.DetectedAtUtc <= @To)
      AND (@LocationId IS NULL OR v.LocationId IN (SELECT LocationId FROM dbo.fn_LocationDescendants(@LocationId)))
      AND (@DepartmentId IS NULL OR e.DepartmentId = @DepartmentId)
      AND (@Status IS NULL OR v.Status = @Status OR i.Status = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT ViolationId, DetectedAtUtc, ViolationType, Severity, ViolationStatus, LocationName, EmployeeName, ReviewedByName, ReviewNotes,
           IncidentNumber, IncidentStatus, AssignedToName, Resolution, ClosedAtUtc
    FROM #r ORDER BY DetectedAtUtc DESC, ViolationId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Report_AuditCompliance
    @ActorUserId  INT,
    @From         DATETIME2(3) = NULL,
    @To           DATETIME2(3) = NULL,
    @LocationId   INT = NULL,
    @DepartmentId INT = NULL,
    @Status       NVARCHAR(30) = NULL,
    @Page         INT = 1,
    @PageSize     INT = 20,
    @Export       BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF dbo.fn_HasPermission(@ActorUserId, N'Audit.View') = 0 THROW 50403, N'The audit compliance report requires Audit.View.', 1;
    IF @Page < 1 OR @Export = 1 SET @Page = 1;
    IF @Export = 1 SET @PageSize = 10000;
    ELSE IF @PageSize < 1 SET @PageSize = 20;
    ELSE IF @PageSize > 100 SET @PageSize = 100;

    -- @Status filters on the action's entity type (e.g. Employee, Card, AccessPermission).
    SELECT a.AuditLogId, a.OccurredAtUtc, a.ActorName, a.Action, a.EntityType, a.EntityId, a.Summary, a.Reason, a.CorrelationId, a.IpAddress
    INTO #r
    FROM dbo.vw_AuditLogs a
    WHERE (@From IS NULL OR a.OccurredAtUtc >= @From)
      AND (@To IS NULL OR a.OccurredAtUtc <= @To)
      AND (@Status IS NULL OR a.EntityType = @Status);

    SELECT COUNT(*) AS TotalCount FROM #r;
    SELECT AuditLogId, OccurredAtUtc, ActorName, Action, EntityType, EntityId, Summary, Reason, CorrelationId, IpAddress
    FROM #r ORDER BY OccurredAtUtc DESC, AuditLogId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/*--------------------------------- Audit ----------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_Audit_Search
    @ActorUserId       INT,
    @From              DATETIME2(3) = NULL,
    @To                DATETIME2(3) = NULL,
    @FilterActorUserId INT = NULL,
    @Action            NVARCHAR(100) = NULL,
    @EntityType        NVARCHAR(60) = NULL,
    @EntityId          NVARCHAR(60) = NULL,
    @Search            NVARCHAR(200) = NULL,
    @Page              INT = 1,
    @PageSize          INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');
    SET @Action = NULLIF(LTRIM(RTRIM(@Action)), N'');
    IF @Page < 1 SET @Page = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;
    IF @From IS NOT NULL AND @To IS NOT NULL AND @From > @To THROW 50400, N'from must be on or before to.', 1;

    CREATE TABLE #f (AuditLogId BIGINT PRIMARY KEY);
    INSERT #f
    SELECT a.AuditLogId FROM dbo.AuditLogs a
    WHERE (@From IS NULL OR a.OccurredAtUtc >= @From)
      AND (@To IS NULL OR a.OccurredAtUtc <= @To)
      AND (@FilterActorUserId IS NULL OR a.ActorUserId = @FilterActorUserId)
      AND (@Action IS NULL OR a.Action LIKE @Action + N'%')
      AND (@EntityType IS NULL OR a.EntityType = @EntityType)
      AND (@EntityId IS NULL OR a.EntityId = @EntityId)
      AND (@Search IS NULL OR a.Summary LIKE N'%' + @Search + N'%' OR a.Reason LIKE N'%' + @Search + N'%');

    SELECT COUNT(*) AS TotalCount FROM #f;
    SELECT a.AuditLogId, a.ActorUserId, a.ActorName, a.Action, a.EntityType, a.EntityId, a.Summary, a.BeforeJson, a.AfterJson, a.Reason,
           a.OccurredAtUtc, a.CorrelationId, a.IpAddress
    FROM dbo.vw_AuditLogs a JOIN #f f ON f.AuditLogId = a.AuditLogId
    ORDER BY a.OccurredAtUtc DESC, a.AuditLogId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Audit_Timeline
    @ActorUserId INT,
    @EntityType  NVARCHAR(60),
    @EntityId    NVARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;
    SET @EntityType = NULLIF(LTRIM(RTRIM(@EntityType)), N'');
    SET @EntityId = NULLIF(LTRIM(RTRIM(@EntityId)), N'');
    IF @EntityType IS NULL OR @EntityId IS NULL THROW 50400, N'entityType and entityId are required.', 1;

    DECLARE @Allowed BIT = dbo.fn_HasPermission(@ActorUserId, N'Audit.View');
    DECLARE @Id BIGINT = TRY_CAST(@EntityId AS BIGINT);
    IF @Allowed = 0 AND @Id IS NOT NULL
    BEGIN
        IF @EntityType = N'Employee'
            SET @Allowed = CASE WHEN EXISTS (SELECT 1 FROM dbo.fn_VisibleEmployees(@ActorUserId) WHERE EmployeeId = @Id) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'AccessRequest'
            SET @Allowed = CASE WHEN EXISTS (SELECT 1 FROM dbo.fn_VisibleAccessRequests(@ActorUserId) WHERE AccessRequestId = @Id) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'Card'
            SET @Allowed = CASE WHEN EXISTS (SELECT 1 FROM dbo.RFIDCards c JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = c.EmployeeId WHERE c.CardId = @Id) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'CardRequest'
            SET @Allowed = CASE WHEN EXISTS (SELECT 1 FROM dbo.CardRequests r JOIN dbo.fn_CardEmployees(@ActorUserId) x ON x.EmployeeId = r.EmployeeId WHERE r.CardRequestId = @Id) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'AccessPermission'
            SET @Allowed = CASE WHEN EXISTS (SELECT 1 FROM dbo.AccessPermissions p WHERE p.PermissionId = @Id
                                              AND (p.EmployeeId IN (SELECT EmployeeId FROM dbo.fn_OperationalEmployees(@ActorUserId))
                                                   OR (dbo.fn_HasPermission(@ActorUserId, N'Permissions.View') = 1 AND dbo.fn_UserCanAccessLocation(@ActorUserId, p.LocationId) = 1))) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'SecurityIncident'
            SET @Allowed = CASE WHEN dbo.fn_HasPermission(@ActorUserId, N'Incidents.View') = 1
                                 AND EXISTS (SELECT 1 FROM dbo.fn_VisibleIncidents(@ActorUserId) WHERE IncidentId = @Id) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'AccessViolation'
            SET @Allowed = CASE WHEN dbo.fn_HasPermission(@ActorUserId, N'Violations.View') = 1
                                 AND EXISTS (SELECT 1 FROM dbo.AccessViolations v WHERE v.ViolationId = @Id AND dbo.fn_UserCanAccessLocation(@ActorUserId, v.LocationId) = 1) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'VisitorPass'
            SET @Allowed = CASE WHEN dbo.fn_HasPermission(@ActorUserId, N'Visitors.View') = 1
                                 AND EXISTS (SELECT 1 FROM dbo.VisitorPasses p WHERE p.VisitorPassId = @Id AND dbo.fn_UserCanAccessLocation(@ActorUserId, p.LocationId) = 1) THEN 1 ELSE 0 END;
        ELSE IF @EntityType = N'Visitor'
            SET @Allowed = dbo.fn_HasPermission(@ActorUserId, N'Visitors.View');
        ELSE IF @EntityType = N'Blacklist'
            SET @Allowed = dbo.fn_HasPermission(@ActorUserId, N'Blacklist.View');
    END
    IF @Allowed = 0 THROW 50404, N'Entity not found.', 1;

    SELECT TOP (500) a.AuditLogId, a.ActorUserId, a.ActorName, a.Action, a.EntityType, a.EntityId, a.Summary, a.BeforeJson, a.AfterJson, a.Reason,
           a.OccurredAtUtc, a.CorrelationId, a.IpAddress
    FROM dbo.vw_AuditLogs a
    WHERE a.EntityType = @EntityType AND a.EntityId = @EntityId
    ORDER BY a.OccurredAtUtc DESC, a.AuditLogId DESC;
END
GO
