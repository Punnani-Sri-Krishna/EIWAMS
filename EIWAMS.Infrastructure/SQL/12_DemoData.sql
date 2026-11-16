/*=====================================================================
  EIWAMS - 12_DemoData.sql
  Synthetic demo data (non-production only). Idempotent:
   * Part 1 (users, scopes, departments, locations, readers, employees)
     is merged on natural keys and safe to re-run.
   * Part 2 (cards, permissions, workflows, events, security, visitors)
     runs once, inside a single transaction, through the real stored
     procedures so every row is consistent and audited.
  All names are fictitious.
=====================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF DB_NAME() LIKE N'%prod%'
    THROW 50400, N'Demo data must not be deployed to a production database.', 1;
GO

/*============================== PART 1 ==============================*/
BEGIN TRAN;

/*--------------------------------- Users ----------------------------*/
DECLARE @U TABLE (UserId INT PRIMARY KEY, DisplayName NVARCHAR(200), Email NVARCHAR(256), AllFacilities BIT, Roles NVARCHAR(200), Scopes NVARCHAR(200));
INSERT @U VALUES
 (2,  N'Hari Krishnan',   N'hari.krishnan@eiwams.local',   0, N'Employee,HRAdmin',       N'BLR,PUN'),
 (3,  N'Meera Iyer',      N'meera.iyer@eiwams.local',      0, N'Employee,Manager',       N'BLR'),
 (4,  N'Sanjay Kulkarni', N'sanjay.kulkarni@eiwams.local', 0, N'Employee,SecurityTeam,SecurityHead', N'BLR,PUN'),
 (5,  N'Farah Sheikh',    N'farah.sheikh@eiwams.local',    0, N'Employee,FacilityAdmin,AccessControlTeam', N'BLR'),
 (6,  N'Ravi Shankar',    N'ravi.shankar@eiwams.local',    0, N'Reception',              N'BLR-TA'),
 (7,  N'Esha Patel',      N'esha.patel@eiwams.local',      0, N'Employee',               N''),
 (8,  N'Arjun Mehta',     N'arjun.mehta@eiwams.local',     1, N'Auditor',                N''),
 (9,  N'Vikram Rao',      N'vikram.rao@eiwams.local',      0, N'Employee',               N''),
 (10, N'Priya Nair',      N'priya.nair@eiwams.local',      0, N'Employee',               N''),
 (11, N'Sai Sharanya',   N'sai.sharanya@eiwams.local',    1, N'Employee,Manager,SecurityHead', N''),
 (12, N'Isha Card Desk', N'idcard.team@eiwams.local',     0, N'Employee,IdCardTeam',     N'BLR'),
 (13, N'Arvind Access Control', N'access.control@eiwams.local', 1, N'Employee,AccessControlTeam', N''),
 (14, N'Kiran Das',      N'kiran.das@eiwams.local',       0, N'Employee',               N''),
 (15, N'Neha Joshi',     N'neha.joshi@eiwams.local',      0, N'Employee',               N'');

DECLARE @Id INT = 2;
SET IDENTITY_INSERT dbo.Users ON;
WHILE @Id <= 15
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Users u JOIN @U s ON s.Email = u.Email WHERE s.UserId = @Id)
       AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @Id)
        INSERT dbo.Users (UserId, DisplayName, Email, IsActive, AllFacilities)
        SELECT UserId, DisplayName, Email, 1, AllFacilities FROM @U WHERE UserId = @Id;
    SET @Id += 1;
END
SET IDENTITY_INSERT dbo.Users OFF;

-- Fall back to generated ids if a fixed id was already taken by someone else.
INSERT dbo.Users (DisplayName, Email, IsActive, AllFacilities)
SELECT s.DisplayName, s.Email, 1, s.AllFacilities FROM @U s
WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.Email = s.Email);

INSERT dbo.UserRoles (UserId, RoleId)
SELECT u.UserId, r.RoleId
FROM @U s
JOIN dbo.Users u ON u.Email = s.Email
CROSS APPLY STRING_SPLIT(s.Roles, N',') x
JOIN dbo.Roles r ON r.RoleName = x.value
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = u.UserId AND ur.RoleId = r.RoleId);

/*------------------------------ Departments -------------------------*/
DECLARE @D TABLE (DepartmentCode NVARCHAR(20) PRIMARY KEY, DepartmentName NVARCHAR(150));
INSERT @D VALUES
 (N'ENG', N'Engineering'), (N'HR', N'Human Resources'), (N'SEC', N'Corporate Security'), (N'FAC', N'Facilities & Administration'),
 (N'FIN', N'Finance'), (N'RND', N'Research & Development'), (N'MFG', N'Manufacturing Operations'), (N'IT', N'Information Technology');
INSERT dbo.Departments (DepartmentCode, DepartmentName)
SELECT s.DepartmentCode, s.DepartmentName FROM @D s
WHERE NOT EXISTS (SELECT 1 FROM dbo.Departments d WHERE d.DepartmentCode = s.DepartmentCode);

