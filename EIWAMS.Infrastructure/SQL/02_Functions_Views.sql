/*=====================================================================
  EIWAMS - 02_Functions_Views.sql
  Permission, facility-scope and visibility functions plus read views.
  View column names are the API DTO property names (camelCase on the wire).
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*----------------------------- Permissions --------------------------*/
CREATE OR ALTER FUNCTION dbo.fn_UserPermissions (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT DISTINCT p.PermissionCode
    FROM dbo.Users u
    JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
    JOIN dbo.RolePermissions rp ON rp.RoleId = ur.RoleId
    JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId
    WHERE u.UserId = @UserId AND u.IsActive = 1;
GO

CREATE OR ALTER FUNCTION dbo.fn_HasPermission (@UserId INT, @PermissionCode NVARCHAR(100))
RETURNS BIT
AS
BEGIN
    RETURN CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.Users u
        JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
        JOIN dbo.RolePermissions rp ON rp.RoleId = ur.RoleId
        JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId
        WHERE u.UserId = @UserId AND u.IsActive = 1 AND p.PermissionCode = @PermissionCode) THEN 1 ELSE 0 END;
END
GO

CREATE OR ALTER FUNCTION dbo.fn_UserHasRole (@UserId INT, @RoleName NVARCHAR(50))
RETURNS BIT
AS
BEGIN
    RETURN CASE WHEN EXISTS (
        SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId
        WHERE ur.UserId = @UserId AND r.RoleName = @RoleName) THEN 1 ELSE 0 END;
END
GO

/*------------------------- Location hierarchy -----------------------*/
CREATE OR ALTER FUNCTION dbo.fn_LocationDescendants (@LocationId INT)
RETURNS TABLE
AS
RETURN
    WITH d AS (
        SELECT l.LocationId, 0 AS Depth FROM dbo.Locations l WHERE l.LocationId = @LocationId
        UNION ALL
        SELECT c.LocationId, d.Depth + 1 FROM dbo.Locations c JOIN d ON c.ParentLocationId = d.LocationId WHERE d.Depth < 20
    )
    SELECT LocationId, Depth FROM d;
GO

CREATE OR ALTER FUNCTION dbo.fn_LocationAncestors (@LocationId INT)
RETURNS TABLE
AS
RETURN
    WITH a AS (
        SELECT l.LocationId, l.ParentLocationId, 0 AS Depth FROM dbo.Locations l WHERE l.LocationId = @LocationId
        UNION ALL
        SELECT p.LocationId, p.ParentLocationId, a.Depth + 1 FROM dbo.Locations p JOIN a ON p.LocationId = a.ParentLocationId WHERE a.Depth < 20
    )
    SELECT LocationId, Depth FROM a;
GO

-- Locations the user may operate on: everything for AllFacilities, otherwise each scoped location and its subtree.
CREATE OR ALTER FUNCTION dbo.fn_UserLocationScope (@UserId INT)
RETURNS TABLE
AS
RETURN
    WITH s AS (
        SELECT l.LocationId, 0 AS Depth
        FROM dbo.UserFacilityScopes ufs
        JOIN dbo.Locations l ON l.LocationId = ufs.LocationId
        WHERE ufs.UserId = @UserId
        UNION ALL
        SELECT c.LocationId, s.Depth + 1 FROM dbo.Locations c JOIN s ON c.ParentLocationId = s.LocationId WHERE s.Depth < 20
    )
    SELECT l.LocationId FROM dbo.Locations l
    WHERE EXISTS (SELECT 1 FROM dbo.Users u WHERE u.UserId = @UserId AND u.AllFacilities = 1 AND u.IsActive = 1)
    UNION
    SELECT s.LocationId FROM s
    WHERE EXISTS (SELECT 1 FROM dbo.Users u WHERE u.UserId = @UserId AND u.IsActive = 1);
GO

CREATE OR ALTER FUNCTION dbo.fn_UserCanAccessLocation (@UserId INT, @LocationId INT)
RETURNS BIT
AS
BEGIN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM dbo.fn_UserLocationScope(@UserId) s WHERE s.LocationId = @LocationId) THEN 1 ELSE 0 END;
END
GO

CREATE OR ALTER FUNCTION dbo.fn_MaskCardUid (@CardUid NVARCHAR(64))
RETURNS NVARCHAR(16)
AS
BEGIN
    RETURN N'****' + RIGHT(ISNULL(@CardUid, N''), 4);
END
GO

