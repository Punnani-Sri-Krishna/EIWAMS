/*=====================================================================
  EIWAMS - 12_PurgeDemoData.sql
  OPT-IN ONLY: run by Deploy-Database.ps1 -PurgeDemoData or
  Invoke-DbMigrations.ps1 -PurgeDemoData (workflow input purge_demo_data).
  Never applied by a normal deployment; refuses databases whose name
  contains 'prod'.

  Purges rows that can be positively tied to 12_DemoData.sql:
    * users/employees with the @eiwams.local suffix, excluding the
      bootstrap administrator and its employee;
    * child workflow/activity rows linked by those user/employee IDs,
      demo card IDs, demo request IDs, or the demo RFID event prefix;
    * the exact Demo.V2Seeded marker.

  The former seed's exact department/location/reader keys are removed only
  after demo workflows. Remaining employee, permission, user-scope, reader,
  request, access-log, incident, visitor-pass, controller-command, and
  location-hierarchy references cause the transaction to abort. Normal
  SystemSettings values are kept. Seed-time updates to pre-existing rows
  have no before-image and cannot be restored by this purge.
  Unmatched controller commands and unlinked audit/activity rows are
  retained rather than inferred to be demo data.
  Safe to re-run.
=====================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() LIKE N'%prod%'
    THROW 50400, N'The demo data purge must not be run against a production database.', 1;
GO

BEGIN TRY
    BEGIN TRAN;

    -- Append-only triggers block DELETE; disabling is transaction-scoped
    -- in effect because rollback restores the original trigger state.
    DISABLE TRIGGER dbo.trg_AuditLogs_AppendOnly ON dbo.AuditLogs;
    DISABLE TRIGGER dbo.trg_AccessLogs_AppendOnly ON dbo.AccessLogs;
    DISABLE TRIGGER dbo.trg_EmployeeHistory_AppendOnly ON dbo.EmployeeHistory;

    DECLARE @BootstrapAdminId INT;
    SELECT @BootstrapAdminId = UserId
    FROM dbo.Users
    WHERE Email = N'admin@eiwams.local';
    DECLARE @DemoUsers TABLE (UserId INT PRIMARY KEY);
    INSERT @DemoUsers (UserId)
    SELECT UserId
    FROM dbo.Users
    WHERE Email LIKE N'%@eiwams.local'
      AND Email <> N'admin@eiwams.local';

    DECLARE @DemoEmployees TABLE (EmployeeId INT PRIMARY KEY);
    INSERT @DemoEmployees (EmployeeId)
    SELECT e.EmployeeId
    FROM dbo.Employees e
    WHERE (e.WorkEmail LIKE N'%@eiwams.local'
           OR e.UserId IN (SELECT UserId FROM @DemoUsers))
      AND (e.UserId IS NULL OR e.UserId <> @BootstrapAdminId)
      AND e.WorkEmail <> N'admin@eiwams.local';

    -- Exact natural keys from the former 12_DemoData.sql seed.
    DECLARE @DemoDepartments TABLE (DepartmentId INT PRIMARY KEY);
    INSERT @DemoDepartments (DepartmentId)
    SELECT DepartmentId FROM dbo.Departments
    WHERE DepartmentCode IN (N'ENG', N'HR', N'SEC', N'FAC', N'FIN', N'RND', N'MFG', N'IT');

    DECLARE @DemoLocations TABLE (LocationId INT PRIMARY KEY);
    INSERT @DemoLocations (LocationId)
    SELECT LocationId FROM dbo.Locations
    WHERE LocationCode IN
    (
        N'BLR', N'BLR-TA', N'BLR-TA-GF', N'BLR-TA-LOBBY', N'BLR-TA-VIS',
        N'BLR-TA-F3', N'BLR-TA-ODC1', N'BLR-TA-ODC2', N'BLR-TA-F5',
        N'BLR-TA-RND', N'BLR-TB', N'BLR-TB-B1', N'BLR-TB-DC', N'BLR-TB-F1',
        N'BLR-TB-CAF', N'PUN', N'PUN-P1', N'PUN-P1-GATE', N'PUN-P1-SF',
        N'PUN-P1-PROD', N'PUN-P1-QC', N'BLR-BA', N'BLR-BA-F1', N'BLR-BA-WE',
        N'BLR-BA-WW', N'BLR-BB', N'BLR-BB-F1', N'BLR-BB-F2', N'BLR-CO',
        N'BLR-CO-F1', N'BLR-CO-EXE', N'BLR-DCB', N'BLR-DCB-H1'
    );

    DECLARE @DemoReaders TABLE (ReaderId NVARCHAR(80) PRIMARY KEY);
    INSERT @DemoReaders (ReaderId)
    VALUES
        (N'RDR-BLR-LOBBY-IN'), (N'RDR-BLR-LOBBY-OUT'),
        (N'RDR-BLR-ODC1-01'), (N'RDR-BLR-ODC2-01'),
        (N'RDR-BLR-RND-01'), (N'RDR-BLR-DC-01'),
        (N'RDR-BLR-CAF-01'), (N'RDR-PUN-GATE-01'),
        (N'RDR-PUN-PROD-01'), (N'RDR-PUN-QC-01');

    -- Capture identities before deleting any transaction rows.
    DECLARE @DemoCards TABLE (CardId BIGINT PRIMARY KEY);
    INSERT @DemoCards (CardId)
    SELECT c.CardId
    FROM dbo.RFIDCards c
    WHERE c.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees);

    DECLARE @DemoCardRequests TABLE (CardRequestId BIGINT PRIMARY KEY);
    INSERT @DemoCardRequests (CardRequestId)
    SELECT r.CardRequestId
    FROM dbo.CardRequests r
    WHERE r.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees)
       OR r.RequestedByUserId IN (SELECT UserId FROM @DemoUsers)
       OR r.OldCardId IN (SELECT CardId FROM @DemoCards)
       OR r.NewCardId IN (SELECT CardId FROM @DemoCards);

    DECLARE @DemoAccessRequests TABLE (AccessRequestId BIGINT PRIMARY KEY);
    INSERT @DemoAccessRequests (AccessRequestId)
    SELECT r.AccessRequestId
    FROM dbo.AccessRequests r
    WHERE r.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees)
       OR r.RequesterUserId IN (SELECT UserId FROM @DemoUsers);

    DECLARE @DemoPermissions TABLE (PermissionId BIGINT PRIMARY KEY);
    INSERT @DemoPermissions (PermissionId)
    SELECT p.PermissionId
    FROM dbo.AccessPermissions p
    WHERE p.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees)
       OR p.ProvisionedByUserId IN (SELECT UserId FROM @DemoUsers)
       OR p.AccessRequestId IN (SELECT AccessRequestId FROM @DemoAccessRequests);

    DECLARE @DemoAccessLogs TABLE (AccessLogId BIGINT PRIMARY KEY);
    INSERT @DemoAccessLogs (AccessLogId)
    SELECT l.AccessLogId
    FROM dbo.AccessLogs l
    WHERE l.ExternalEventId LIKE N'DEMO-%'
       OR l.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees)
       OR l.CardId IN (SELECT CardId FROM @DemoCards)
       OR l.PermissionId IN (SELECT PermissionId FROM @DemoPermissions);

    DECLARE @DemoViolations TABLE (ViolationId BIGINT PRIMARY KEY);
    INSERT @DemoViolations (ViolationId)
    SELECT v.ViolationId
    FROM dbo.AccessViolations v
    WHERE v.EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees)
       OR v.CardId IN (SELECT CardId FROM @DemoCards)
       OR v.AccessLogId IN (SELECT AccessLogId FROM @DemoAccessLogs);

    DECLARE @DemoIncidents TABLE (IncidentId INT PRIMARY KEY);
    INSERT @DemoIncidents (IncidentId)
    SELECT i.IncidentId
    FROM dbo.SecurityIncidents i
    WHERE i.ViolationId IN (SELECT ViolationId FROM @DemoViolations)
       OR i.OpenedByUserId IN (SELECT UserId FROM @DemoUsers);

    DECLARE @DemoVisitors TABLE (VisitorId INT PRIMARY KEY);
    INSERT @DemoVisitors (VisitorId)
    SELECT v.VisitorId
    FROM dbo.Visitors v
    WHERE v.CreatedByUserId IN (SELECT UserId FROM @DemoUsers)
       OR v.SponsorUserId IN (SELECT UserId FROM @DemoUsers);

    DECLARE @DemoVisitorPasses TABLE (VisitorPassId BIGINT PRIMARY KEY);
    INSERT @DemoVisitorPasses (VisitorPassId)
    SELECT p.VisitorPassId
    FROM dbo.VisitorPasses p
    WHERE p.VisitorId IN (SELECT VisitorId FROM @DemoVisitors)
       OR p.CreatedByUserId IN (SELECT UserId FROM @DemoUsers)
       OR p.SponsorUserId IN (SELECT UserId FROM @DemoUsers);

    /*-------------------- Identifiable activity rows ----------------*/
    DELETE dbo.Notifications
    WHERE UserId IN (SELECT UserId FROM @DemoUsers)
       OR (RelatedEntityType = N'Employee' AND TRY_CONVERT(INT, RelatedEntityId) IN
              (SELECT EmployeeId FROM @DemoEmployees))
       OR (RelatedEntityType = N'Card' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT CardId FROM @DemoCards))
       OR (RelatedEntityType = N'CardRequest' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT CardRequestId FROM @DemoCardRequests))
       OR (RelatedEntityType = N'AccessRequest' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT AccessRequestId FROM @DemoAccessRequests))
       OR (RelatedEntityType = N'AccessPermission' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT PermissionId FROM @DemoPermissions))
       OR (RelatedEntityType = N'AccessLog' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT AccessLogId FROM @DemoAccessLogs))
       OR (RelatedEntityType = N'AccessViolation' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT ViolationId FROM @DemoViolations))
       OR (RelatedEntityType = N'SecurityIncident' AND TRY_CONVERT(INT, RelatedEntityId) IN
              (SELECT IncidentId FROM @DemoIncidents))
       OR (RelatedEntityType = N'VisitorPass' AND TRY_CONVERT(BIGINT, RelatedEntityId) IN
              (SELECT VisitorPassId FROM @DemoVisitorPasses))
       OR (RelatedEntityType = N'Visitor' AND TRY_CONVERT(INT, RelatedEntityId) IN
              (SELECT VisitorId FROM @DemoVisitors));

    -- Match either a demo actor or a typed reference to a captured demo row;
    -- this includes audit entries emitted by the bootstrap actor for demo
    -- RFID events without touching unrelated administrator activity.
    DELETE dbo.AuditLogs
    WHERE ActorUserId IN (SELECT UserId FROM @DemoUsers)
       OR (EntityType = N'Employee' AND TRY_CONVERT(INT, EntityId) IN
              (SELECT EmployeeId FROM @DemoEmployees))
       OR (EntityType = N'Card' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT CardId FROM @DemoCards))
       OR (EntityType = N'CardRequest' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT CardRequestId FROM @DemoCardRequests))
       OR (EntityType = N'AccessRequest' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT AccessRequestId FROM @DemoAccessRequests))
       OR (EntityType = N'AccessPermission' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT PermissionId FROM @DemoPermissions))
       OR (EntityType = N'AccessLog' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT AccessLogId FROM @DemoAccessLogs))
       OR (EntityType = N'AccessViolation' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT ViolationId FROM @DemoViolations))
       OR (EntityType = N'SecurityIncident' AND TRY_CONVERT(INT, EntityId) IN
              (SELECT IncidentId FROM @DemoIncidents))
       OR (EntityType = N'VisitorPass' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT VisitorPassId FROM @DemoVisitorPasses))
       OR (EntityType = N'Visitor' AND TRY_CONVERT(INT, EntityId) IN
              (SELECT VisitorId FROM @DemoVisitors));

    DELETE dbo.IncidentNotes
    WHERE IncidentId IN (SELECT IncidentId FROM @DemoIncidents)
       OR CreatedByUserId IN (SELECT UserId FROM @DemoUsers);

    -- Break the circular incident/violation reference before deleting either.
    UPDATE dbo.AccessViolations
       SET IncidentId = NULL
     WHERE IncidentId IN (SELECT IncidentId FROM @DemoIncidents);
    DELETE dbo.SecurityIncidents
    WHERE IncidentId IN (SELECT IncidentId FROM @DemoIncidents);

    DELETE dbo.AccessViolations
    WHERE ViolationId IN (SELECT ViolationId FROM @DemoViolations);

    DELETE dbo.Blacklist
    WHERE CreatedByUserId IN (SELECT UserId FROM @DemoUsers)
       OR (SubjectType = N'Employee' AND SubjectId IN
              (SELECT EmployeeId FROM @DemoEmployees))
       OR (SubjectType = N'Visitor' AND SubjectId IN
              (SELECT VisitorId FROM @DemoVisitors));

    DELETE dbo.VisitorPasses
    WHERE VisitorPassId IN (SELECT VisitorPassId FROM @DemoVisitorPasses);
    DELETE dbo.Visitors
    WHERE VisitorId IN (SELECT VisitorId FROM @DemoVisitors);

    DELETE dbo.AccessLogs
    WHERE AccessLogId IN (SELECT AccessLogId FROM @DemoAccessLogs);

    DELETE dbo.AccessPermissions
    WHERE PermissionId IN (SELECT PermissionId FROM @DemoPermissions);

    DELETE dbo.ControllerCommands
    WHERE (EntityType = N'Card' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT CardId FROM @DemoCards))
       OR (EntityType = N'AccessPermission' AND TRY_CONVERT(BIGINT, EntityId) IN
              (SELECT PermissionId FROM @DemoPermissions));

    DELETE dbo.AccessRequestApprovalAssignees
    WHERE ApprovalId IN
          (SELECT ApprovalId FROM dbo.AccessRequestApprovals
           WHERE AccessRequestId IN (SELECT AccessRequestId FROM @DemoAccessRequests))
       OR UserId IN (SELECT UserId FROM @DemoUsers);
    DELETE dbo.AccessRequestApprovals
    WHERE AccessRequestId IN (SELECT AccessRequestId FROM @DemoAccessRequests);
    DELETE dbo.AccessRequests
    WHERE AccessRequestId IN (SELECT AccessRequestId FROM @DemoAccessRequests);

    DELETE dbo.CardRequestHistory
    WHERE CardRequestId IN (SELECT CardRequestId FROM @DemoCardRequests);
    DELETE dbo.CardRequests
    WHERE CardRequestId IN (SELECT CardRequestId FROM @DemoCardRequests);

    -- Remove only rows linked to a demo employee; other cards and their
    -- activity remain untouched. Clear circular references first.
    UPDATE dbo.RFIDCards SET CardRequestId = NULL
    WHERE CardRequestId IN (SELECT CardRequestId FROM @DemoCardRequests)
       OR CardId IN (SELECT CardId FROM @DemoCards);
    UPDATE dbo.RFIDCards SET ReplacedByCardId = NULL
    WHERE ReplacedByCardId IN (SELECT CardId FROM @DemoCards)
       OR CardId IN (SELECT CardId FROM @DemoCards);
    DELETE dbo.RFIDCards
    WHERE CardId IN (SELECT CardId FROM @DemoCards);

    DELETE dbo.EmployeeHistory
    WHERE EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees);
    DELETE dbo.EmployeePhotos
    WHERE EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees);

    /*----------------------- Identity cleanup -----------------------*/
    UPDATE dbo.Employees SET ManagerEmployeeId = NULL
    WHERE ManagerEmployeeId IN (SELECT EmployeeId FROM @DemoEmployees);
    UPDATE dbo.Employees SET CreatedByUserId = NULL
    WHERE CreatedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.Employees SET UpdatedByUserId = NULL
    WHERE UpdatedByUserId IN (SELECT UserId FROM @DemoUsers);
    DELETE dbo.Employees
    WHERE EmployeeId IN (SELECT EmployeeId FROM @DemoEmployees);

    -- Keep normal settings and reference/master rows; only remove the
    -- marker written by the former v2 demo block.
    UPDATE dbo.EmployeePhotos SET UploadedByUserId = NULL
    WHERE UploadedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.Departments SET HeadUserId = NULL
    WHERE HeadUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.SystemSettings SET UpdatedByUserId = NULL
    WHERE UpdatedByUserId IN (SELECT UserId FROM @DemoUsers);
    DELETE dbo.SystemSettings WHERE SettingKey = N'Demo.V2Seeded';

    -- Remove demo-user attribution from retained rows where the FK is
    -- nullable. Required user references on targeted transactions were
    -- already removed with those transactions.
    UPDATE dbo.RFIDCards SET CreatedByUserId = NULL
    WHERE CreatedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.RFIDCards SET UpdatedByUserId = NULL
    WHERE UpdatedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.CardRequests SET VerifiedByUserId = NULL
    WHERE VerifiedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.CardRequests SET ApprovedByUserId = NULL
    WHERE ApprovedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.CardRequestHistory SET ActorUserId = NULL
    WHERE ActorUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.AccessRequestApprovals SET DecidedByUserId = NULL
    WHERE DecidedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.AccessPermissions SET RevokedByUserId = NULL
    WHERE RevokedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.AccessViolations SET ReviewedByUserId = NULL
    WHERE ReviewedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.SecurityIncidents SET AssignedToUserId = NULL
    WHERE AssignedToUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.Blacklist SET LiftedByUserId = NULL
    WHERE LiftedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.Visitors SET SponsorUserId = NULL
    WHERE SponsorUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.VisitorPasses SET SponsorUserId = NULL
    WHERE SponsorUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.VisitorPasses SET ApprovedByUserId = NULL
    WHERE ApprovedByUserId IN (SELECT UserId FROM @DemoUsers);
    UPDATE dbo.VisitorPasses SET RevokedByUserId = NULL
    WHERE RevokedByUserId IN (SELECT UserId FROM @DemoUsers);

    DELETE dbo.UserRoles WHERE UserId IN (SELECT UserId FROM @DemoUsers);
    DELETE dbo.UserFacilityScopes WHERE UserId IN (SELECT UserId FROM @DemoUsers);
    DELETE dbo.Users WHERE UserId IN (SELECT UserId FROM @DemoUsers);

    /*------------------ Guard and remove demo master rows -------------*/
    -- These checks run after demo identities/workflows/scopes have been
    -- removed. Any remaining reference is therefore non-demo or unknown;
    -- abort the whole transaction rather than leave a requested key behind.
    IF EXISTS
       (SELECT 1 FROM dbo.Employees e
        WHERE e.DepartmentId IN (SELECT DepartmentId FROM @DemoDepartments))
        THROW 50400, N'Demo master purge aborted: a remaining employee references a demo department.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.Employees e
        WHERE e.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining employee references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.AccessPermissions p
        WHERE p.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining access permission references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.UserFacilityScopes s
        WHERE s.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining user facility scope references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.AccessRequests r
        WHERE r.LocationId IN (SELECT LocationId FROM @DemoLocations)
           OR r.BuildingLocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining access request references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.AccessLogs l
        WHERE l.LocationId IN (SELECT LocationId FROM @DemoLocations)
           OR l.ReaderId IN (SELECT ReaderId FROM @DemoReaders))
        THROW 50400, N'Demo master purge aborted: a remaining access log references a demo location or reader.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.AccessViolations v
        WHERE v.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining access violation references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.SecurityIncidents i
        WHERE i.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining security incident references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.VisitorPasses p
        WHERE p.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining visitor pass references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.ControllerCommands c
        WHERE c.LocationId IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining controller command references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.Readers r
        JOIN @DemoLocations d ON d.LocationId = r.LocationId
        WHERE r.ReaderId NOT IN (SELECT ReaderId FROM @DemoReaders))
        THROW 50400, N'Demo master purge aborted: another reader references a demo location.', 1;

    IF EXISTS
       (SELECT 1 FROM dbo.Locations child
        JOIN @DemoLocations d ON d.LocationId = child.ParentLocationId
        WHERE child.LocationId NOT IN (SELECT LocationId FROM @DemoLocations))
        THROW 50400, N'Demo master purge aborted: a remaining location is nested under a demo location.', 1;

    DELETE dbo.Readers
    WHERE ReaderId IN (SELECT ReaderId FROM @DemoReaders);

    DELETE dbo.Departments
    WHERE DepartmentId IN (SELECT DepartmentId FROM @DemoDepartments);

    -- Self-referencing location FK: delete known demo leaves before parents.
    DECLARE @DeletedLocationCount INT;
    WHILE EXISTS
          (SELECT 1 FROM dbo.Locations l
           JOIN @DemoLocations d ON d.LocationId = l.LocationId)
    BEGIN
        DELETE l
        FROM dbo.Locations l
        JOIN @DemoLocations d ON d.LocationId = l.LocationId
        WHERE NOT EXISTS
              (SELECT 1 FROM dbo.Locations child
               WHERE child.ParentLocationId = l.LocationId);

        SET @DeletedLocationCount = @@ROWCOUNT;
        IF @DeletedLocationCount = 0
            THROW 50400, N'Demo master purge aborted: demo locations could not be deleted in FK-safe order.', 1;
    END;

    ENABLE TRIGGER dbo.trg_AuditLogs_AppendOnly ON dbo.AuditLogs;
    ENABLE TRIGGER dbo.trg_AccessLogs_AppendOnly ON dbo.AccessLogs;
    ENABLE TRIGGER dbo.trg_EmployeeHistory_AppendOnly ON dbo.EmployeeHistory;

    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH;
GO

EXEC dbo.usp_Audit_Write NULL, N'System.DemoDataPurged', N'System', N'12_PurgeDemoData', N'Identifiable demo data purged.';
GO

SELECT (SELECT COUNT(*) FROM dbo.Users) AS Users, (SELECT COUNT(*) FROM dbo.Employees) AS Employees,
       (SELECT COUNT(*) FROM dbo.Departments) AS Departments, (SELECT COUNT(*) FROM dbo.Locations) AS Locations,
       (SELECT COUNT(*) FROM dbo.CardRequests) AS CardRequests, (SELECT COUNT(*) FROM dbo.AccessRequests) AS AccessRequests;
GO