/*------------------------------- Locations --------------------------*/
DECLARE @L TABLE (SortKey INT PRIMARY KEY, LocationCode NVARCHAR(30), ParentCode NVARCHAR(30), LocationName NVARCHAR(150), LocationType NVARCHAR(20), IsRestricted BIT);
INSERT @L VALUES
 (1,  N'BLR',          NULL,         N'Bengaluru Campus (Whitefield)',  N'Campus',   0),
 (2,  N'BLR-TA',       N'BLR',       N'Tower A',                        N'Building', 0),
 (3,  N'BLR-TA-GF',    N'BLR-TA',    N'Tower A - Ground Floor',         N'Floor',    0),
 (4,  N'BLR-TA-LOBBY', N'BLR-TA-GF', N'Tower A Main Lobby',             N'Zone',     0),
 (5,  N'BLR-TA-VIS',   N'BLR-TA-GF', N'Visitor Lounge',                 N'Zone',     0),
 (6,  N'BLR-TA-F3',    N'BLR-TA',    N'Tower A - Floor 3',              N'Floor',    0),
 (7,  N'BLR-TA-ODC1',  N'BLR-TA-F3', N'Offshore Delivery Centre 1',     N'Zone',     1),
 (8,  N'BLR-TA-ODC2',  N'BLR-TA-F3', N'Offshore Delivery Centre 2',     N'Zone',     1),
 (9,  N'BLR-TA-F5',    N'BLR-TA',    N'Tower A - Floor 5',              N'Floor',    0),
 (10, N'BLR-TA-RND',   N'BLR-TA-F5', N'R&D Lab',                        N'Zone',     1),
 (11, N'BLR-TB',       N'BLR',       N'Tower B',                        N'Building', 0),
 (12, N'BLR-TB-B1',    N'BLR-TB',    N'Tower B - Basement 1',           N'Floor',    0),
 (13, N'BLR-TB-DC',    N'BLR-TB-B1', N'Data Centre',                    N'Zone',     1),
 (14, N'BLR-TB-F1',    N'BLR-TB',    N'Tower B - Floor 1',              N'Floor',    0),
 (15, N'BLR-TB-CAF',   N'BLR-TB-F1', N'Cafeteria',                      N'Zone',     0),
 (16, N'PUN',          NULL,         N'Pune Campus (Chakan)',           N'Campus',   0),
 (17, N'PUN-P1',       N'PUN',       N'Plant 1',                        N'Building', 0),
 (18, N'PUN-P1-GATE',  N'PUN-P1',    N'Plant 1 Main Gate',              N'Zone',     0),
 (19, N'PUN-P1-SF',    N'PUN-P1',    N'Plant 1 - Shop Floor',           N'Floor',    0),
 (20, N'PUN-P1-PROD',  N'PUN-P1-SF', N'Production Line',                N'Zone',     1),
 (21, N'PUN-P1-QC',    N'PUN-P1-SF', N'Quality Control Lab',            N'Zone',     1),
 (22, N'BLR-BA',       N'BLR',       N'Building A',                      N'Building', 0),
 (23, N'BLR-BA-F1',    N'BLR-BA',    N'Floor 1',                         N'Floor',    0),
 (24, N'BLR-BA-WE',    N'BLR-BA',    N'East Wing',                       N'Wing',     0),
 (25, N'BLR-BA-WW',    N'BLR-BA',    N'West Wing',                       N'Wing',     0),
 (26, N'BLR-BB',       N'BLR',       N'Building B',                      N'Building', 0),
 (27, N'BLR-BB-F1',    N'BLR-BB',    N'Floor 1',                         N'Floor',    0),
 (28, N'BLR-BB-F2',    N'BLR-BB',    N'Floor 2',                         N'Floor',    0),
 (29, N'BLR-CO',       N'BLR',       N'Corporate Office',                N'Building', 0),
 (30, N'BLR-CO-F1',    N'BLR-CO',    N'Floor 1',                         N'Floor',    0),
 (31, N'BLR-CO-EXE',   N'BLR-CO',    N'Executive Wing',                  N'Wing',     1),
 (32, N'BLR-DCB',      N'BLR',       N'Data Center',                     N'Building', 1),
 (33, N'BLR-DCB-H1',   N'BLR-DCB',   N'Server Hall 1',                   N'Zone',     1);

DECLARE @k INT = 1;
WHILE @k <= 33
BEGIN
    INSERT dbo.Locations (ParentLocationId, LocationCode, LocationName, LocationType, IsRestricted)
    SELECT p.LocationId, s.LocationCode, s.LocationName, s.LocationType, s.IsRestricted
    FROM @L s LEFT JOIN dbo.Locations p ON p.LocationCode = s.ParentCode
    WHERE s.SortKey = @k AND NOT EXISTS (SELECT 1 FROM dbo.Locations l WHERE l.LocationCode = s.LocationCode);
    SET @k += 1;
END

INSERT dbo.UserFacilityScopes (UserId, LocationId)
SELECT u.UserId, l.LocationId
FROM @U s
JOIN dbo.Users u ON u.Email = s.Email
CROSS APPLY STRING_SPLIT(s.Scopes, N',') x
JOIN dbo.Locations l ON l.LocationCode = x.value
WHERE x.value <> N''
  AND NOT EXISTS (SELECT 1 FROM dbo.UserFacilityScopes f WHERE f.UserId = u.UserId AND f.LocationId = l.LocationId);

/*-------------------------------- Readers ---------------------------*/
DECLARE @R TABLE (ReaderId NVARCHAR(50) PRIMARY KEY, ReaderName NVARCHAR(150), LocationCode NVARCHAR(30), Direction NVARCHAR(10));
INSERT @R VALUES
 (N'RDR-BLR-LOBBY-IN',  N'Tower A Lobby Turnstile (In)',  N'BLR-TA-LOBBY', N'In'),
 (N'RDR-BLR-LOBBY-OUT', N'Tower A Lobby Turnstile (Out)', N'BLR-TA-LOBBY', N'Out'),
 (N'RDR-BLR-ODC1-01',   N'ODC 1 Door',                    N'BLR-TA-ODC1',  N'Both'),
 (N'RDR-BLR-ODC2-01',   N'ODC 2 Door',                    N'BLR-TA-ODC2',  N'Both'),
 (N'RDR-BLR-RND-01',    N'R&D Lab Door',                  N'BLR-TA-RND',   N'Both'),
 (N'RDR-BLR-DC-01',     N'Data Centre Mantrap',           N'BLR-TB-DC',    N'Both'),
 (N'RDR-BLR-CAF-01',    N'Cafeteria Entrance',            N'BLR-TB-CAF',   N'Both'),
 (N'RDR-PUN-GATE-01',   N'Plant 1 Main Gate',             N'PUN-P1-GATE',  N'Both'),
 (N'RDR-PUN-PROD-01',   N'Production Line Door',          N'PUN-P1-PROD',  N'Both'),
 (N'RDR-PUN-QC-01',     N'QC Lab Door',                   N'PUN-P1-QC',    N'Both');
INSERT dbo.Readers (ReaderId, ReaderName, LocationId, Direction)
SELECT s.ReaderId, s.ReaderName, l.LocationId, s.Direction
FROM @R s JOIN dbo.Locations l ON l.LocationCode = s.LocationCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.Readers r WHERE r.ReaderId = s.ReaderId);

/*------------------------------- Employees --------------------------*/
DECLARE @E TABLE (SortKey INT PRIMARY KEY, EmployeeNumber NVARCHAR(20), FirstName NVARCHAR(100), LastName NVARCHAR(100), EmployeeType NVARCHAR(20),
                  DeptCode NVARCHAR(20), LocCode NVARCHAR(30), ManagerNumber NVARCHAR(20), UserEmail NVARCHAR(256), JoinDaysAgo INT,
                  EmploymentStatus NVARCHAR(20), EndDaysAgo INT);
