/*=====================================================================
  EIWAMS - 01_Tables.sql
  Tables, constraints, sequences, indexes and append-only triggers.
  Idempotent: every object is created only when missing.
=====================================================================*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- The original skeleton database held a throw-away dbo.Employees (Id, Name, Email).
IF OBJECT_ID(N'dbo.Employees', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Employees', N'EmployeeNumber') IS NULL
    DROP TABLE dbo.Employees;
GO

/*----------------------------- Sequences ----------------------------*/
IF OBJECT_ID(N'dbo.seq_AccessRequestNumber', N'SO') IS NULL CREATE SEQUENCE dbo.seq_AccessRequestNumber AS INT START WITH 1 INCREMENT BY 1;
IF OBJECT_ID(N'dbo.seq_IncidentNumber', N'SO') IS NULL CREATE SEQUENCE dbo.seq_IncidentNumber AS INT START WITH 1 INCREMENT BY 1;
IF OBJECT_ID(N'dbo.seq_VisitorPassNumber', N'SO') IS NULL CREATE SEQUENCE dbo.seq_VisitorPassNumber AS INT START WITH 1 INCREMENT BY 1;
IF OBJECT_ID(N'dbo.seq_CardRequestNumber', N'SO') IS NULL CREATE SEQUENCE dbo.seq_CardRequestNumber AS INT START WITH 1 INCREMENT BY 1;
GO

/*------------------------- Security model ---------------------------*/
IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
CREATE TABLE dbo.Roles (
    RoleId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    RoleName     NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Roles_RoleName UNIQUE,
    Description  NVARCHAR(250) NULL,
    IsSystem     BIT NOT NULL CONSTRAINT DF_Roles_IsSystem DEFAULT (1),
    CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_Roles_CreatedAtUtc DEFAULT (SYSUTCDATETIME())
);
GO

IF OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
CREATE TABLE dbo.Permissions (
    PermissionId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY,
    PermissionCode NVARCHAR(100) NOT NULL CONSTRAINT UQ_Permissions_Code UNIQUE,
    ModuleName     NVARCHAR(50)  NOT NULL,
    Description    NVARCHAR(250) NULL
);
GO

IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NULL
CREATE TABLE dbo.RolePermissions (
    RoleId       INT NOT NULL CONSTRAINT FK_RolePermissions_Roles REFERENCES dbo.Roles (RoleId),
    PermissionId INT NOT NULL CONSTRAINT FK_RolePermissions_Permissions REFERENCES dbo.Permissions (PermissionId),
    CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId)
);
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    UserId         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    DisplayName    NVARCHAR(150) NOT NULL,
    Email          NVARCHAR(256) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    EntraTenantId  UNIQUEIDENTIFIER NULL,
    EntraObjectId  UNIQUEIDENTIFIER NULL,
    IsActive       BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
    AllFacilities  BIT NOT NULL CONSTRAINT DF_Users_AllFacilities DEFAULT (0),
    LastLoginAtUtc DATETIME2(3) NULL,
    CreatedAtUtc   DATETIME2(3) NOT NULL CONSTRAINT DF_Users_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc   DATETIME2(3) NULL,
    Version        ROWVERSION NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_EntraObjectId')
    CREATE UNIQUE INDEX UX_Users_EntraObjectId ON dbo.Users (EntraObjectId) WHERE EntraObjectId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.UserRoles', N'U') IS NULL
