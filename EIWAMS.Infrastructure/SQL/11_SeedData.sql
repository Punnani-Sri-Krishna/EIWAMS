/*=====================================================================
  EIWAMS - 11_SeedData.sql
  Reference seed: permissions, roles, role grants, menus, settings and
  the bootstrap System Administrator (user 1). Idempotent: catalogue rows
  are merged; role grants are only added (admin edits are preserved),
  except SystemAdmin which always holds every permission.
=====================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRAN;

/*------------------------------ Permissions -------------------------*/
DECLARE @Perm TABLE (PermissionCode NVARCHAR(100) PRIMARY KEY, ModuleName NVARCHAR(50), Description NVARCHAR(300));
INSERT @Perm VALUES
 (N'Dashboard.View',        N'Dashboard',   N'View the dashboard and personal work queue'),
 (N'Employees.View',        N'Employees',   N'View own and direct-report employee records'),
 (N'Employees.ViewAll',     N'Employees',   N'View all employee records within facility scope'),
 (N'Employees.Manage',      N'Employees',   N'Create and update employee identity records'),
 (N'Employees.Transfer',    N'Employees',   N'Transfer employees between departments, managers and locations'),
 (N'Employees.Deactivate',  N'Employees',   N'Deactivate or exit employees (revokes cards and permissions)'),
 (N'Cards.View',            N'Cards',       N'View own RFID cards and card requests'),
 (N'Cards.ViewAll',         N'Cards',       N'View all RFID cards within facility scope'),
 (N'Cards.Request',         N'Cards',       N'Raise card requests and report own cards lost'),
 (N'Cards.Verify',          N'Cards',       N'Verify, approve or reject card requests'),
 (N'Cards.Issue',           N'Cards',       N'Issue, activate and replace RFID cards'),
 (N'Cards.Block',           N'Cards',       N'Block or deactivate RFID cards'),
 (N'AccessRequests.View',   N'Access',      N'View own and related access requests'),
 (N'AccessRequests.ViewAll',N'Access',      N'View all access requests within facility scope'),
 (N'AccessRequests.Create', N'Access',      N'Create, edit, submit and cancel access requests'),
 (N'Approvals.Decide',      N'Access',      N'Approve, return or reject assigned access requests'),
 (N'Permissions.View',      N'Permissions', N'View access permissions'),
 (N'Permissions.Provision', N'Permissions', N'Provision approved access requests'),
 (N'Permissions.Revoke',    N'Permissions', N'Revoke access permissions'),
 (N'Rfid.View',             N'RFID',        N'View RFID events and readers'),
 (N'Rfid.Ingest',           N'RFID',        N'Submit RFID reader events'),
 (N'Violations.View',       N'Security',    N'View access violations'),
 (N'Violations.Review',     N'Security',    N'Review and classify access violations'),
 (N'Incidents.View',        N'Security',    N'View security incidents'),
 (N'Incidents.Manage',      N'Security',    N'Open, assign, update and close security incidents'),
 (N'Blacklist.View',        N'Security',    N'View the blacklist'),
 (N'Blacklist.Manage',      N'Security',    N'Add and lift blacklist entries'),
 (N'Visitors.View',         N'Visitors',    N'View visitors and visitor passes'),
 (N'Visitors.Manage',       N'Visitors',    N'Register visitors and manage pass check-in/out'),
 (N'Visitors.Approve',      N'Visitors',    N'Approve visitor passes'),
 (N'Reports.View',          N'Reports',     N'View operational reports'),
 (N'Reports.Export',        N'Reports',     N'Export operational reports to CSV'),
 (N'Audit.View',            N'Reports',     N'View the audit trail'),
 (N'Users.Manage',          N'Admin',       N'Manage users, role assignments and facility scopes'),
 (N'Roles.Manage',          N'Admin',       N'Manage role permissions'),
 (N'Reference.Manage',      N'Admin',       N'Manage departments, locations and readers'),
 (N'Settings.Manage',       N'Admin',       N'Manage system settings');

MERGE dbo.Permissions AS t
USING @Perm AS s ON t.PermissionCode = s.PermissionCode
WHEN MATCHED AND (t.ModuleName <> s.ModuleName OR ISNULL(t.Description, N'') <> s.Description)
    THEN UPDATE SET ModuleName = s.ModuleName, Description = s.Description
WHEN NOT MATCHED BY TARGET THEN INSERT (PermissionCode, ModuleName, Description) VALUES (s.PermissionCode, s.ModuleName, s.Description);

