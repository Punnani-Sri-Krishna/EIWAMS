/*=====================================================================
  EIWAMS - 11_SeedData.sql
  Reference seed: permissions, roles, role grants, menus, settings and
  the bootstrap System Administrator (user 1). Idempotent: catalogue rows
  are merged; role grants are only added (admin edits are preserved),
  except SystemAdmin which always holds every permission.
  Wave 3 (simplification): the RFID, violations, incidents, blacklist,
  visitors, reports, readers and settings modules are removed (their
  permissions, grants and menus are deleted/deactivated) and the roles
  Reception, Auditor and FacilityAdmin are retired (their users are moved
  to Employee / AccessControlTeam). Every user is an employee.
=====================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRAN;
/*------------------------------ Permissions -------------------------*/
DECLARE @Perm TABLE (PermissionCode NVARCHAR(100) PRIMARY KEY, ModuleName NVARCHAR(50), Description NVARCHAR(300));
INSERT @Perm VALUES
 (N'Dashboard.View',        N'Dashboard',   N'View the home dashboard and personal work queue'),
 (N'Employees.View',        N'Employees',   N'View own and direct-report employee records'),
 (N'Employees.ViewAll',     N'Employees',   N'View all employee records within facility scope'),
 (N'Employees.Manage',      N'Employees',   N'Create and update employee identity records'),
 (N'Employees.Transfer',    N'Employees',   N'Transfer employees between departments, managers and locations'),
 (N'Employees.Deactivate',  N'Employees',   N'Deactivate or exit employees (revokes cards and permissions)'),
 (N'Employees.Sync',        N'Employees',   N'Synchronize employee records from HR systems'),
 (N'Cards.View',            N'Cards',       N'View own ID cards and card requests'),
 (N'Cards.ViewAll',         N'Cards',       N'View all ID cards within facility scope'),
 (N'Cards.Request',         N'Cards',       N'Raise card requests and report own cards lost'),
 (N'Cards.Verify',          N'Cards',       N'Verify, approve or reject card requests'),
 (N'Cards.ManagerApprove',  N'Cards',       N'Approve card requests raised by direct reports'),
 (N'Cards.HrVerify',        N'Cards',       N'Verify employee details for card requests'),
 (N'Cards.SecurityReview',  N'Cards',       N'Review lost card requests'),
 (N'Cards.Process',         N'Cards',       N'Approve, print and issue ID cards'),
 (N'Cards.Issue',           N'Cards',       N'Issue, activate and replace ID cards'),
 (N'Cards.Block',           N'Cards',       N'Block or deactivate ID cards'),
 (N'AccessRequests.View',   N'Access',      N'View own and related access requests'),
 (N'AccessRequests.ViewAll',N'Access',      N'View all access requests within facility scope'),
 (N'AccessRequests.Create', N'Access',      N'Create, edit, submit and cancel access requests'),
 (N'Approvals.Decide',      N'Access',      N'Approve, return or reject assigned access requests'),
 (N'Approvals.Team',        N'Access',      N'View requests raised by direct reports'),
 (N'Permissions.View',      N'Permissions', N'View access permissions'),
 (N'Permissions.Provision', N'Permissions', N'Provision approved access requests'),
 (N'Permissions.Revoke',    N'Permissions', N'Revoke access permissions'),
 (N'Audit.View',            N'Admin',       N'View the audit trail (API)'),
 (N'Users.Manage',          N'Admin',       N'Manage employees'' roles, account status and facility scopes'),
 (N'Roles.Manage',          N'Admin',       N'Manage role permissions'),
 (N'Reference.Manage',      N'Admin',       N'Manage departments and locations');

MERGE dbo.Permissions AS t
USING @Perm AS s ON t.PermissionCode = s.PermissionCode
WHEN MATCHED AND (t.ModuleName <> s.ModuleName OR ISNULL(t.Description, N'') <> s.Description)
    THEN UPDATE SET ModuleName = s.ModuleName, Description = s.Description
WHEN NOT MATCHED BY TARGET THEN INSERT (PermissionCode, ModuleName, Description) VALUES (s.PermissionCode, s.ModuleName, s.Description);

-- Removed modules (wave 3): delete their permissions with grants and menu links.
DECLARE @Removed TABLE (PermissionCode NVARCHAR(100) PRIMARY KEY);
INSERT @Removed VALUES (N'Rfid.View'), (N'Rfid.Ingest'), (N'Violations.View'), (N'Violations.Review'), (N'Incidents.View'), (N'Incidents.Manage'),
 (N'Blacklist.View'), (N'Blacklist.Manage'), (N'Visitors.View'), (N'Visitors.Manage'), (N'Visitors.Approve'), (N'Reports.View'),
 (N'Reports.Export'), (N'Settings.Manage');