CREATE TABLE dbo.UserRoles (
    UserId INT NOT NULL CONSTRAINT FK_UserRoles_Users REFERENCES dbo.Users (UserId),
    RoleId INT NOT NULL CONSTRAINT FK_UserRoles_Roles REFERENCES dbo.Roles (RoleId),
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserRoles_RoleId')
    CREATE INDEX IX_UserRoles_RoleId ON dbo.UserRoles (RoleId) INCLUDE (UserId);
GO

IF OBJECT_ID(N'dbo.Menus', N'U') IS NULL
CREATE TABLE dbo.Menus (
    MenuId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Menus PRIMARY KEY,
    MenuCode     NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Menus_MenuCode UNIQUE,
    Section      NVARCHAR(50)  NOT NULL,
    SectionOrder INT NOT NULL,
    Label        NVARCHAR(100) NOT NULL,
    Icon         NVARCHAR(60)  NOT NULL,
    Route        NVARCHAR(200) NOT NULL,
    SortOrder    INT NOT NULL,
    IsActive     BIT NOT NULL CONSTRAINT DF_Menus_IsActive DEFAULT (1)
);
GO

IF OBJECT_ID(N'dbo.MenuPermissions', N'U') IS NULL
CREATE TABLE dbo.MenuPermissions (
    MenuId       INT NOT NULL CONSTRAINT FK_MenuPermissions_Menus REFERENCES dbo.Menus (MenuId),
    PermissionId INT NOT NULL CONSTRAINT FK_MenuPermissions_Permissions REFERENCES dbo.Permissions (PermissionId),
    CONSTRAINT PK_MenuPermissions PRIMARY KEY (MenuId, PermissionId)
);
GO

/*------------------------- Reference data ---------------------------*/
IF OBJECT_ID(N'dbo.Departments', N'U') IS NULL
CREATE TABLE dbo.Departments (
    DepartmentId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Departments PRIMARY KEY,
    DepartmentCode NVARCHAR(20)  NOT NULL CONSTRAINT UQ_Departments_Code UNIQUE,
    DepartmentName NVARCHAR(150) NOT NULL,
    HeadUserId     INT NULL CONSTRAINT FK_Departments_HeadUser REFERENCES dbo.Users (UserId),
    IsActive       BIT NOT NULL CONSTRAINT DF_Departments_IsActive DEFAULT (1),
    CreatedAtUtc   DATETIME2(3) NOT NULL CONSTRAINT DF_Departments_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc   DATETIME2(3) NULL,
    Version        ROWVERSION NOT NULL
);
GO

IF OBJECT_ID(N'dbo.Locations', N'U') IS NULL
CREATE TABLE dbo.Locations (
    LocationId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Locations PRIMARY KEY,
    ParentLocationId INT NULL CONSTRAINT FK_Locations_Parent REFERENCES dbo.Locations (LocationId),
    LocationCode     NVARCHAR(30)  NOT NULL CONSTRAINT UQ_Locations_Code UNIQUE,
    LocationName     NVARCHAR(150) NOT NULL,
    LocationType     NVARCHAR(20)  NOT NULL CONSTRAINT CK_Locations_Type CHECK (LocationType IN (N'Campus', N'Building', N'Floor', N'Zone')),
    IsRestricted     BIT NOT NULL CONSTRAINT DF_Locations_IsRestricted DEFAULT (0),
    IsActive         BIT NOT NULL CONSTRAINT DF_Locations_IsActive DEFAULT (1),
    TimeZone         NVARCHAR(64) NOT NULL CONSTRAINT DF_Locations_TimeZone DEFAULT (N'India Standard Time'),
    CreatedAtUtc     DATETIME2(3) NOT NULL CONSTRAINT DF_Locations_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc     DATETIME2(3) NULL,
    Version          ROWVERSION NOT NULL,
    CONSTRAINT CK_Locations_NotSelfParent CHECK (ParentLocationId IS NULL OR ParentLocationId <> LocationId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Locations_Parent')
    CREATE INDEX IX_Locations_Parent ON dbo.Locations (ParentLocationId);
GO

IF OBJECT_ID(N'dbo.UserFacilityScopes', N'U') IS NULL
CREATE TABLE dbo.UserFacilityScopes (
    UserId     INT NOT NULL CONSTRAINT FK_UserFacilityScopes_Users REFERENCES dbo.Users (UserId),
    LocationId INT NOT NULL CONSTRAINT FK_UserFacilityScopes_Locations REFERENCES dbo.Locations (LocationId),
    CONSTRAINT PK_UserFacilityScopes PRIMARY KEY (UserId, LocationId)
);
GO

IF OBJECT_ID(N'dbo.Readers', N'U') IS NULL
CREATE TABLE dbo.Readers (
    ReaderId      NVARCHAR(80)  NOT NULL CONSTRAINT PK_Readers PRIMARY KEY,
    ReaderName    NVARCHAR(150) NOT NULL,
    LocationId    INT NOT NULL CONSTRAINT FK_Readers_Locations REFERENCES dbo.Locations (LocationId),
    Direction     NVARCHAR(10)  NOT NULL CONSTRAINT CK_Readers_Direction CHECK (Direction IN (N'In', N'Out', N'Both')),
    IsActive      BIT NOT NULL CONSTRAINT DF_Readers_IsActive DEFAULT (1),
    LastSeenAtUtc DATETIME2(3) NULL,
    CreatedAtUtc  DATETIME2(3) NOT NULL CONSTRAINT DF_Readers_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc  DATETIME2(3) NULL,
    Version       ROWVERSION NOT NULL
);
GO

IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NULL
CREATE TABLE dbo.SystemSettings (
    SettingKey      NVARCHAR(100) NOT NULL CONSTRAINT PK_SystemSettings PRIMARY KEY,
    SettingValue    NVARCHAR(500) NOT NULL,
    Description     NVARCHAR(300) NULL,
    DataType        NVARCHAR(20)  NOT NULL CONSTRAINT CK_SystemSettings_DataType CHECK (DataType IN (N'String', N'Int', N'Bool')),
    UpdatedAtUtc    DATETIME2(3) NULL,
    UpdatedByUserId INT NULL CONSTRAINT FK_SystemSettings_Users REFERENCES dbo.Users (UserId)
);
GO

/*----------------------------- Employees ----------------------------*/
IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
CREATE TABLE dbo.Employees (
    EmployeeId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
    EmployeeNumber    NVARCHAR(30)  NOT NULL,
    FirstName         NVARCHAR(100) NOT NULL,
    LastName          NVARCHAR(100) NOT NULL,
    WorkEmail         NVARCHAR(256) NOT NULL,
    EmployeeType      NVARCHAR(20)  NOT NULL CONSTRAINT CK_Employees_Type CHECK (EmployeeType IN (N'Permanent', N'Contract', N'Intern', N'Vendor')),
    DepartmentId      INT NOT NULL CONSTRAINT FK_Employees_Departments REFERENCES dbo.Departments (DepartmentId),
    ManagerEmployeeId INT NULL CONSTRAINT FK_Employees_Manager REFERENCES dbo.Employees (EmployeeId),
    LocationId        INT NOT NULL CONSTRAINT FK_Employees_Locations REFERENCES dbo.Locations (LocationId),
    EmploymentStatus  NVARCHAR(20)  NOT NULL CONSTRAINT DF_Employees_Status DEFAULT (N'Active')
                      CONSTRAINT CK_Employees_Status CHECK (EmploymentStatus IN (N'Active', N'Inactive', N'Exited')),
    JoinDate          DATE NOT NULL,
    EndDate           DATE NULL,
    UserId            INT NULL CONSTRAINT FK_Employees_Users REFERENCES dbo.Users (UserId),
    CreatedAtUtc      DATETIME2(3) NOT NULL CONSTRAINT DF_Employees_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId   INT NULL CONSTRAINT FK_Employees_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAtUtc      DATETIME2(3) NULL,
    UpdatedByUserId   INT NULL CONSTRAINT FK_Employees_UpdatedBy REFERENCES dbo.Users (UserId),
    Version           ROWVERSION NOT NULL,
    CONSTRAINT CK_Employees_Dates CHECK (EndDate IS NULL OR EndDate >= JoinDate),
    CONSTRAINT CK_Employees_NotSelfManager CHECK (ManagerEmployeeId IS NULL OR ManagerEmployeeId <> EmployeeId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Employees_EmployeeNumber')
    CREATE UNIQUE INDEX UX_Employees_EmployeeNumber ON dbo.Employees (EmployeeNumber);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Employees_UserId')
    CREATE UNIQUE INDEX UX_Employees_UserId ON dbo.Employees (UserId) WHERE UserId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Employees_Manager')
    CREATE INDEX IX_Employees_Manager ON dbo.Employees (ManagerEmployeeId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Employees_Dept_Loc_Status')
    CREATE INDEX IX_Employees_Dept_Loc_Status ON dbo.Employees (DepartmentId, LocationId, EmploymentStatus);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Employees_Location')
    CREATE INDEX IX_Employees_Location ON dbo.Employees (LocationId) INCLUDE (EmploymentStatus);
GO

IF OBJECT_ID(N'dbo.EmployeeHistory', N'U') IS NULL
CREATE TABLE dbo.EmployeeHistory (
    HistoryId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeHistory PRIMARY KEY,
    EmployeeId      INT NOT NULL CONSTRAINT FK_EmployeeHistory_Employees REFERENCES dbo.Employees (EmployeeId),
    ChangeType      NVARCHAR(30)  NOT NULL,
    Summary         NVARCHAR(500) NOT NULL,
    BeforeJson      NVARCHAR(MAX) NULL,
    AfterJson       NVARCHAR(MAX) NULL,
    EffectiveDate   DATE NOT NULL,
    Reason          NVARCHAR(500) NULL,
    ChangedByUserId INT NULL CONSTRAINT FK_EmployeeHistory_Users REFERENCES dbo.Users (UserId),
    ChangedAtUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_EmployeeHistory_ChangedAtUtc DEFAULT (SYSUTCDATETIME())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmployeeHistory_Employee')
    CREATE INDEX IX_EmployeeHistory_Employee ON dbo.EmployeeHistory (EmployeeId, ChangedAtUtc);
GO

/*------------------------------- Cards ------------------------------*/
IF OBJECT_ID(N'dbo.RFIDCards', N'U') IS NULL
CREATE TABLE dbo.RFIDCards (
    CardId               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RFIDCards PRIMARY KEY,
    CardUid              NVARCHAR(64) NOT NULL,
    EmployeeId           INT NOT NULL CONSTRAINT FK_RFIDCards_Employees REFERENCES dbo.Employees (EmployeeId),
    CardType             NVARCHAR(20) NOT NULL CONSTRAINT CK_RFIDCards_Type CHECK (CardType IN (N'Permanent', N'Temporary')),
    Status               NVARCHAR(20) NOT NULL CONSTRAINT DF_RFIDCards_Status DEFAULT (N'Requested')
                         CONSTRAINT CK_RFIDCards_Status CHECK (Status IN (N'Requested', N'Active', N'Lost', N'Blocked', N'Damaged', N'Expired', N'Deactivated')),
    IssuedAtUtc          DATETIME2(3) NOT NULL CONSTRAINT DF_RFIDCards_IssuedAtUtc DEFAULT (SYSUTCDATETIME()),
    ActivatedAtUtc       DATETIME2(3) NULL,
    ExpiresAtUtc         DATETIME2(3) NULL,
    BlockedAtUtc         DATETIME2(3) NULL,
    BlockReason          NVARCHAR(500) NULL,
    ControllerSyncStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_RFIDCards_Sync DEFAULT (N'Pending')
                         CONSTRAINT CK_RFIDCards_Sync CHECK (ControllerSyncStatus IN (N'Pending', N'Synced', N'Failed')),
    ReplacedByCardId     BIGINT NULL CONSTRAINT FK_RFIDCards_ReplacedBy REFERENCES dbo.RFIDCards (CardId),
    CardRequestId        BIGINT NULL,
    CreatedAtUtc         DATETIME2(3) NOT NULL CONSTRAINT DF_RFIDCards_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId      INT NULL CONSTRAINT FK_RFIDCards_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAtUtc         DATETIME2(3) NULL,
    UpdatedByUserId      INT NULL CONSTRAINT FK_RFIDCards_UpdatedBy REFERENCES dbo.Users (UserId),
    Version              ROWVERSION NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RFIDCards_CardUid')
    CREATE UNIQUE INDEX UX_RFIDCards_CardUid ON dbo.RFIDCards (CardUid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RFIDCards_CardUid_Active')
    CREATE UNIQUE INDEX UX_RFIDCards_CardUid_Active ON dbo.RFIDCards (CardUid) WHERE Status IN (N'Requested', N'Active');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RFIDCards_Employee_ActivePermanent')
    CREATE UNIQUE INDEX UX_RFIDCards_Employee_ActivePermanent ON dbo.RFIDCards (EmployeeId) WHERE Status = N'Active' AND CardType = N'Permanent';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RFIDCards_Employee')
    CREATE INDEX IX_RFIDCards_Employee ON dbo.RFIDCards (EmployeeId, Status);
GO

IF OBJECT_ID(N'dbo.CardRequests', N'U') IS NULL
CREATE TABLE dbo.CardRequests (
    CardRequestId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CardRequests PRIMARY KEY,
    RequestNumber       NVARCHAR(20) NOT NULL CONSTRAINT UQ_CardRequests_Number UNIQUE,
    RequestType         NVARCHAR(20) NOT NULL CONSTRAINT CK_CardRequests_Type CHECK (RequestType IN (N'New', N'Lost', N'Damaged', N'Replacement', N'Temporary')),
    EmployeeId          INT NOT NULL CONSTRAINT FK_CardRequests_Employees REFERENCES dbo.Employees (EmployeeId),
    OldCardId           BIGINT NULL CONSTRAINT FK_CardRequests_OldCard REFERENCES dbo.RFIDCards (CardId),
    NewCardId           BIGINT NULL CONSTRAINT FK_CardRequests_NewCard REFERENCES dbo.RFIDCards (CardId),
    Reason              NVARCHAR(500) NOT NULL,
    Status              NVARCHAR(30) NOT NULL CONSTRAINT DF_CardRequests_Status DEFAULT (N'Submitted')
                        CONSTRAINT CK_CardRequests_Status CHECK (Status IN (N'Submitted', N'VerificationPending', N'Approved', N'Issued', N'Rejected', N'Cancelled')),
    RequestedAtUtc      DATETIME2(3) NOT NULL CONSTRAINT DF_CardRequests_RequestedAtUtc DEFAULT (SYSUTCDATETIME()),
    RequestedByUserId   INT NOT NULL CONSTRAINT FK_CardRequests_RequestedBy REFERENCES dbo.Users (UserId),
    VerifiedByUserId    INT NULL CONSTRAINT FK_CardRequests_VerifiedBy REFERENCES dbo.Users (UserId),
    VerifiedAtUtc       DATETIME2(3) NULL,
    ApprovedByUserId    INT NULL CONSTRAINT FK_CardRequests_ApprovedBy REFERENCES dbo.Users (UserId),
    DecidedAtUtc        DATETIME2(3) NULL,
    DecisionComments    NVARCHAR(1000) NULL,
    RequestedValidToUtc DATETIME2(3) NULL,
    Version             ROWVERSION NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RFIDCards_CardRequests')
    ALTER TABLE dbo.RFIDCards ADD CONSTRAINT FK_RFIDCards_CardRequests FOREIGN KEY (CardRequestId) REFERENCES dbo.CardRequests (CardRequestId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CardRequests_Status')
    CREATE INDEX IX_CardRequests_Status ON dbo.CardRequests (Status, RequestedAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CardRequests_Employee')
    CREATE INDEX IX_CardRequests_Employee ON dbo.CardRequests (EmployeeId);
GO

IF OBJECT_ID(N'dbo.ControllerCommands', N'U') IS NULL
CREATE TABLE dbo.ControllerCommands (
    CommandId     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ControllerCommands PRIMARY KEY,
    CommandType   NVARCHAR(40) NOT NULL,
    EntityType    NVARCHAR(60) NOT NULL,
    EntityId      NVARCHAR(60) NOT NULL,
    LocationId    INT NULL CONSTRAINT FK_ControllerCommands_Locations REFERENCES dbo.Locations (LocationId),
    PayloadJson   NVARCHAR(MAX) NULL,
    Status        NVARCHAR(20) NOT NULL CONSTRAINT CK_ControllerCommands_Status CHECK (Status IN (N'Pending', N'Synced', N'Failed')),
    CreatedAtUtc  DATETIME2(3) NOT NULL CONSTRAINT DF_ControllerCommands_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    SyncedAtUtc   DATETIME2(3) NULL,
    CorrelationId UNIQUEIDENTIFIER NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ControllerCommands_Status')
    CREATE INDEX IX_ControllerCommands_Status ON dbo.ControllerCommands (Status, CreatedAtUtc);
GO

/*-------------------------- Access requests -------------------------*/
IF OBJECT_ID(N'dbo.AccessRequests', N'U') IS NULL
CREATE TABLE dbo.AccessRequests (
    AccessRequestId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessRequests PRIMARY KEY,
    RequestNumber         NVARCHAR(20) NOT NULL CONSTRAINT UQ_AccessRequests_Number UNIQUE,
    EmployeeId            INT NOT NULL CONSTRAINT FK_AccessRequests_Employees REFERENCES dbo.Employees (EmployeeId),
    LocationId            INT NOT NULL CONSTRAINT FK_AccessRequests_Locations REFERENCES dbo.Locations (LocationId),
    RequesterUserId       INT NOT NULL CONSTRAINT FK_AccessRequests_Requester REFERENCES dbo.Users (UserId),
    BusinessJustification NVARCHAR(1000) NOT NULL,
    ValidFromUtc          DATETIME2(3) NOT NULL,
    ValidToUtc            DATETIME2(3) NOT NULL,
    Status                NVARCHAR(20) NOT NULL CONSTRAINT DF_AccessRequests_Status DEFAULT (N'Draft')
                          CONSTRAINT CK_AccessRequests_Status CHECK (Status IN (N'Draft', N'Submitted', N'PendingApproval', N'Returned', N'Approved', N'Rejected', N'Cancelled', N'Provisioned', N'Expired')),
    CurrentStage          NVARCHAR(20) NULL CONSTRAINT CK_AccessRequests_Stage CHECK (CurrentStage IN (N'Manager', N'Security', N'FacilityAdmin')),
    Cycle                 INT NOT NULL CONSTRAINT DF_AccessRequests_Cycle DEFAULT (0),
    SubmittedAtUtc        DATETIME2(3) NULL,
    DecidedAtUtc          DATETIME2(3) NULL,
    CancelReason          NVARCHAR(500) NULL,
    CreatedAtUtc          DATETIME2(3) NOT NULL CONSTRAINT DF_AccessRequests_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc          DATETIME2(3) NULL,
    Version               ROWVERSION NOT NULL,
    CONSTRAINT CK_AccessRequests_Dates CHECK (ValidToUtc > ValidFromUtc)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessRequests_Status_Stage')
    CREATE INDEX IX_AccessRequests_Status_Stage ON dbo.AccessRequests (Status, CurrentStage, CreatedAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessRequests_Employee')
    CREATE INDEX IX_AccessRequests_Employee ON dbo.AccessRequests (EmployeeId, LocationId, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessRequests_Requester')
    CREATE INDEX IX_AccessRequests_Requester ON dbo.AccessRequests (RequesterUserId);
GO

IF OBJECT_ID(N'dbo.AccessRequestApprovals', N'U') IS NULL
CREATE TABLE dbo.AccessRequestApprovals (
    ApprovalId      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessRequestApprovals PRIMARY KEY,
    AccessRequestId BIGINT NOT NULL CONSTRAINT FK_Approvals_AccessRequests REFERENCES dbo.AccessRequests (AccessRequestId),
    Cycle           INT NOT NULL,
    Stage           NVARCHAR(20) NOT NULL CONSTRAINT CK_Approvals_Stage CHECK (Stage IN (N'Manager', N'Security', N'FacilityAdmin')),
    StageOrder      INT NOT NULL,
    Decision        NVARCHAR(20) NOT NULL CONSTRAINT DF_Approvals_Decision DEFAULT (N'Pending')
                    CONSTRAINT CK_Approvals_Decision CHECK (Decision IN (N'Pending', N'Approved', N'Returned', N'Rejected', N'Skipped')),
    DecidedByUserId INT NULL CONSTRAINT FK_Approvals_DecidedBy REFERENCES dbo.Users (UserId),
    Comments        NVARCHAR(1000) NULL,
    AssignedAtUtc   DATETIME2(3) NULL,
    DecidedAtUtc    DATETIME2(3) NULL,
    CONSTRAINT UQ_Approvals_Request_Cycle_Stage UNIQUE (AccessRequestId, Cycle, Stage)
);
GO

IF OBJECT_ID(N'dbo.AccessRequestApprovalAssignees', N'U') IS NULL
CREATE TABLE dbo.AccessRequestApprovalAssignees (
    ApprovalId BIGINT NOT NULL CONSTRAINT FK_Assignees_Approvals REFERENCES dbo.AccessRequestApprovals (ApprovalId),
    UserId     INT NOT NULL CONSTRAINT FK_Assignees_Users REFERENCES dbo.Users (UserId),
    CONSTRAINT PK_AccessRequestApprovalAssignees PRIMARY KEY (ApprovalId, UserId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Assignees_User')
    CREATE INDEX IX_Assignees_User ON dbo.AccessRequestApprovalAssignees (UserId);
GO

IF OBJECT_ID(N'dbo.AccessPermissions', N'U') IS NULL
CREATE TABLE dbo.AccessPermissions (
    PermissionId         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessPermissions PRIMARY KEY,
    EmployeeId           INT NOT NULL CONSTRAINT FK_AccessPermissions_Employees REFERENCES dbo.Employees (EmployeeId),
    LocationId           INT NOT NULL CONSTRAINT FK_AccessPermissions_Locations REFERENCES dbo.Locations (LocationId),
    AccessRequestId      BIGINT NULL CONSTRAINT FK_AccessPermissions_AccessRequests REFERENCES dbo.AccessRequests (AccessRequestId),
    ValidFromUtc         DATETIME2(3) NOT NULL,
    ValidToUtc           DATETIME2(3) NOT NULL,
    Status               NVARCHAR(20) NOT NULL CONSTRAINT DF_AccessPermissions_Status DEFAULT (N'Active')
                         CONSTRAINT CK_AccessPermissions_Status CHECK (Status IN (N'Active', N'Suspended', N'Revoked', N'Expired')),
    ProvisionedByUserId  INT NOT NULL CONSTRAINT FK_AccessPermissions_ProvisionedBy REFERENCES dbo.Users (UserId),
    ProvisionedAtUtc     DATETIME2(3) NOT NULL CONSTRAINT DF_AccessPermissions_ProvisionedAtUtc DEFAULT (SYSUTCDATETIME()),
    RevokedByUserId      INT NULL CONSTRAINT FK_AccessPermissions_RevokedBy REFERENCES dbo.Users (UserId),
    RevokedAtUtc         DATETIME2(3) NULL,
    RevokeReason         NVARCHAR(500) NULL,
    ControllerSyncStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_AccessPermissions_Sync DEFAULT (N'Pending')
                         CONSTRAINT CK_AccessPermissions_Sync CHECK (ControllerSyncStatus IN (N'Pending', N'Synced', N'Failed')),
    Version              ROWVERSION NOT NULL,
    CONSTRAINT CK_AccessPermissions_Dates CHECK (ValidToUtc > ValidFromUtc)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessPermissions_Lookup')
    CREATE INDEX IX_AccessPermissions_Lookup ON dbo.AccessPermissions (EmployeeId, LocationId, Status, ValidFromUtc, ValidToUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AccessPermissions_AccessRequest')
    CREATE UNIQUE INDEX UX_AccessPermissions_AccessRequest ON dbo.AccessPermissions (AccessRequestId) WHERE AccessRequestId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessPermissions_Expiry')
    CREATE INDEX IX_AccessPermissions_Expiry ON dbo.AccessPermissions (Status, ValidToUtc);
GO

/*-------------------------- RFID and security -----------------------*/
IF OBJECT_ID(N'dbo.AccessLogs', N'U') IS NULL
CREATE TABLE dbo.AccessLogs (
    AccessLogId      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessLogs PRIMARY KEY,
    ExternalEventId  NVARCHAR(100) NOT NULL,
    ReaderId         NVARCHAR(80) NOT NULL CONSTRAINT FK_AccessLogs_Readers REFERENCES dbo.Readers (ReaderId),
    MaskedCardUid    NVARCHAR(16) NOT NULL,
    CardUidHash      VARBINARY(32) NOT NULL,
    CardId           BIGINT NULL CONSTRAINT FK_AccessLogs_Cards REFERENCES dbo.RFIDCards (CardId),
    EmployeeId       INT NULL CONSTRAINT FK_AccessLogs_Employees REFERENCES dbo.Employees (EmployeeId),
    LocationId       INT NOT NULL CONSTRAINT FK_AccessLogs_Locations REFERENCES dbo.Locations (LocationId),
    EventType        NVARCHAR(10) NOT NULL CONSTRAINT CK_AccessLogs_EventType CHECK (EventType IN (N'Entry', N'Exit')),
    Decision         NVARCHAR(10) NOT NULL CONSTRAINT CK_AccessLogs_Decision CHECK (Decision IN (N'Granted', N'Denied')),
    DenialReason     NVARCHAR(40) NULL,
    PermissionId     BIGINT NULL CONSTRAINT FK_AccessLogs_Permissions REFERENCES dbo.AccessPermissions (PermissionId),
    EventAtUtc       DATETIME2(3) NOT NULL,
    ReceivedAtUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_AccessLogs_ReceivedAtUtc DEFAULT (SYSUTCDATETIME()),
    ProcessingStatus NVARCHAR(20) NOT NULL CONSTRAINT CK_AccessLogs_Processing CHECK (ProcessingStatus IN (N'Processed', N'Review')),
    CorrelationId    UNIQUEIDENTIFIER NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AccessLogs_Reader_ExternalEvent')
    CREATE UNIQUE INDEX UX_AccessLogs_Reader_ExternalEvent ON dbo.AccessLogs (ReaderId, ExternalEventId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessLogs_Location_Time')
    CREATE INDEX IX_AccessLogs_Location_Time ON dbo.AccessLogs (LocationId, EventAtUtc) INCLUDE (Decision, EventType);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessLogs_Employee_Time')
    CREATE INDEX IX_AccessLogs_Employee_Time ON dbo.AccessLogs (EmployeeId, EventAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessLogs_CardHash_Time')
    CREATE INDEX IX_AccessLogs_CardHash_Time ON dbo.AccessLogs (CardUidHash, EventAtUtc) INCLUDE (Decision);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessLogs_EventAt')
    CREATE INDEX IX_AccessLogs_EventAt ON dbo.AccessLogs (EventAtUtc);
GO

IF OBJECT_ID(N'dbo.AccessViolations', N'U') IS NULL
CREATE TABLE dbo.AccessViolations (
    ViolationId      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessViolations PRIMARY KEY,
    AccessLogId      BIGINT NULL CONSTRAINT FK_AccessViolations_AccessLogs REFERENCES dbo.AccessLogs (AccessLogId),
    EmployeeId       INT NULL CONSTRAINT FK_AccessViolations_Employees REFERENCES dbo.Employees (EmployeeId),
    CardId           BIGINT NULL CONSTRAINT FK_AccessViolations_Cards REFERENCES dbo.RFIDCards (CardId),
    LocationId       INT NOT NULL CONSTRAINT FK_AccessViolations_Locations REFERENCES dbo.Locations (LocationId),
    ViolationType    NVARCHAR(30) NOT NULL CONSTRAINT CK_AccessViolations_Type CHECK (ViolationType IN (N'BlockedCard', N'ExpiredPermission', N'UnauthorizedZone', N'RepeatedDenied', N'EventAnomaly')),
    Severity         NVARCHAR(10) NOT NULL CONSTRAINT CK_AccessViolations_Severity CHECK (Severity IN (N'Low', N'Medium', N'High', N'Critical')),
    Status           NVARCHAR(20) NOT NULL CONSTRAINT DF_AccessViolations_Status DEFAULT (N'Open')
                     CONSTRAINT CK_AccessViolations_Status CHECK (Status IN (N'Open', N'UnderReview', N'Confirmed', N'FalsePositive', N'Closed')),
    DetectedAtUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_AccessViolations_DetectedAtUtc DEFAULT (SYSUTCDATETIME()),
    ReviewNotes      NVARCHAR(2000) NULL,
    ReviewedByUserId INT NULL CONSTRAINT FK_AccessViolations_ReviewedBy REFERENCES dbo.Users (UserId),
    ReviewedAtUtc    DATETIME2(3) NULL,
    IncidentId       INT NULL,
    Version          ROWVERSION NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessViolations_Status')
    CREATE INDEX IX_AccessViolations_Status ON dbo.AccessViolations (Status, Severity, DetectedAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccessViolations_Location')
    CREATE INDEX IX_AccessViolations_Location ON dbo.AccessViolations (LocationId, DetectedAtUtc);
GO

IF OBJECT_ID(N'dbo.SecurityIncidents', N'U') IS NULL
CREATE TABLE dbo.SecurityIncidents (
    IncidentId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SecurityIncidents PRIMARY KEY,
    IncidentNumber   NVARCHAR(20) NOT NULL CONSTRAINT UQ_SecurityIncidents_Number UNIQUE,
    ViolationId      BIGINT NULL CONSTRAINT FK_SecurityIncidents_Violations REFERENCES dbo.AccessViolations (ViolationId),
    IncidentType     NVARCHAR(30) NOT NULL CONSTRAINT CK_SecurityIncidents_Type CHECK (IncidentType IN (N'UnauthorizedAccess', N'Tailgating', N'LostCard', N'BlacklistHit', N'EquipmentFault', N'Other')),
    Title            NVARCHAR(200) NOT NULL,
    Description      NVARCHAR(4000) NOT NULL,
    Severity         NVARCHAR(10) NOT NULL CONSTRAINT CK_SecurityIncidents_Severity CHECK (Severity IN (N'Low', N'Medium', N'High', N'Critical')),
    Status           NVARCHAR(20) NOT NULL CONSTRAINT DF_SecurityIncidents_Status DEFAULT (N'Open')
                     CONSTRAINT CK_SecurityIncidents_Status CHECK (Status IN (N'Open', N'UnderReview', N'Confirmed', N'FalsePositive', N'Closed')),
    LocationId       INT NULL CONSTRAINT FK_SecurityIncidents_Locations REFERENCES dbo.Locations (LocationId),
    AssignedToUserId INT NULL CONSTRAINT FK_SecurityIncidents_AssignedTo REFERENCES dbo.Users (UserId),
    Resolution       NVARCHAR(4000) NULL,
    OpenedByUserId   INT NOT NULL CONSTRAINT FK_SecurityIncidents_OpenedBy REFERENCES dbo.Users (UserId),
    OpenedAtUtc      DATETIME2(3) NOT NULL CONSTRAINT DF_SecurityIncidents_OpenedAtUtc DEFAULT (SYSUTCDATETIME()),
    ClosedAtUtc      DATETIME2(3) NULL,
    UpdatedAtUtc     DATETIME2(3) NULL,
    Version          ROWVERSION NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_AccessViolations_Incidents')
    ALTER TABLE dbo.AccessViolations ADD CONSTRAINT FK_AccessViolations_Incidents FOREIGN KEY (IncidentId) REFERENCES dbo.SecurityIncidents (IncidentId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SecurityIncidents_Status')
    CREATE INDEX IX_SecurityIncidents_Status ON dbo.SecurityIncidents (Status, Severity, OpenedAtUtc);
GO

IF OBJECT_ID(N'dbo.IncidentNotes', N'U') IS NULL
CREATE TABLE dbo.IncidentNotes (
    NoteId          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_IncidentNotes PRIMARY KEY,
    IncidentId      INT NOT NULL CONSTRAINT FK_IncidentNotes_Incidents REFERENCES dbo.SecurityIncidents (IncidentId),
    Note            NVARCHAR(4000) NOT NULL,
    CreatedByUserId INT NOT NULL CONSTRAINT FK_IncidentNotes_Users REFERENCES dbo.Users (UserId),
    CreatedAtUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_IncidentNotes_CreatedAtUtc DEFAULT (SYSUTCDATETIME())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidentNotes_Incident')
    CREATE INDEX IX_IncidentNotes_Incident ON dbo.IncidentNotes (IncidentId, CreatedAtUtc);
GO

IF OBJECT_ID(N'dbo.Blacklist', N'U') IS NULL
CREATE TABLE dbo.Blacklist (
    BlacklistId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Blacklist PRIMARY KEY,
    SubjectType     NVARCHAR(20) NOT NULL CONSTRAINT CK_Blacklist_SubjectType CHECK (SubjectType IN (N'Employee', N'Visitor', N'Card')),
    SubjectId       BIGINT NOT NULL,
    Reason          NVARCHAR(1000) NOT NULL,
    ReviewDate      DATE NULL,
    IsActive        BIT NOT NULL CONSTRAINT DF_Blacklist_IsActive DEFAULT (1),
    CreatedByUserId INT NOT NULL CONSTRAINT FK_Blacklist_CreatedBy REFERENCES dbo.Users (UserId),
    CreatedAtUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_Blacklist_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    LiftedByUserId  INT NULL CONSTRAINT FK_Blacklist_LiftedBy REFERENCES dbo.Users (UserId),
    LiftedAtUtc     DATETIME2(3) NULL,
    LiftReason      NVARCHAR(1000) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Blacklist_ActiveSubject')
    CREATE UNIQUE INDEX UX_Blacklist_ActiveSubject ON dbo.Blacklist (SubjectType, SubjectId) WHERE IsActive = 1;
GO

/*------------------------------ Visitors ----------------------------*/
IF OBJECT_ID(N'dbo.Visitors', N'U') IS NULL
CREATE TABLE dbo.Visitors (
    VisitorId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Visitors PRIMARY KEY,
    DisplayName      NVARCHAR(150) NOT NULL,
    Organization     NVARCHAR(150) NULL,
    ContactReference NVARCHAR(150) NULL,
    VisitPurpose     NVARCHAR(500) NOT NULL,
    SponsorUserId    INT NULL CONSTRAINT FK_Visitors_Sponsor REFERENCES dbo.Users (UserId),
    CreatedByUserId  INT NOT NULL CONSTRAINT FK_Visitors_CreatedBy REFERENCES dbo.Users (UserId),
    CreatedAtUtc     DATETIME2(3) NOT NULL CONSTRAINT DF_Visitors_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    UpdatedAtUtc     DATETIME2(3) NULL
);
GO

IF OBJECT_ID(N'dbo.VisitorPasses', N'U') IS NULL
CREATE TABLE dbo.VisitorPasses (
    VisitorPassId    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_VisitorPasses PRIMARY KEY,
    PassNumber       NVARCHAR(20) NOT NULL CONSTRAINT UQ_VisitorPasses_Number UNIQUE,
    VisitorId        INT NOT NULL CONSTRAINT FK_VisitorPasses_Visitors REFERENCES dbo.Visitors (VisitorId),
    LocationId       INT NOT NULL CONSTRAINT FK_VisitorPasses_Locations REFERENCES dbo.Locations (LocationId),
    SponsorUserId    INT NULL CONSTRAINT FK_VisitorPasses_Sponsor REFERENCES dbo.Users (UserId),
    ValidFromUtc     DATETIME2(3) NOT NULL,
    ValidToUtc       DATETIME2(3) NOT NULL,
    Status           NVARCHAR(20) NOT NULL CONSTRAINT DF_VisitorPasses_Status DEFAULT (N'PendingApproval')
                     CONSTRAINT CK_VisitorPasses_Status CHECK (Status IN (N'PendingApproval', N'Approved', N'Active', N'CheckedOut', N'Expired', N'Revoked')),
    CreatedByUserId  INT NOT NULL CONSTRAINT FK_VisitorPasses_CreatedBy REFERENCES dbo.Users (UserId),
    CreatedAtUtc     DATETIME2(3) NOT NULL CONSTRAINT DF_VisitorPasses_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    ApprovedByUserId INT NULL CONSTRAINT FK_VisitorPasses_ApprovedBy REFERENCES dbo.Users (UserId),
    ApprovedAtUtc    DATETIME2(3) NULL,
    ApprovalComments NVARCHAR(1000) NULL,
    CheckedInAtUtc   DATETIME2(3) NULL,
    CheckedOutAtUtc  DATETIME2(3) NULL,
    RevokedByUserId  INT NULL CONSTRAINT FK_VisitorPasses_RevokedBy REFERENCES dbo.Users (UserId),
    RevokedAtUtc     DATETIME2(3) NULL,
    RevokeReason     NVARCHAR(500) NULL,
    Version          ROWVERSION NOT NULL,
    CONSTRAINT CK_VisitorPasses_Dates CHECK (ValidToUtc > ValidFromUtc)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorPasses_Status')
    CREATE INDEX IX_VisitorPasses_Status ON dbo.VisitorPasses (Status, ValidFromUtc, ValidToUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorPasses_Visitor')
    CREATE INDEX IX_VisitorPasses_Visitor ON dbo.VisitorPasses (VisitorId);
GO

/*------------------------ Audit and notifications -------------------*/
IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
CREATE TABLE dbo.AuditLogs (
    AuditLogId    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY,
    ActorUserId   INT NULL CONSTRAINT FK_AuditLogs_Users REFERENCES dbo.Users (UserId),
    Action        NVARCHAR(100) NOT NULL,
    EntityType    NVARCHAR(60)  NOT NULL,
    EntityId      NVARCHAR(60)  NULL,
    Summary       NVARCHAR(500) NOT NULL,
    BeforeJson    NVARCHAR(MAX) NULL,
    AfterJson     NVARCHAR(MAX) NULL,
    Reason        NVARCHAR(1000) NULL,
    OccurredAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_AuditLogs_OccurredAtUtc DEFAULT (SYSUTCDATETIME()),
    CorrelationId UNIQUEIDENTIFIER NULL,
    IpAddress     VARCHAR(45) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_Entity')
    CREATE INDEX IX_AuditLogs_Entity ON dbo.AuditLogs (EntityType, EntityId, OccurredAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_Actor')
    CREATE INDEX IX_AuditLogs_Actor ON dbo.AuditLogs (ActorUserId, OccurredAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_Occurred')
    CREATE INDEX IX_AuditLogs_Occurred ON dbo.AuditLogs (OccurredAtUtc);
GO

IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
CREATE TABLE dbo.Notifications (
    NotificationId    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY,
    UserId            INT NOT NULL CONSTRAINT FK_Notifications_Users REFERENCES dbo.Users (UserId),
    Type              NVARCHAR(50)  NOT NULL,
    Title             NVARCHAR(200) NOT NULL,
    Message           NVARCHAR(1000) NOT NULL,
    RelatedEntityType NVARCHAR(60) NULL,
    RelatedEntityId   NVARCHAR(60) NULL,
    Route             NVARCHAR(200) NULL,
    CreatedAtUtc      DATETIME2(3) NOT NULL CONSTRAINT DF_Notifications_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    ReadAtUtc         DATETIME2(3) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Notifications_User')
    CREATE INDEX IX_Notifications_User ON dbo.Notifications (UserId, ReadAtUtc, CreatedAtUtc);
GO

/*------------------- Append-only protection triggers ----------------*/
CREATE OR ALTER TRIGGER dbo.trg_AuditLogs_AppendOnly ON dbo.AuditLogs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50403, N'Audit logs are append-only and cannot be modified or deleted.', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.trg_AccessLogs_AppendOnly ON dbo.AccessLogs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50403, N'Access logs are append-only and cannot be modified or deleted.', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.trg_EmployeeHistory_AppendOnly ON dbo.EmployeeHistory
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50403, N'Employee history is append-only and cannot be modified or deleted.', 1;
END
GO