INSERT @E VALUES
 (1,  N'EMP0003', N'Meera',     N'Iyer',         N'Permanent', N'ENG', N'BLR-TA', NULL,      N'meera.iyer@eiwams.local',      2900, N'Active', NULL),
 (2,  N'EMP0002', N'Hari',      N'Krishnan',     N'Permanent', N'HR',  N'BLR-TA', NULL,      N'hari.krishnan@eiwams.local',   3100, N'Active', NULL),
 (3,  N'EMP0004', N'Sanjay',    N'Kulkarni',     N'Permanent', N'SEC', N'BLR-TA', NULL,      N'sanjay.kulkarni@eiwams.local', 2600, N'Active', NULL),
 (4,  N'EMP0005', N'Farah',     N'Sheikh',       N'Permanent', N'FAC', N'BLR-TB', NULL,      N'farah.sheikh@eiwams.local',    2200, N'Active', NULL),
 (5,  N'EMP0006', N'Ravi',      N'Shankar',      N'Permanent', N'FAC', N'BLR-TA', N'EMP0005', N'ravi.shankar@eiwams.local',   1400, N'Active', NULL),
 (6,  N'EMP0007', N'Esha',      N'Patel',        N'Permanent', N'ENG', N'BLR-TA', N'EMP0003', N'esha.patel@eiwams.local',      700, N'Active', NULL),
 (7,  N'EMP0008', N'Arjun',     N'Mehta',        N'Permanent', N'FIN', N'BLR-TA', NULL,      N'arjun.mehta@eiwams.local',     1800, N'Active', NULL),
 (8,  N'EMP0009', N'Vikram',    N'Rao',          N'Permanent', N'ENG', N'BLR-TA', N'EMP0003', N'vikram.rao@eiwams.local',      1100, N'Active', NULL),
 (9,  N'EMP0010', N'Priya',     N'Nair',         N'Permanent', N'ENG', N'BLR-TB', N'EMP0003', N'priya.nair@eiwams.local',       900, N'Active', NULL),
 (10, N'EMP1001', N'Ananya',    N'Sharma',       N'Permanent', N'ENG', N'BLR-TA', N'EMP0003', NULL, 1300, N'Active', NULL),
 (11, N'EMP1002', N'Rohan',     N'Gupta',        N'Permanent', N'ENG', N'BLR-TA', N'EMP0003', NULL,   20, N'Active', NULL),
 (12, N'EMP1003', N'Kavya',     N'Reddy',        N'Permanent', N'RND', N'BLR-TA', N'EMP0003', NULL, 1000, N'Active', NULL),
 (13, N'EMP1004', N'Aditya',    N'Joshi',        N'Permanent', N'RND', N'BLR-TA', N'EMP0003', NULL,  850, N'Active', NULL),
 (14, N'EMP1005', N'Sneha',     N'Pillai',       N'Permanent', N'HR',  N'BLR-TA', N'EMP0002', NULL,  640, N'Active', NULL),
 (15, N'EMP1006', N'Karthik',   N'Subramanian',  N'Permanent', N'IT',  N'BLR-TB', N'EMP0003', NULL, 2000, N'Active', NULL),
 (16, N'EMP1007', N'Divya',     N'Menon',        N'Permanent', N'IT',  N'BLR-TB', N'EMP1006', NULL,  760, N'Active', NULL),
 (17, N'EMP1008', N'Rahul',     N'Verma',        N'Permanent', N'SEC', N'BLR-TA', N'EMP0004', NULL,  520, N'Active', NULL),
 (18, N'EMP1009', N'Pooja',     N'Desai',        N'Permanent', N'FIN', N'BLR-TA', N'EMP0008', NULL,  480, N'Active', NULL),
 (19, N'EMP1010', N'Nikhil',    N'Bhat',         N'Permanent', N'MFG', N'PUN-P1', NULL,      NULL, 2500, N'Active', NULL),
 (20, N'EMP1011', N'Lakshmi',   N'Narayanan',    N'Permanent', N'MFG', N'PUN-P1', N'EMP1010', NULL, 1200, N'Active', NULL),
 (21, N'EMP1012', N'Siddharth', N'Kapoor',       N'Permanent', N'MFG', N'PUN-P1', N'EMP1010', NULL,  950, N'Active', NULL),
 (22, N'EMP1013', N'Neha',      N'Agarwal',      N'Contract',  N'MFG', N'PUN-P1', N'EMP1010', NULL,  200, N'Active', NULL),
 (23, N'EMP1014', N'Amit',      N'Chauhan',      N'Permanent', N'FAC', N'PUN-P1', N'EMP0005', NULL, 1500, N'Active', NULL),
 (24, N'EMP1015', N'Deepika',   N'Rao',          N'Intern',    N'ENG', N'BLR-TA', N'EMP0003', NULL,   45, N'Active', NULL),
 (25, N'EMP1016', N'Manish',    N'Tiwari',       N'Vendor',    N'IT',  N'BLR-TB', N'EMP1006', NULL,  300, N'Active', NULL),
 (26, N'EMP1017', N'Shreya',    N'Ghosh',        N'Permanent', N'ENG', N'BLR-TA', N'EMP0003', NULL, 1600, N'Exited', 20),
 (27, N'EMP1018', N'Varun',     N'Malhotra',     N'Vendor',    N'FAC', N'BLR-TB', N'EMP0005', NULL,  150, N'Active', NULL),
 (28, N'EMP1019', N'Ishita',    N'Banerjee',     N'Permanent', N'FIN', N'BLR-TA', N'EMP0008', NULL,  990, N'Inactive', 5),
 (29, N'EMP1020', N'Gaurav',    N'Saxena',       N'Permanent', N'RND', N'BLR-TA', N'EMP0003', NULL, 1250, N'Active', NULL),
 (30, N'EMP0011', N'Sai',       N'Sharanya',      N'Permanent', N'ENG', N'BLR-TA', NULL, N'sai.sharanya@eiwams.local', 900, N'Active', NULL),
 (31, N'EMP0012', N'Isha',      N'Card Desk',     N'Permanent', N'HR',  N'BLR-TA', NULL, N'idcard.team@eiwams.local', 700, N'Active', NULL),
 (32, N'EMP0013', N'Arvind',    N'Access Control',N'Permanent', N'SEC', N'BLR-TA', NULL, N'access.control@eiwams.local', 800, N'Active', NULL),
 (33, N'EMP0014', N'Kiran',     N'Das',           N'Permanent', N'ENG', N'BLR-TA', N'EMP0011', N'kiran.das@eiwams.local', 350, N'Active', NULL),
 (34, N'EMP0015', N'Neha',      N'Joshi',         N'Permanent', N'ENG', N'BLR-TA', N'EMP0011', N'neha.joshi@eiwams.local', 250, N'Active', NULL);