DELETE mp FROM dbo.MenuPermissions mp JOIN dbo.Permissions p ON p.PermissionId = mp.PermissionId JOIN @Removed x ON x.PermissionCode = p.PermissionCode;
DELETE rp FROM dbo.RolePermissions rp JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId JOIN @Removed x ON x.PermissionCode = p.PermissionCode;
DELETE p FROM dbo.Permissions p JOIN @Removed x ON x.PermissionCode = p.PermissionCode;

/*--------------------------------- Roles ----------------------------*/
-- Simplified roles. Labels shown in the UI: Employee, Manager, HR, Security, System Admin, Security Head, ID Card Team, Access Control.
DECLARE @Role TABLE (SortKey INT PRIMARY KEY, RoleName NVARCHAR(50), Description NVARCHAR(300));
INSERT @Role VALUES
 (1, N'Employee',          N'Employee (every signed-in person): own profile, ID card and access requests'),
 (2, N'Manager',           N'Manager: approves requests raised by direct reports'),
 (3, N'HRAdmin',           N'HR: employee records and ID card request verification'),
 (4, N'SecurityTeam',      N'Security: lost-card review, card blocking and access approvals'),
 (5, N'SystemAdmin',       N'System Admin: employees & roles, locations and departments'),
 (6, N'SecurityHead',      N'Security Head: approves building access and security-sensitive card requests'),
 (7, N'IdCardTeam',        N'ID Card Team: processes, prints and issues ID cards'),
 (8, N'AccessControlTeam', N'Access Control: reviews and provisions workplace access');

DECLARE @k INT = 1;
WHILE @k <= 8
BEGIN
    DECLARE @rn NVARCHAR(50), @rd NVARCHAR(300);
    SELECT @rn = RoleName, @rd = Description FROM @Role WHERE SortKey = @k;
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = @rn)
        INSERT dbo.Roles (RoleName, Description, IsSystem) VALUES (@rn, @rd, 1);
    ELSE
        UPDATE dbo.Roles SET Description = @rd, IsSystem = 1 WHERE RoleName = @rn AND (Description <> @rd OR IsSystem = 0);
    SET @k += 1;
END

-- Retire Reception, Auditor and FacilityAdmin: FacilityAdmin users become AccessControlTeam, every member keeps Employee.
INSERT dbo.UserRoles (UserId, RoleId)
SELECT DISTINCT ur.UserId, t.RoleId
FROM dbo.UserRoles ur JOIN dbo.Roles o ON o.RoleId = ur.RoleId
JOIN dbo.Roles t ON t.RoleName = N'AccessControlTeam'
WHERE o.RoleName = N'FacilityAdmin'
  AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles x WHERE x.UserId = ur.UserId AND x.RoleId = t.RoleId);
INSERT dbo.UserRoles (UserId, RoleId)
SELECT DISTINCT ur.UserId, t.RoleId
FROM dbo.UserRoles ur JOIN dbo.Roles o ON o.RoleId = ur.RoleId
JOIN dbo.Roles t ON t.RoleName = N'Employee'
WHERE o.RoleName IN (N'FacilityAdmin', N'Reception', N'Auditor')
  AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles x WHERE x.UserId = ur.UserId AND x.RoleId = t.RoleId);
DELETE ur FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE r.RoleName IN (N'FacilityAdmin', N'Reception', N'Auditor');
DELETE rp FROM dbo.RolePermissions rp JOIN dbo.Roles r ON r.RoleId = rp.RoleId WHERE r.RoleName IN (N'FacilityAdmin', N'Reception', N'Auditor');
DELETE dbo.Roles WHERE RoleName IN (N'FacilityAdmin', N'Reception', N'Auditor');

/*------------------------------ Role grants -------------------------*/
DECLARE @Grant TABLE (RoleName NVARCHAR(50), PermissionCode NVARCHAR(100), PRIMARY KEY (RoleName, PermissionCode));
DECLARE @Base TABLE (PermissionCode NVARCHAR(100) PRIMARY KEY);
INSERT @Base VALUES (N'Dashboard.View'), (N'Employees.View'), (N'Cards.View'), (N'Cards.Request'), (N'AccessRequests.View'), (N'AccessRequests.Create');