/*----------------------------- Visibility ---------------------------*/
-- Employee records the user may read through the employee module: self, direct reports, or ViewAll within scope.
CREATE OR ALTER FUNCTION dbo.fn_VisibleEmployees (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT e.EmployeeId FROM dbo.Employees e WHERE e.UserId = @UserId
    UNION
    SELECT e.EmployeeId FROM dbo.Employees e JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId WHERE m.UserId = @UserId
    UNION
    SELECT e.EmployeeId FROM dbo.Employees e
    JOIN dbo.fn_UserLocationScope(@UserId) s ON s.LocationId = e.LocationId
    WHERE dbo.fn_HasPermission(@UserId, N'Employees.ViewAll') = 1;
GO

-- Employees the user may act on operationally (cards, permissions, RFID, security): visible plus in-scope for operational roles.
CREATE OR ALTER FUNCTION dbo.fn_OperationalEmployees (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT v.EmployeeId FROM dbo.fn_VisibleEmployees(@UserId) v
    UNION
    SELECT e.EmployeeId FROM dbo.Employees e
    JOIN dbo.fn_UserLocationScope(@UserId) s ON s.LocationId = e.LocationId
    WHERE EXISTS (SELECT 1 FROM dbo.fn_UserPermissions(@UserId) p
                  WHERE p.PermissionCode IN (N'Cards.ViewAll', N'AccessRequests.ViewAll', N'Permissions.Provision', N'Permissions.Revoke',
                                             N'Rfid.View', N'Violations.View', N'Blacklist.Manage', N'Approvals.Decide', N'Cards.Issue'));
GO

CREATE OR ALTER FUNCTION dbo.fn_VisibleAccessRequests (@UserId INT)
RETURNS TABLE
AS
RETURN
    SELECT ar.AccessRequestId
    FROM dbo.AccessRequests ar
    JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId
    LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId
    WHERE ar.RequesterUserId = @UserId
       OR e.UserId = @UserId
       OR m.UserId = @UserId
       OR EXISTS (SELECT 1 FROM dbo.AccessRequestApprovals a
                  JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId
                  WHERE a.AccessRequestId = ar.AccessRequestId AND x.UserId = @UserId)
       OR EXISTS (SELECT 1 FROM dbo.AccessRequestApprovals a WHERE a.AccessRequestId = ar.AccessRequestId AND a.DecidedByUserId = @UserId)
       OR ((dbo.fn_HasPermission(@UserId, N'AccessRequests.ViewAll') = 1
            OR (ar.Status IN (N'Approved', N'Provisioned') AND dbo.fn_HasPermission(@UserId, N'Permissions.Provision') = 1))
           AND EXISTS (SELECT 1 FROM dbo.fn_UserLocationScope(@UserId) s WHERE s.LocationId = ar.LocationId));
GO

/*-------------------------------- Views -----------------------------*/
CREATE OR ALTER VIEW dbo.vw_Departments
AS
SELECT d.DepartmentId, d.DepartmentCode, d.DepartmentName, d.HeadUserId, hu.DisplayName AS HeadUserName, d.IsActive,
       (SELECT COUNT(*) FROM dbo.Employees e WHERE e.DepartmentId = d.DepartmentId AND e.EmploymentStatus = N'Active') AS EmployeeCount,
       d.Version
FROM dbo.Departments d
LEFT JOIN dbo.Users hu ON hu.UserId = d.HeadUserId;
GO

CREATE OR ALTER VIEW dbo.vw_Locations
AS
WITH p AS (
    SELECT l.LocationId, CAST(l.LocationName AS NVARCHAR(1000)) AS Path, 0 AS Depth
    FROM dbo.Locations l WHERE l.ParentLocationId IS NULL
    UNION ALL
    SELECT c.LocationId, CAST(p.Path + N' / ' + c.LocationName AS NVARCHAR(1000)), p.Depth + 1
    FROM dbo.Locations c JOIN p ON c.ParentLocationId = p.LocationId
    WHERE p.Depth < 20
)
SELECT l.LocationId, l.ParentLocationId, pl.LocationName AS ParentLocationName, l.LocationCode, l.LocationName, l.LocationType,
       l.IsRestricted, l.IsActive, l.TimeZone, ISNULL(p.Path, l.LocationName) AS Path,
       (SELECT COUNT(*) FROM dbo.Readers r WHERE r.LocationId = l.LocationId) AS ReaderCount,
       ISNULL(p.Depth, 0) AS Depth, l.Version
FROM dbo.Locations l
LEFT JOIN dbo.Locations pl ON pl.LocationId = l.ParentLocationId
LEFT JOIN p ON p.LocationId = l.LocationId;
GO

CREATE OR ALTER VIEW dbo.vw_Readers
AS
SELECT r.ReaderId, r.ReaderName, r.LocationId, l.LocationName, r.Direction, r.IsActive, r.LastSeenAtUtc
FROM dbo.Readers r
JOIN dbo.Locations l ON l.LocationId = r.LocationId;
GO

CREATE OR ALTER VIEW dbo.vw_Employees
AS
SELECT e.EmployeeId, e.EmployeeNumber, e.FirstName, e.LastName, CONCAT(e.FirstName, N' ', e.LastName) AS FullName, e.WorkEmail,
       e.EmployeeType, e.DepartmentId, d.DepartmentName, e.ManagerEmployeeId,
       CASE WHEN m.EmployeeId IS NULL THEN NULL ELSE CONCAT(m.FirstName, N' ', m.LastName) END AS ManagerName,
       e.LocationId, l.LocationName, e.EmploymentStatus, e.JoinDate, e.EndDate,
       (SELECT COUNT(*) FROM dbo.RFIDCards c WHERE c.EmployeeId = e.EmployeeId AND c.Status = N'Active'
            AND (c.ExpiresAtUtc IS NULL OR c.ExpiresAtUtc > SYSUTCDATETIME())) AS ActiveCardCount,
       e.UserId,
       (SELECT COUNT(*) FROM dbo.AccessPermissions ap WHERE ap.EmployeeId = e.EmployeeId AND ap.Status = N'Active'
            AND ap.ValidToUtc > SYSUTCDATETIME()) AS ActivePermissionCount,
       (SELECT COUNT(*) FROM dbo.AccessRequests ar WHERE ar.EmployeeId = e.EmployeeId
            AND ar.Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved')) AS OpenAccessRequestCount,
       e.CreatedAtUtc, e.UpdatedAtUtc, e.Version
FROM dbo.Employees e
JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
JOIN dbo.Locations l ON l.LocationId = e.LocationId
LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerEmployeeId;
GO

CREATE OR ALTER VIEW dbo.vw_Cards
AS
SELECT c.CardId, dbo.fn_MaskCardUid(c.CardUid) AS MaskedCardUid, c.EmployeeId, e.EmployeeNumber,
       CONCAT(e.FirstName, N' ', e.LastName) AS EmployeeName, c.CardType,
       CASE WHEN c.Status = N'Active' AND c.ExpiresAtUtc IS NOT NULL AND c.ExpiresAtUtc <= SYSUTCDATETIME() THEN N'Expired' ELSE c.Status END AS Status,
       c.IssuedAtUtc, c.ActivatedAtUtc, c.ExpiresAtUtc, c.BlockedAtUtc, c.BlockReason, c.ControllerSyncStatus,
       c.ReplacedByCardId, c.CardRequestId, c.Version, e.UserId AS EmployeeUserId, e.LocationId AS EmployeeLocationId
FROM dbo.RFIDCards c
JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId;
GO

CREATE OR ALTER VIEW dbo.vw_CardRequests
AS
SELECT cr.CardRequestId, cr.RequestNumber, cr.RequestType, cr.EmployeeId, CONCAT(e.FirstName, N' ', e.LastName) AS EmployeeName,
       e.EmployeeNumber, cr.OldCardId, cr.NewCardId, cr.Reason, cr.Status, cr.RequestedAtUtc, rq.DisplayName AS RequestedByName,
       vf.DisplayName AS VerifiedByName, ap.DisplayName AS ApprovedByName, cr.DecidedAtUtc, cr.DecisionComments,
       cr.RequestedValidToUtc, cr.RequestedByUserId, cr.Version
FROM dbo.CardRequests cr
JOIN dbo.Employees e ON e.EmployeeId = cr.EmployeeId
JOIN dbo.Users rq ON rq.UserId = cr.RequestedByUserId
LEFT JOIN dbo.Users vf ON vf.UserId = cr.VerifiedByUserId
LEFT JOIN dbo.Users ap ON ap.UserId = cr.ApprovedByUserId;
GO

CREATE OR ALTER VIEW dbo.vw_AccessRequests
AS
SELECT ar.AccessRequestId, ar.RequestNumber, ar.EmployeeId, CONCAT(e.FirstName, N' ', e.LastName) AS EmployeeName, e.EmployeeNumber,
       ar.LocationId, l.LocationName, l.LocationCode, l.IsRestricted, ar.RequesterUserId, rq.DisplayName AS RequesterName,
       ar.BusinessJustification, ar.ValidFromUtc, ar.ValidToUtc, ar.Status, ar.CurrentStage,
       (SELECT STRING_AGG(u.DisplayName, N', ') WITHIN GROUP (ORDER BY u.DisplayName)
        FROM dbo.AccessRequestApprovals a
        JOIN dbo.AccessRequestApprovalAssignees x ON x.ApprovalId = a.ApprovalId
        JOIN dbo.Users u ON u.UserId = x.UserId
        WHERE a.AccessRequestId = ar.AccessRequestId AND a.Cycle = ar.Cycle AND a.Stage = ar.CurrentStage
          AND a.Decision = N'Pending' AND ar.Status = N'PendingApproval') AS CurrentApproverNames,
       ar.SubmittedAtUtc, ar.CreatedAtUtc, ar.UpdatedAtUtc, ar.Version, ar.Cycle, ar.DecidedAtUtc, e.UserId AS EmployeeUserId
FROM dbo.AccessRequests ar
JOIN dbo.Employees e ON e.EmployeeId = ar.EmployeeId
JOIN dbo.Locations l ON l.LocationId = ar.LocationId
JOIN dbo.Users rq ON rq.UserId = ar.RequesterUserId;
GO

CREATE OR ALTER VIEW dbo.vw_AccessPermissions
AS
SELECT ap.PermissionId, ap.EmployeeId, CONCAT(e.FirstName, N' ', e.LastName) AS EmployeeName, e.EmployeeNumber,
       ap.LocationId, l.LocationName, ap.AccessRequestId, ar.RequestNumber, ap.ValidFromUtc, ap.ValidToUtc,
       CASE WHEN ap.Status = N'Active' AND ap.ValidToUtc <= SYSUTCDATETIME() THEN N'Expired' ELSE ap.Status END AS Status,
       pb.DisplayName AS ProvisionedByName, ap.ProvisionedAtUtc, ap.RevokedAtUtc, ap.RevokeReason, ap.ControllerSyncStatus, ap.Version
FROM dbo.AccessPermissions ap
JOIN dbo.Employees e ON e.EmployeeId = ap.EmployeeId
JOIN dbo.Locations l ON l.LocationId = ap.LocationId
JOIN dbo.Users pb ON pb.UserId = ap.ProvisionedByUserId
LEFT JOIN dbo.AccessRequests ar ON ar.AccessRequestId = ap.AccessRequestId;
GO

CREATE OR ALTER VIEW dbo.vw_AccessLogs
AS
SELECT al.AccessLogId, al.ExternalEventId, al.ReaderId, r.ReaderName, al.MaskedCardUid, al.CardId, al.EmployeeId,
       CASE WHEN e.EmployeeId IS NULL THEN NULL ELSE CONCAT(e.FirstName, N' ', e.LastName) END AS EmployeeName,
       al.LocationId, l.LocationName, al.EventType, al.Decision, al.DenialReason, al.EventAtUtc, al.ReceivedAtUtc, al.ProcessingStatus
FROM dbo.AccessLogs al
JOIN dbo.Readers r ON r.ReaderId = al.ReaderId
JOIN dbo.Locations l ON l.LocationId = al.LocationId
LEFT JOIN dbo.Employees e ON e.EmployeeId = al.EmployeeId;
GO

CREATE OR ALTER VIEW dbo.vw_Violations
AS
SELECT v.ViolationId, v.AccessLogId, v.EmployeeId,
       CASE WHEN e.EmployeeId IS NULL THEN NULL ELSE CONCAT(e.FirstName, N' ', e.LastName) END AS EmployeeName,
       v.LocationId, l.LocationName, v.ViolationType, v.Severity, v.Status, v.DetectedAtUtc, v.ReviewNotes,
       rv.DisplayName AS ReviewedByName, v.ReviewedAtUtc, v.IncidentId, v.Version
FROM dbo.AccessViolations v
JOIN dbo.Locations l ON l.LocationId = v.LocationId
LEFT JOIN dbo.Employees e ON e.EmployeeId = v.EmployeeId
LEFT JOIN dbo.Users rv ON rv.UserId = v.ReviewedByUserId;
GO

CREATE OR ALTER VIEW dbo.vw_Incidents
AS
SELECT i.IncidentId, i.IncidentNumber, i.ViolationId, i.IncidentType, i.Title, i.Description, i.Severity, i.Status,
       i.LocationId, l.LocationName, i.AssignedToUserId, au.DisplayName AS AssignedToName, i.Resolution,
       ob.DisplayName AS OpenedByName, i.OpenedAtUtc, i.ClosedAtUtc, i.Version
FROM dbo.SecurityIncidents i
JOIN dbo.Users ob ON ob.UserId = i.OpenedByUserId
LEFT JOIN dbo.Locations l ON l.LocationId = i.LocationId
LEFT JOIN dbo.Users au ON au.UserId = i.AssignedToUserId;
GO

CREATE OR ALTER VIEW dbo.vw_Blacklist
AS
SELECT b.BlacklistId, b.SubjectType, b.SubjectId,
       CASE b.SubjectType
            WHEN N'Employee' THEN (SELECT CONCAT(e.FirstName, N' ', e.LastName, N' (', e.EmployeeNumber, N')') FROM dbo.Employees e WHERE e.EmployeeId = b.SubjectId)
            WHEN N'Visitor' THEN (SELECT v.DisplayName FROM dbo.Visitors v WHERE v.VisitorId = b.SubjectId)
            WHEN N'Card' THEN (SELECT CONCAT(N'Card ', dbo.fn_MaskCardUid(c.CardUid)) FROM dbo.RFIDCards c WHERE c.CardId = b.SubjectId)
       END AS SubjectName,
       b.Reason, b.ReviewDate, b.IsActive, cb.DisplayName AS CreatedByName, b.CreatedAtUtc,
       lb.DisplayName AS LiftedByName, b.LiftedAtUtc, b.LiftReason
FROM dbo.Blacklist b
JOIN dbo.Users cb ON cb.UserId = b.CreatedByUserId
LEFT JOIN dbo.Users lb ON lb.UserId = b.LiftedByUserId;
GO

CREATE OR ALTER VIEW dbo.vw_Visitors
AS
SELECT v.VisitorId, v.DisplayName, v.Organization, v.ContactReference, v.VisitPurpose, v.SponsorUserId, su.DisplayName AS SponsorName,
       CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Blacklist b WHERE b.SubjectType = N'Visitor' AND b.SubjectId = v.VisitorId AND b.IsActive = 1)
                 THEN 1 ELSE 0 END AS BIT) AS IsBlacklisted,
       v.CreatedAtUtc,
       (SELECT COUNT(*) FROM dbo.VisitorPasses p WHERE p.VisitorId = v.VisitorId) AS PassCount
FROM dbo.Visitors v
LEFT JOIN dbo.Users su ON su.UserId = v.SponsorUserId;
GO

CREATE OR ALTER VIEW dbo.vw_VisitorPasses
AS
SELECT p.VisitorPassId, p.PassNumber, p.VisitorId, v.DisplayName AS VisitorName, v.Organization, p.LocationId, l.LocationName,
       p.SponsorUserId, su.DisplayName AS SponsorName, p.ValidFromUtc, p.ValidToUtc,
       CASE WHEN p.Status IN (N'PendingApproval', N'Approved') AND p.ValidToUtc <= SYSUTCDATETIME() THEN N'Expired' ELSE p.Status END AS Status,
       ab.DisplayName AS ApprovedByName, p.ApprovedAtUtc, p.CheckedInAtUtc, p.CheckedOutAtUtc, p.RevokeReason,
       p.CreatedByUserId, p.CreatedAtUtc, p.Version
FROM dbo.VisitorPasses p
JOIN dbo.Visitors v ON v.VisitorId = p.VisitorId
JOIN dbo.Locations l ON l.LocationId = p.LocationId
LEFT JOIN dbo.Users su ON su.UserId = p.SponsorUserId
LEFT JOIN dbo.Users ab ON ab.UserId = p.ApprovedByUserId;
GO

CREATE OR ALTER VIEW dbo.vw_AuditLogs
AS
SELECT a.AuditLogId, a.ActorUserId, ISNULL(u.DisplayName, N'System') AS ActorName, a.Action, a.EntityType, a.EntityId, a.Summary,
       a.BeforeJson, a.AfterJson, a.Reason, a.OccurredAtUtc, a.CorrelationId, a.IpAddress
FROM dbo.AuditLogs a
LEFT JOIN dbo.Users u ON u.UserId = a.ActorUserId;
GO