/*--------------------------------- Roles ----------------------------*/
DECLARE @Role TABLE (SortKey INT PRIMARY KEY, RoleName NVARCHAR(50), Description NVARCHAR(300));
INSERT @Role VALUES
 (1, N'Employee',      N'Every employee: own identity, cards and access requests'),
 (2, N'Manager',       N'Line manager: first-stage approval for direct reports'),
 (3, N'HRAdmin',       N'HR administrator: employee identity lifecycle and card issuance'),
 (4, N'SecurityTeam',  N'Security operations: approvals, RFID monitoring, violations and incidents'),
 (5, N'FacilityAdmin', N'Facility administrator: final approval, provisioning, readers and visitors'),
 (6, N'Reception',     N'Reception desk: visitor registration and passes'),
 (7, N'SystemAdmin',   N'System administrator: full access'),
 (8, N'Auditor',       N'Read-only auditor across all facilities');

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

/*------------------------------ Role grants -------------------------*/
DECLARE @Grant TABLE (RoleName NVARCHAR(50), PermissionCode NVARCHAR(100), PRIMARY KEY (RoleName, PermissionCode));
DECLARE @Base TABLE (PermissionCode NVARCHAR(100) PRIMARY KEY);
INSERT @Base VALUES (N'Dashboard.View'), (N'Employees.View'), (N'Cards.View'), (N'Cards.Request'), (N'AccessRequests.View'), (N'AccessRequests.Create');

INSERT @Grant SELECT N'Employee', PermissionCode FROM @Base;
INSERT @Grant SELECT r.RoleName, b.PermissionCode FROM @Base b CROSS JOIN (VALUES (N'Manager'), (N'HRAdmin'), (N'SecurityTeam'), (N'FacilityAdmin')) r (RoleName);
INSERT @Grant VALUES
 (N'Manager', N'Approvals.Decide'), (N'Manager', N'Permissions.View'), (N'Manager', N'Reports.View'),
 (N'HRAdmin', N'Employees.ViewAll'), (N'HRAdmin', N'Employees.Manage'), (N'HRAdmin', N'Employees.Transfer'), (N'HRAdmin', N'Employees.Deactivate'),
 (N'HRAdmin', N'Cards.ViewAll'), (N'HRAdmin', N'Cards.Issue'), (N'HRAdmin', N'Reports.View'), (N'HRAdmin', N'Reports.Export'),
 (N'SecurityTeam', N'Cards.ViewAll'), (N'SecurityTeam', N'Cards.Verify'), (N'SecurityTeam', N'Cards.Block'), (N'SecurityTeam', N'Cards.Issue'),
 (N'SecurityTeam', N'Approvals.Decide'), (N'SecurityTeam', N'Permissions.View'), (N'SecurityTeam', N'Permissions.Revoke'),
 (N'SecurityTeam', N'Rfid.View'), (N'SecurityTeam', N'Rfid.Ingest'), (N'SecurityTeam', N'Violations.View'), (N'SecurityTeam', N'Violations.Review'),
 (N'SecurityTeam', N'Incidents.View'), (N'SecurityTeam', N'Incidents.Manage'), (N'SecurityTeam', N'Blacklist.View'), (N'SecurityTeam', N'Blacklist.Manage'),
 (N'SecurityTeam', N'Visitors.View'), (N'SecurityTeam', N'Reports.View'), (N'SecurityTeam', N'Reports.Export'), (N'SecurityTeam', N'Audit.View'),
 (N'FacilityAdmin', N'Approvals.Decide'), (N'FacilityAdmin', N'Permissions.View'), (N'FacilityAdmin', N'Permissions.Provision'),
 (N'FacilityAdmin', N'Permissions.Revoke'), (N'FacilityAdmin', N'Rfid.View'), (N'FacilityAdmin', N'Visitors.View'), (N'FacilityAdmin', N'Visitors.Approve'),
 (N'FacilityAdmin', N'Reference.Manage'), (N'FacilityAdmin', N'Reports.View'),
 (N'Reception', N'Dashboard.View'), (N'Reception', N'Employees.View'), (N'Reception', N'Visitors.View'), (N'Reception', N'Visitors.Manage'),
 (N'Reception', N'Visitors.Approve'), (N'Reception', N'Rfid.View');