INSERT @Grant SELECT r.RoleName, b.PermissionCode FROM @Base b
CROSS JOIN (VALUES (N'Employee'), (N'Manager'), (N'HRAdmin'), (N'SecurityTeam'), (N'SecurityHead'), (N'IdCardTeam'), (N'AccessControlTeam')) r (RoleName);
INSERT @Grant VALUES
 (N'Manager', N'Approvals.Decide'), (N'Manager', N'Permissions.View'), (N'Manager', N'Approvals.Team'), (N'Manager', N'Cards.ManagerApprove'),
 (N'HRAdmin', N'Employees.ViewAll'), (N'HRAdmin', N'Employees.Manage'), (N'HRAdmin', N'Employees.Transfer'), (N'HRAdmin', N'Employees.Deactivate'),
 (N'HRAdmin', N'Employees.Sync'), (N'HRAdmin', N'Cards.ViewAll'), (N'HRAdmin', N'Cards.Issue'), (N'HRAdmin', N'Cards.HrVerify'),
 (N'SecurityTeam', N'Cards.ViewAll'), (N'SecurityTeam', N'Cards.Verify'), (N'SecurityTeam', N'Cards.Block'), (N'SecurityTeam', N'Cards.Issue'),
 (N'SecurityTeam', N'Cards.SecurityReview'), (N'SecurityTeam', N'Approvals.Decide'), (N'SecurityTeam', N'Permissions.View'),
 (N'SecurityTeam', N'Permissions.Revoke'), (N'SecurityTeam', N'Audit.View'),
 (N'SecurityHead', N'Approvals.Decide'), (N'SecurityHead', N'Cards.SecurityReview'),
 (N'IdCardTeam', N'Cards.Process'), (N'IdCardTeam', N'Cards.ViewAll'),
 (N'AccessControlTeam', N'AccessRequests.ViewAll'), (N'AccessControlTeam', N'Approvals.Decide'), (N'AccessControlTeam', N'Permissions.View'),
 (N'AccessControlTeam', N'Permissions.Provision'), (N'AccessControlTeam', N'Permissions.Revoke');
INSERT @Grant SELECT N'SystemAdmin', PermissionCode FROM @Perm;

INSERT dbo.RolePermissions (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM @Grant g
JOIN dbo.Roles r ON r.RoleName = g.RoleName
JOIN dbo.Permissions p ON p.PermissionCode = g.PermissionCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId);

/*--------------------------------- Menus ----------------------------*/
-- Only the simplified navigation is active; every menu row not listed here is deactivated.
DECLARE @Menu TABLE (MenuCode NVARCHAR(50) PRIMARY KEY, Section NVARCHAR(50), SectionOrder INT, Label NVARCHAR(100), Icon NVARCHAR(50),
                     Route NVARCHAR(200), SortOrder INT, Perms NVARCHAR(400));
INSERT @Menu VALUES
 (N'DASHBOARD',         N'Home',      1, N'Home',                N'home',                 N'/dashboard',         1, N'Dashboard.View'),
 (N'CARDS',             N'Requests',  2, N'ID card requests',    N'badge',                N'/cards',             1, N'Cards.View,Cards.ViewAll'),
 (N'ACCESS_REQUESTS',   N'Requests',  2, N'Access requests',     N'key',                  N'/access-requests',   2, N'AccessRequests.View'),
 (N'APPROVALS',         N'Approvals', 3, N'Approvals',           N'task_alt',             N'/approvals',         1, N'Approvals.Decide,Approvals.Team,Cards.ManagerApprove,Cards.HrVerify,Cards.SecurityReview'),
 (N'ID_CARD_PROCESSING',N'Approvals', 3, N'ID Card Processing',  N'print',                N'/approvals/id-card', 2, N'Cards.Process'),
 (N'PERMISSIONS',       N'Approvals', 3, N'Access Provisioning', N'verified_user',        N'/permissions',       3, N'Permissions.Provision'),
 (N'EMPLOYEES',         N'People',    4, N'Employees',           N'groups',               N'/employees',         1, N'Employees.ViewAll'),
 (N'ADMIN_USERS',       N'Admin',     5, N'Employees & roles',   N'manage_accounts',      N'/admin/employees',   1, N'Users.Manage'),
 (N'ADMIN_LOCATIONS',   N'Admin',     5, N'Locations',           N'location_city',        N'/admin/locations',   2, N'Reference.Manage'),
 (N'ADMIN_DEPARTMENTS', N'Admin',     5, N'Departments',         N'apartment',            N'/admin/departments', 3, N'Reference.Manage');