SET @k = 1;
WHILE @k <= 34
BEGIN
    INSERT dbo.Employees (EmployeeNumber, FirstName, LastName, WorkEmail, EmployeeType, DepartmentId, ManagerEmployeeId, LocationId,
                          EmploymentStatus, JoinDate, EndDate, UserId, CreatedByUserId)
    SELECT s.EmployeeNumber, s.FirstName, s.LastName,
           COALESCE(s.UserEmail, LOWER(CONCAT(s.FirstName, N'.', s.LastName, N'@eiwams.local'))),
           s.EmployeeType, d.DepartmentId, m.EmployeeId, l.LocationId, s.EmploymentStatus,
           DATEADD(DAY, -s.JoinDaysAgo, CAST(SYSUTCDATETIME() AS DATE)),
           CASE WHEN s.EndDaysAgo IS NULL THEN NULL ELSE DATEADD(DAY, -s.EndDaysAgo, CAST(SYSUTCDATETIME() AS DATE)) END,
           u.UserId, 1
    FROM @E s
    JOIN dbo.Departments d ON d.DepartmentCode = s.DeptCode
    JOIN dbo.Locations l ON l.LocationCode = s.LocCode
    LEFT JOIN dbo.Employees m ON m.EmployeeNumber = s.ManagerNumber
    LEFT JOIN dbo.Users u ON u.Email = s.UserEmail
    WHERE s.SortKey = @k AND NOT EXISTS (SELECT 1 FROM dbo.Employees e WHERE e.EmployeeNumber = s.EmployeeNumber);
    SET @k += 1;
END

UPDATE e SET Designation = CASE e.EmployeeNumber
    WHEN N'EMP0011' THEN N'Engineering Manager'
    WHEN N'EMP0012' THEN N'ID Card Officer'
    WHEN N'EMP0013' THEN N'Access Control Officer'
    WHEN N'EMP0014' THEN N'Software Engineer'
    WHEN N'EMP0015' THEN N'QA Engineer'
    WHEN N'EMP0003' THEN N'Engineering Manager'
    WHEN N'EMP0002' THEN N'HR Administrator'
    WHEN N'EMP0004' THEN N'Security Officer'
    WHEN N'EMP0005' THEN N'Facilities Administrator'
    WHEN N'EMP0007' THEN N'Software Engineer'
    ELSE CONCAT(d.DepartmentName, N' Associate') END
FROM dbo.Employees e JOIN dbo.Departments d ON d.DepartmentId=e.DepartmentId
WHERE e.Designation IS NULL;

UPDATE dbo.Employees SET MobileNumber=N'+91 90000 00007', Address=N'Bengaluru', BloodGroup=N'O+',
    EmergencyContactName=N'Anita Patel', EmergencyContactNumber=N'+91 90000 00008'
WHERE EmployeeNumber=N'EMP0007' AND MobileNumber IS NULL;
UPDATE dbo.Employees SET MobileNumber=N'+91 90000 00111', Address=N'Bengaluru', BloodGroup=N'A+',
    EmergencyContactName=N'Kiran Sharanya', EmergencyContactNumber=N'+91 90000 00112'
WHERE EmployeeNumber=N'EMP0011' AND MobileNumber IS NULL;

UPDATE d SET HeadUserId = u.UserId
FROM dbo.Departments d
JOIN (VALUES (N'ENG', N'meera.iyer@eiwams.local'), (N'HR', N'hari.krishnan@eiwams.local'), (N'SEC', N'sanjay.kulkarni@eiwams.local'),
             (N'FAC', N'farah.sheikh@eiwams.local'), (N'FIN', N'arjun.mehta@eiwams.local')) h (Code, Email) ON h.Code = d.DepartmentCode
JOIN dbo.Users u ON u.Email = h.Email
WHERE d.HeadUserId IS NULL;

COMMIT;
GO

/* v2 demo workflow rows are seeded after Part 2. */

/*============================== PART 2 ==============================*/
IF EXISTS (SELECT 1 FROM dbo.RFIDCards WHERE CardUid = N'04A10000000007')
BEGIN
    PRINT N'Demo workflow data already present; skipping part 2.';
    RETURN;
END

BEGIN TRAN;

DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
DECLARE @Admin INT = (SELECT UserId FROM dbo.Users WHERE Email = N'admin@eiwams.local');
DECLARE @Hari INT = (SELECT UserId FROM dbo.Users WHERE Email = N'hari.krishnan@eiwams.local');
DECLARE @Meera INT = (SELECT UserId FROM dbo.Users WHERE Email = N'meera.iyer@eiwams.local');
DECLARE @Sanjay INT = (SELECT UserId FROM dbo.Users WHERE Email = N'sanjay.kulkarni@eiwams.local');
DECLARE @Farah INT = (SELECT UserId FROM dbo.Users WHERE Email = N'farah.sheikh@eiwams.local');
DECLARE @Ravi INT = (SELECT UserId FROM dbo.Users WHERE Email = N'ravi.shankar@eiwams.local');
DECLARE @Esha INT = (SELECT UserId FROM dbo.Users WHERE Email = N'esha.patel@eiwams.local');
DECLARE @Vikram INT = (SELECT UserId FROM dbo.Users WHERE Email = N'vikram.rao@eiwams.local');
DECLARE @Priya INT = (SELECT UserId FROM dbo.Users WHERE Email = N'priya.nair@eiwams.local');

/*--------------------------------- Cards ----------------------------*/
-- UID convention for demo cards: 04A1 + zero-padded employee number digits (e.g. Esha EMP0007 -> 04A10000000007).
INSERT dbo.RFIDCards (CardUid, EmployeeId, CardType, Status, IssuedAtUtc, ActivatedAtUtc, ExpiresAtUtc, ControllerSyncStatus, CreatedByUserId)
SELECT CONCAT(N'04A1', RIGHT(CONCAT(N'0000000000', SUBSTRING(e.EmployeeNumber, 4, 10)), 10)), e.EmployeeId,
       CASE WHEN e.EmployeeType = N'Intern' THEN N'Temporary' ELSE N'Permanent' END,
       CASE WHEN e.EmploymentStatus = N'Active' THEN N'Active' ELSE N'Deactivated' END,
       DATEADD(DAY, 1 - DATEDIFF(DAY, e.JoinDate, @Now), @Now), DATEADD(DAY, 1 - DATEDIFF(DAY, e.JoinDate, @Now), @Now),
       CASE WHEN e.EmployeeType = N'Intern' THEN DATEADD(DAY, 60, @Now) END,
       N'Synced', @Hari