INSERT @Grant SELECT N'SystemAdmin', PermissionCode FROM @Perm;
INSERT @Grant SELECT N'Auditor', PermissionCode FROM @Perm
WHERE PermissionCode LIKE N'%.View' OR PermissionCode LIKE N'%.ViewAll' OR PermissionCode IN (N'Reports.Export', N'Audit.View');

INSERT dbo.RolePermissions (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM @Grant g
JOIN dbo.Roles r ON r.RoleName = g.RoleName
JOIN dbo.Permissions p ON p.PermissionCode = g.PermissionCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId);

/*--------------------------------- Menus ----------------------------*/
DECLARE @Menu TABLE (MenuCode NVARCHAR(50) PRIMARY KEY, Section NVARCHAR(50), SectionOrder INT, Label NVARCHAR(100), Icon NVARCHAR(50),
                     Route NVARCHAR(200), SortOrder INT, Perms NVARCHAR(400));
INSERT @Menu VALUES
 (N'DASHBOARD',         N'Dashboard', 1, N'Dashboard',           N'space_dashboard',        N'/dashboard',         1, N'Dashboard.View'),
 (N'EMPLOYEES',         N'People',    2, N'Employees',           N'badge',                  N'/employees',         1, N'Employees.View,Employees.ViewAll'),
 (N'CARDS',             N'People',    2, N'ID Cards',            N'contactless',            N'/cards',             2, N'Cards.View,Cards.ViewAll'),
 (N'ACCESS_REQUESTS',   N'Access',    3, N'Access Requests',     N'key',                    N'/access-requests',   1, N'AccessRequests.View'),
 (N'APPROVALS',         N'Access',    3, N'Approvals',           N'task_alt',               N'/approvals',         2, N'Approvals.Decide'),
 (N'PERMISSIONS',       N'Access',    3, N'Permissions',         N'verified_user',          N'/permissions',       3, N'Permissions.View'),
 (N'RFID_MONITOR',      N'Security',  4, N'RFID Monitor',        N'sensors',                N'/rfid-monitor',      1, N'Rfid.View'),
 (N'VIOLATIONS',        N'Security',  4, N'Violations',          N'gpp_maybe',              N'/violations',        2, N'Violations.View'),
 (N'INCIDENTS',         N'Security',  4, N'Incidents',           N'policy',                 N'/incidents',         3, N'Incidents.View'),
 (N'BLACKLIST',         N'Security',  4, N'Blacklist',           N'block',                  N'/blacklist',         4, N'Blacklist.View'),
 (N'VISITORS',          N'Visitors',  5, N'Visitors',            N'person_pin_circle',      N'/visitors',          1, N'Visitors.View'),
 (N'REPORTS',           N'Insights',  6, N'Reports',             N'analytics',              N'/reports',           1, N'Reports.View'),
 (N'AUDIT',             N'Insights',  6, N'Audit Trail',         N'history',                N'/audit',             2, N'Audit.View'),
 (N'ADMIN_USERS',       N'Admin',     7, N'Users',               N'manage_accounts',        N'/admin/users',       1, N'Users.Manage'),
 (N'ADMIN_ROLES',       N'Admin',     7, N'Roles & Permissions', N'admin_panel_settings',   N'/admin/roles',       2, N'Roles.Manage'),
 (N'ADMIN_DEPARTMENTS', N'Admin',     7, N'Departments',         N'apartment',              N'/admin/departments', 3, N'Reference.Manage'),
 (N'ADMIN_LOCATIONS',   N'Admin',     7, N'Locations & Zones',   N'location_city',          N'/admin/locations',   4, N'Reference.Manage'),
 (N'ADMIN_READERS',     N'Admin',     7, N'RFID Readers',        N'settings_input_antenna', N'/admin/readers',     5, N'Reference.Manage'),
 (N'ADMIN_SETTINGS',    N'Admin',     7, N'Settings',            N'tune',                   N'/admin/settings',    6, N'Settings.Manage');

MERGE dbo.Menus AS t
USING @Menu AS s ON t.MenuCode = s.MenuCode
WHEN MATCHED THEN UPDATE SET Section = s.Section, SectionOrder = s.SectionOrder, Label = s.Label, Icon = s.Icon, Route = s.Route,
                             SortOrder = s.SortOrder, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN INSERT (MenuCode, Section, SectionOrder, Label, Icon, Route, SortOrder, IsActive)
    VALUES (s.MenuCode, s.Section, s.SectionOrder, s.Label, s.Icon, s.Route, s.SortOrder, 1);

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