MERGE dbo.Menus AS t
USING @Menu AS s ON t.MenuCode = s.MenuCode
WHEN MATCHED THEN UPDATE SET Section = s.Section, SectionOrder = s.SectionOrder, Label = s.Label, Icon = s.Icon, Route = s.Route,
                             SortOrder = s.SortOrder, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN INSERT (MenuCode, Section, SectionOrder, Label, Icon, Route, SortOrder, IsActive)
    VALUES (s.MenuCode, s.Section, s.SectionOrder, s.Label, s.Icon, s.Route, s.SortOrder, 1)
WHEN NOT MATCHED BY SOURCE AND t.IsActive = 1 THEN UPDATE SET IsActive = 0;

DELETE mp FROM dbo.MenuPermissions mp
JOIN dbo.Menus m ON m.MenuId = mp.MenuId
JOIN @Menu s ON s.MenuCode = m.MenuCode
JOIN dbo.Permissions p ON p.PermissionId = mp.PermissionId
WHERE NOT EXISTS (SELECT 1 FROM STRING_SPLIT(s.Perms, N',') x WHERE x.value = p.PermissionCode);

INSERT dbo.MenuPermissions (MenuId, PermissionId)
SELECT m.MenuId, p.PermissionId
FROM @Menu s
CROSS APPLY STRING_SPLIT(s.Perms, N',') x
JOIN dbo.Menus m ON m.MenuCode = s.MenuCode
JOIN dbo.Permissions p ON p.PermissionCode = x.value
WHERE NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions mp WHERE mp.MenuId = m.MenuId AND mp.PermissionId = p.PermissionId);
/*------------------------------- Settings ---------------------------*/
DECLARE @Set TABLE (SettingKey NVARCHAR(100) PRIMARY KEY, SettingValue NVARCHAR(1000), Description NVARCHAR(300), DataType NVARCHAR(20));
INSERT @Set VALUES
 (N'AccessRequest.MaxValidityDays',      N'365',   N'Maximum length of an access window in days', N'Int'),
 (N'Rfid.RepeatedDeniedThreshold',       N'3',     N'Denied events for one card within the window that raise a RepeatedDenied violation', N'Int'),
 (N'Rfid.RepeatedDeniedWindowMinutes',   N'10',    N'Window in minutes for repeated denied detection', N'Int'),
 (N'Controller.SimulateOffline',         N'false', N'When true, simulated controller commands stay Pending instead of Synced', N'Bool'),
 (N'Visitor.MaxPassHours',               N'24',    N'Maximum validity of a visitor pass in hours', N'Int'),
 (N'Permission.ExpiryWarningDays',       N'7',     N'Days before expiry when permissions are flagged as expiring', N'Int'),
 (N'Audit.RetentionDays',                N'2555',  N'Audit retention policy in days (informational; records are append-only)', N'Int');

-- Values are only inserted; administrators own them after the first deployment.
INSERT dbo.SystemSettings (SettingKey, SettingValue, Description, DataType)
SELECT s.SettingKey, s.SettingValue, s.Description, s.DataType FROM @Set s
WHERE NOT EXISTS (SELECT 1 FROM dbo.SystemSettings t WHERE t.SettingKey = s.SettingKey);
UPDATE t SET Description = s.Description, DataType = s.DataType FROM dbo.SystemSettings t JOIN @Set s ON s.SettingKey = t.SettingKey
WHERE t.Description <> s.Description OR t.DataType <> s.DataType;

/*-------------------------- Bootstrap administrator -----------------*/
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'admin@eiwams.local')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = 1)
    BEGIN
        SET IDENTITY_INSERT dbo.Users ON;
        INSERT dbo.Users (UserId, DisplayName, Email, IsActive, AllFacilities) VALUES (1, N'System Administrator', N'admin@eiwams.local', 1, 1);
        SET IDENTITY_INSERT dbo.Users OFF;
    END
    ELSE
        INSERT dbo.Users (DisplayName, Email, IsActive, AllFacilities) VALUES (N'System Administrator', N'admin@eiwams.local', 1, 1);
END
INSERT dbo.UserRoles (UserId, RoleId)
SELECT u.UserId, r.RoleId FROM dbo.Users u CROSS JOIN dbo.Roles r
WHERE u.Email = N'admin@eiwams.local' AND r.RoleName = N'SystemAdmin'
  AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = u.UserId AND ur.RoleId = r.RoleId);

COMMIT;
GO

-- Every user is an employee (wave 3): link or create employee records for users without one.
EXEC dbo.usp_Internal_BackfillUserEmployees;
GO