FROM dbo.Employees e
WHERE e.EmployeeNumber LIKE N'EMP[01]%'
  AND e.EmployeeNumber NOT IN (N'EMP1002',N'EMP0014',N'EMP0015');

UPDATE dbo.RFIDCards SET Status = N'Blocked', BlockedAtUtc = DATEADD(DAY, -3, @Now), BlockReason = N'Card cloned - suspected tampering at shop floor kiosk'
WHERE CardUid = N'04A10000001012';

-- Karthik's previous (expired) card.
INSERT dbo.RFIDCards (CardUid, EmployeeId, CardType, Status, IssuedAtUtc, ActivatedAtUtc, ExpiresAtUtc, ControllerSyncStatus, CreatedByUserId)
SELECT N'04B2000000F006', EmployeeId, N'Temporary', N'Expired', DATEADD(DAY, -400, @Now), DATEADD(DAY, -400, @Now), DATEADD(DAY, -370, @Now), N'Synced', @Hari
FROM dbo.Employees WHERE EmployeeNumber = N'EMP1006';

/*---------------------- Direct permissions (historic) ---------------*/
INSERT dbo.AccessPermissions (EmployeeId, LocationId, ValidFromUtc, ValidToUtc, Status, ProvisionedByUserId, ProvisionedAtUtc,
                              RevokedByUserId, RevokedAtUtc, RevokeReason, ControllerSyncStatus)
SELECT e.EmployeeId, l.LocationId, DATEADD(DAY, -p.FromDays, @Now), DATEADD(DAY, p.ToDays, @Now), p.Status, @Farah, DATEADD(DAY, -p.FromDays, @Now),
       CASE WHEN p.Status = N'Revoked' THEN @Sanjay END, CASE WHEN p.Status = N'Revoked' THEN DATEADD(DAY, -4, @Now) END,
       CASE WHEN p.Status = N'Revoked' THEN N'Moved to a role without data-centre duties' END, N'Synced'
FROM (VALUES
    (N'EMP1001', N'BLR-TA-ODC1', 120, 245, N'Active'),
    (N'EMP1003', N'BLR-TA-RND',  200, 165, N'Active'),
    (N'EMP1004', N'BLR-TA-RND',  150, 215, N'Active'),
    (N'EMP1006', N'BLR-TB-DC',   300,  65, N'Active'),
    (N'EMP1007', N'BLR-TB-DC',   360,   5, N'Active'),
    (N'EMP1008', N'BLR-TB-DC',   100, 265, N'Revoked'),
    (N'EMP1010', N'PUN-P1-PROD', 330,  35, N'Active'),
    (N'EMP1010', N'PUN-P1-QC',   330,  35, N'Active'),
    (N'EMP1011', N'PUN-P1-PROD', 180, 185, N'Active'),
    (N'EMP1012', N'PUN-P1-PROD', 180, 185, N'Active'),
    (N'EMP1013', N'PUN-P1-QC',    60,   3, N'Active'),
    (N'EMP1016', N'BLR-TB-DC',    30,  60, N'Active'),
    (N'EMP1020', N'BLR-TA-RND',  365,  -2, N'Expired')
) p (EmployeeNumber, LocationCode, FromDays, ToDays, Status)
JOIN dbo.Employees e ON e.EmployeeNumber = p.EmployeeNumber
JOIN dbo.Locations l ON l.LocationCode = p.LocationCode;

/*------------------------ Access request workflows ------------------*/
DECLARE @Res TABLE (Id BIGINT);
DECLARE @Ar BIGINT, @V BINARY(8), @EmpId INT, @LocId INT, @BuildingLocId INT, @From DATETIME2(3), @To DATETIME2(3);
DECLARE @CreatedRequest TABLE (AccessRequestId BIGINT);

-- R1: Esha -> ODC 1, fully approved and provisioned.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0007';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-ODC1';
SET @From = @Now; SET @To = DATEADD(DAY, 180, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Esha,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Assigned to the Northwind banking ODC programme; daily on-site delivery.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Meera, @Ar, N'Approve', N'Confirmed project allocation.', @V;
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Sanjay, @Ar, N'Approve', N'Security induction completed.', @V;
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Farah, @Ar, N'Approve', NULL, @V;
EXEC dbo.usp_Permission_Provision @Farah, @Ar;

-- R2: Vikram -> Data Centre, approved but not yet provisioned.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0009';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TB-DC';
SET @From = DATEADD(DAY, 1, @Now); SET @To = DATEADD(DAY, 90, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Vikram,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'On-call rotation for storage cluster migration.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Meera, @Ar, N'Approve', NULL, @V;
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Sanjay, @Ar, N'Approve', N'Escort not required after induction.', @V;
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Farah, @Ar, N'Approve', NULL, @V;

-- R3: Priya -> ODC 2, waiting for Security.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0010';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-ODC2';
SET @From = @Now; SET @To = DATEADD(DAY, 120, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Priya,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Joining the Contoso insurance ODC as test lead.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Meera, @Ar, N'Approve', NULL, @V;

-- R4: Vikram -> R&D Lab, waiting for the manager.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0009';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-RND';
SET @From = DATEADD(DAY, 2, @Now); SET @To = DATEADD(DAY, 60, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Vikram,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Prototype hardware validation with the R&D team.',@ValidFromUtc=@From,@ValidToUtc=@To;

-- R5: Esha -> Data Centre, still a draft.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0007';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TB-DC';
SET @From = DATEADD(DAY, 7, @Now); SET @To = DATEADD(DAY, 37, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Esha,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Rack-and-stack support for the Q3 hardware refresh.',@ValidFromUtc=@From,@ValidToUtc=@To;

-- R6: Priya -> Data Centre, returned by the manager.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0010';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TB-DC';
SET @From = DATEADD(DAY, 1, @Now); SET @To = DATEADD(DAY, 200, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Priya,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Occasional troubleshooting.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Meera, @Ar, N'Return', N'Please narrow the window to the planned maintenance dates and name the change ticket.', @V;

-- R7: Vikram -> Pune production line, rejected.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0009';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'PUN-P1-PROD';
SET @From = DATEADD(DAY, 3, @Now); SET @To = DATEADD(DAY, 10, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Vikram,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Plant visit for MES integration.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_Approval_Decide @Meera, @Ar, N'Reject', N'Remote access to the MES sandbox is sufficient; no production floor access needed.', @V;

-- R8: Priya -> R&D Lab, cancelled by the requester.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP0010';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-RND';
SET @From = DATEADD(DAY, 5, @Now); SET @To = DATEADD(DAY, 20, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Priya,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'Demo day support.',@ValidFromUtc=@From,@ValidToUtc=@To;
SET @Ar = (SELECT MAX(AccessRequestId) FROM dbo.AccessRequests WHERE EmployeeId = @EmpId AND LocationId = @LocId);
SET @V = (SELECT Version FROM dbo.AccessRequests WHERE AccessRequestId = @Ar);
EXEC dbo.usp_AccessRequest_Cancel @Priya, @Ar, N'Demo day moved to the Pune campus.', @V;

-- R9: Ananya -> ODC 2, Expired historic request (window passed before it was decided).
DECLARE @Seq INT = NEXT VALUE FOR dbo.seq_AccessRequestNumber;
INSERT dbo.AccessRequests (RequestNumber, EmployeeId, LocationId, RequesterUserId, BusinessJustification, ValidFromUtc, ValidToUtc, Status,
                           SubmittedAtUtc, DecidedAtUtc, CreatedAtUtc, AccessType, BuildingLocationId, DurationCode)
SELECT CONCAT(N'EAW-', YEAR(@Now), N'-', RIGHT(CONCAT(N'000000', @Seq), 6)), e.EmployeeId, l.LocationId, @Meera,
       N'Short-term support for the ODC 2 go-live weekend.', DATEADD(DAY, -40, @Now), DATEADD(DAY, -33, @Now), N'Expired',
       DATEADD(DAY, -42, @Now), DATEADD(DAY, -33, @Now), DATEADD(DAY, -42, @Now), N'WingFloor', b.LocationId, N'OneWeek'
FROM dbo.Employees e CROSS JOIN dbo.Locations l
JOIN dbo.Locations b ON b.LocationCode=N'BLR-TA'
WHERE e.EmployeeNumber = N'EMP1001' AND l.LocationCode = N'BLR-TA-ODC2';

-- R10: Rohan (new joiner) -> ODC 1, raised by HR on his behalf; waits for Meera at the manager stage.
SELECT @EmpId = EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP1002';
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-ODC1';
SET @From = @Now; SET @To = DATEADD(DAY, 180, @Now);
SELECT TOP(1) @BuildingLocId=l.LocationId FROM dbo.fn_LocationAncestors(@LocId) a JOIN dbo.Locations l ON l.LocationId=a.LocationId WHERE l.LocationType=N'Building';
EXEC dbo.usp_AccessRequest_Create @ActorUserId=@Hari,@EmployeeId=@EmpId,@AccessType=N'WingFloor',@BuildingLocationId=@BuildingLocId,
    @LocationId=@LocId,@DurationCode=N'Custom',@BusinessJustification=N'New joiner onboarding to the Northwind banking ODC.',@ValidFromUtc=@From,@ValidToUtc=@To;

/* Card requests are seeded in the v2 run-once block below. */
DECLARE @CardId BIGINT;
-- Aditya: legacy report-lost endpoint blocks immediately; the v2 request is raised separately.
SELECT @CardId = CardId FROM dbo.RFIDCards WHERE CardUid = N'04A10000001004';
EXEC dbo.usp_Card_ReportLost @Sanjay, @CardId, N'Employee reported wallet stolen during commute.';

/*-------------------------------- Blacklist --------------------------*/
DECLARE @SubjectId BIGINT = (SELECT EmployeeId FROM dbo.Employees WHERE EmployeeNumber = N'EMP1018');
DECLARE @Review DATE = DATEADD(DAY, 90, CAST(@Now AS DATE));
EXEC dbo.usp_Blacklist_Create @Sanjay, N'Employee', @SubjectId, N'Vendor contract terminated for policy violation; pending legal review.', @Review;

/*-------------------------------- RFID events ------------------------*/
DECLARE @Ev TABLE (Seq INT IDENTITY PRIMARY KEY, ReaderId NVARCHAR(50), CardUid NVARCHAR(64), EventType NVARCHAR(10), EventAtUtc DATETIME2(3));

-- Daily lobby/gate traffic for the last 7 days (entry ~09:00 IST, exit ~18:00 IST; skipped if still in the future).
INSERT @Ev (ReaderId, CardUid, EventType, EventAtUtc)
SELECT x.ReaderId, c.CardUid, x.EventType, x.At
FROM dbo.RFIDCards c
JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId
JOIN dbo.Locations l ON l.LocationId = e.LocationId
CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5), (6)) d (DaysAgo)
CROSS APPLY (VALUES
    (CASE WHEN l.LocationCode LIKE N'PUN%' THEN N'RDR-PUN-GATE-01' ELSE N'RDR-BLR-LOBBY-IN' END, N'Entry',
     DATEADD(MINUTE, (e.EmployeeId * 7) % 50, DATEADD(HOUR, 3, DATEADD(MINUTE, 30, CAST(CAST(DATEADD(DAY, -d.DaysAgo, @Now) AS DATE) AS DATETIME2(3)))))),
    (CASE WHEN l.LocationCode LIKE N'PUN%' THEN N'RDR-PUN-GATE-01' ELSE N'RDR-BLR-LOBBY-OUT' END, N'Exit',
     DATEADD(MINUTE, (e.EmployeeId * 11) % 70, DATEADD(HOUR, 12, DATEADD(MINUTE, 30, CAST(CAST(DATEADD(DAY, -d.DaysAgo, @Now) AS DATE) AS DATETIME2(3))))))
) x (ReaderId, EventType, At)
WHERE c.Status = N'Active' AND e.EmploymentStatus = N'Active' AND x.At < DATEADD(MINUTE, -5, @Now)
  AND e.EmployeeNumber NOT IN (N'EMP1018')
ORDER BY x.At;

-- Granted zone entries for permitted employees.
INSERT @Ev (ReaderId, CardUid, EventType, EventAtUtc)
SELECT r.ReaderId, c.CardUid, N'Entry', t.At
FROM dbo.AccessPermissions p
JOIN dbo.Employees e ON e.EmployeeId = p.EmployeeId
JOIN dbo.RFIDCards c ON c.EmployeeId = e.EmployeeId AND c.Status = N'Active'
JOIN dbo.Readers r ON r.LocationId = p.LocationId
CROSS JOIN (VALUES (0), (1), (2), (4)) d (DaysAgo)
CROSS APPLY (SELECT DATEADD(MINUTE, 45 + (e.EmployeeId * 3) % 30, DATEADD(HOUR, 3, DATEADD(MINUTE, 30, CAST(CAST(DATEADD(DAY, -d.DaysAgo, @Now) AS DATE) AS DATETIME2(3))))) AS At) t
WHERE p.Status = N'Active' AND p.ValidFromUtc <= t.At AND t.At < DATEADD(MINUTE, -5, @Now);

-- Cafeteria (unrestricted) lunch traffic today and yesterday for Tower B staff.
INSERT @Ev (ReaderId, CardUid, EventType, EventAtUtc)
SELECT N'RDR-BLR-CAF-01', c.CardUid, N'Entry', DATEADD(MINUTE, -(90 + e.EmployeeId * 13 % 120) - d.DaysAgo * 1440, @Now)
FROM dbo.RFIDCards c JOIN dbo.Employees e ON e.EmployeeId = c.EmployeeId
CROSS JOIN (VALUES (0), (1)) d (DaysAgo)
WHERE c.Status = N'Active' AND e.EmploymentStatus = N'Active' AND e.EmployeeNumber IN (N'EMP0005', N'EMP0010', N'EMP1006', N'EMP1007', N'EMP1016');

-- Denied / anomalous events (recent).
INSERT @Ev (ReaderId, CardUid, EventType, EventAtUtc) VALUES
 (N'RDR-BLR-DC-01',     N'04A10000000009', N'Entry', DATEADD(MINUTE, -240, @Now)),  -- Vikram: no permission yet
 (N'RDR-BLR-DC-01',     N'04A10000000009', N'Entry', DATEADD(MINUTE, -237, @Now)),
 (N'RDR-BLR-DC-01',     N'04A10000000009', N'Entry', DATEADD(MINUTE, -234, @Now)),  -- third denial -> RepeatedDenied
 (N'RDR-BLR-LOBBY-IN',  N'04A10000001004', N'Entry', DATEADD(MINUTE, -180, @Now)),  -- Aditya: card reported lost
 (N'RDR-PUN-PROD-01',   N'04A10000001012', N'Entry', DATEADD(MINUTE, -150, @Now)),  -- Siddharth: blocked card
 (N'RDR-BLR-RND-01',    N'04A10000001020', N'Entry', DATEADD(MINUTE, -120, @Now)),  -- Gaurav: permission expired
 (N'RDR-BLR-ODC2-01',   N'FFEE0011223344', N'Entry', DATEADD(MINUTE, -95,  @Now)),  -- unknown card
 (N'RDR-BLR-LOBBY-IN',  N'04A10000001018', N'Entry', DATEADD(MINUTE, -75,  @Now)),  -- Varun: blacklisted
 (N'RDR-BLR-LOBBY-IN',  N'04A10000001017', N'Entry', DATEADD(MINUTE, -60,  @Now)),  -- Shreya: exited, card deactivated
 (N'RDR-BLR-ODC2-01',   N'04A10000000007', N'Entry', DATEADD(MINUTE, -30,  @Now));  -- Esha: ODC 2 not permitted

DECLARE @n INT = 1, @Max INT = (SELECT MAX(Seq) FROM @Ev), @Reader NVARCHAR(50), @Uid NVARCHAR(64), @Type NVARCHAR(10), @At DATETIME2(3), @ExtId NVARCHAR(100);
DECLARE @Sink TABLE (AccessLogId BIGINT, ProcessingStatus NVARCHAR(20), Decision NVARCHAR(10), DenialReason NVARCHAR(40), ViolationId BIGINT, IsDuplicate BIT);
WHILE @n <= @Max
BEGIN
    SELECT @Reader = ReaderId, @Uid = CardUid, @Type = EventType, @At = EventAtUtc FROM @Ev WHERE Seq = @n;
    SET @ExtId = CONCAT(N'DEMO-', FORMAT(@At, N'yyyyMMddHHmmssfff'), N'-', @n);
    INSERT @Sink EXEC dbo.usp_RfidEvent_Ingest @Admin, @Reader, @ExtId, @Uid, @Type, @At;
    SET @n += 1;
END

/*--------------------------- Violations & incidents ------------------*/
DECLARE @Vid BIGINT, @Inc INT;
SELECT @Vid = MIN(v.ViolationId) FROM dbo.AccessViolations v JOIN dbo.AccessLogs l ON l.AccessLogId = v.AccessLogId
WHERE l.MaskedCardUid = N'****0009' AND v.ViolationType = N'UnauthorizedZone';
EXEC dbo.usp_Violation_Review @Sanjay, @Vid, N'Confirmed', N'CCTV confirms repeated attempts at the data-centre mantrap without approval.', 1;

SELECT @Vid = MIN(v.ViolationId) FROM dbo.AccessViolations v WHERE v.ViolationType = N'EventAnomaly';
EXEC dbo.usp_Violation_Review @Sanjay, @Vid, N'FalsePositive', N'Test card used by the reader vendor during maintenance.', 0;

SELECT @Vid = MIN(v.ViolationId) FROM dbo.AccessViolations v WHERE v.ViolationType = N'BlockedCard' AND v.Severity = N'High';
EXEC dbo.usp_Violation_Review @Sanjay, @Vid, N'UnderReview', N'Checking lobby CCTV for the lost-card swipe.', 0;

SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-LOBBY';
EXEC dbo.usp_Incident_Create @Sanjay, N'Tailgating at Tower A lobby turnstile',
     N'Two unbadged individuals followed an employee through the In turnstile at 09:12. Guards intercepted one person.',
     N'Tailgating', N'Medium', NULL, @LocId, @Sanjay;
SET @Inc = (SELECT MAX(IncidentId) FROM dbo.SecurityIncidents);
SET @V = (SELECT Version FROM dbo.SecurityIncidents WHERE IncidentId = @Inc);
EXEC dbo.usp_Incident_Update @Sanjay, @Inc, N'UnderReview', NULL, NULL, N'Requested CCTV export from the facility vendor.', @V;

SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TB-DC';
EXEC dbo.usp_Incident_Create @Sanjay, N'Data centre CRAC unit door alarm fault',
     N'Door contact sensor on the data-centre mantrap reported repeated open states with no badge events.',
     N'EquipmentFault', N'Low', NULL, @LocId, NULL;
SET @Inc = (SELECT MAX(IncidentId) FROM dbo.SecurityIncidents);
SET @V = (SELECT Version FROM dbo.SecurityIncidents WHERE IncidentId = @Inc);
EXEC dbo.usp_Incident_Update @Sanjay, @Inc, N'Confirmed', NULL, NULL, N'Sensor misaligned after rack move.', @V;
SET @V = (SELECT Version FROM dbo.SecurityIncidents WHERE IncidentId = @Inc);
EXEC dbo.usp_Incident_Update @Sanjay, @Inc, N'Closed', NULL, N'Facility vendor realigned the door contact; alarms cleared.', NULL, @V;

/*-------------------------------- Visitors ---------------------------*/
DECLARE @Vis INT, @Pass BIGINT;
SELECT @LocId = LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-VIS';

EXEC dbo.usp_Visitor_Create @Ravi, N'Rajesh Khanna', N'Northwind Traders', N'+91 98450 00001', N'Quarterly vendor governance review', @Meera;
SET @Vis = (SELECT MAX(VisitorId) FROM dbo.Visitors);
SET @From = DATEADD(HOUR, -2, @Now); SET @To = DATEADD(HOUR, 6, @Now);
EXEC dbo.usp_VisitorPass_Create @Ravi, @Vis, @LocId, @From, @To, @Meera;
SET @Pass = (SELECT MAX(VisitorPassId) FROM dbo.VisitorPasses);
EXEC dbo.usp_VisitorPass_Transition @Farah, @Pass, N'Approve', N'Escort by sponsor.';
EXEC dbo.usp_VisitorPass_Transition @Ravi, @Pass, N'CheckIn', NULL;

EXEC dbo.usp_Visitor_Create @Ravi, N'Anjali Deshmukh', N'Contoso Consulting', N'+91 98450 00002', N'Audit walkthrough of physical security controls', @Sanjay;
SET @Vis = (SELECT MAX(VisitorId) FROM dbo.Visitors);
SET @From = DATEADD(HOUR, -5, @Now); SET @To = DATEADD(HOUR, 2, @Now);
EXEC dbo.usp_VisitorPass_Create @Ravi, @Vis, @LocId, @From, @To, @Sanjay;
SET @Pass = (SELECT MAX(VisitorPassId) FROM dbo.VisitorPasses);
EXEC dbo.usp_VisitorPass_Transition @Farah, @Pass, N'Approve', NULL;
EXEC dbo.usp_VisitorPass_Transition @Ravi, @Pass, N'CheckIn', NULL;
EXEC dbo.usp_VisitorPass_Transition @Ravi, @Pass, N'CheckOut', NULL;

EXEC dbo.usp_Visitor_Create @Ravi, N'Mohammed Irfan', N'Fabrikam Networks', N'+91 98450 00003', N'Network switch replacement in Tower A', @Farah;
SET @Vis = (SELECT MAX(VisitorId) FROM dbo.Visitors);
SET @From = DATEADD(HOUR, 1, @Now); SET @To = DATEADD(HOUR, 9, @Now);
EXEC dbo.usp_VisitorPass_Create @Ravi, @Vis, @LocId, @From, @To, @Farah;

EXEC dbo.usp_Visitor_Create @Ravi, N'Sunita Kulkarni', N'Adatum Recruitment', N'+91 98450 00004', N'Campus hiring panel', @Hari;
SET @Vis = (SELECT MAX(VisitorId) FROM dbo.Visitors);
SET @From = DATEADD(HOUR, 20, @Now); SET @To = DATEADD(HOUR, 28, @Now);
EXEC dbo.usp_VisitorPass_Create @Ravi, @Vis, @LocId, @From, @To, @Hari;
SET @Pass = (SELECT MAX(VisitorPassId) FROM dbo.VisitorPasses);
EXEC dbo.usp_VisitorPass_Transition @Farah, @Pass, N'Approve', NULL;

EXEC dbo.usp_Visitor_Create @Ravi, N'Tarun Mehra', NULL, N'+91 98450 00005', N'Unscheduled delivery', @Farah;
SET @Vis = (SELECT MAX(VisitorId) FROM dbo.Visitors);
SET @From = DATEADD(HOUR, -1, @Now); SET @To = DATEADD(HOUR, 3, @Now);
EXEC dbo.usp_VisitorPass_Create @Ravi, @Vis, @LocId, @From, @To, @Farah;
SET @Pass = (SELECT MAX(VisitorPassId) FROM dbo.VisitorPasses);
EXEC dbo.usp_VisitorPass_Transition @Ravi, @Pass, N'Revoke', N'Visitor could not produce valid photo ID.';
SET @SubjectId = @Vis;
EXEC dbo.usp_Blacklist_Create @Sanjay, N'Visitor', @SubjectId, N'Attempted entry with forged identification.', NULL;

COMMIT;
GO

/* Idempotent v2 workflow sample: a new card request waits at manager review. */
IF NOT EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey=N'Demo.V2Seeded')
BEGIN
    DECLARE @V2User INT=(SELECT UserId FROM dbo.Users WHERE Email=N'kiran.das@eiwams.local'),
            @V2EmployeeId INT=(SELECT EmployeeId FROM dbo.Employees WHERE EmployeeNumber=N'EMP0014'),
            @V2PhotoBytes VARBINARY(MAX)=0xFFD8FF;
    EXEC dbo.usp_CardRequest_Create @ActorUserId=@V2User,@EmployeeId=@V2EmployeeId,@RequestType=N'New',@Reason=NULL,
         @MobileNumber=N'+91 90000 00114',@Address=N'Bengaluru',@BloodGroup=N'O+',
         @EmergencyContactName=N'Demo Contact',@EmergencyContactNumber=N'+91 90000 00115',
         @PhotoContentType=N'image/jpeg',@Photo=@V2PhotoBytes;
    INSERT dbo.SystemSettings(SettingKey,SettingValue,Description,DataType,UpdatedAtUtc,UpdatedByUserId)
    VALUES(N'Demo.V2Seeded',N'true',N'V2 card request demo workflow seeded',N'Bool',SYSUTCDATETIME(),@V2User);
END
GO
