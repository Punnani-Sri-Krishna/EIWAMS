namespace EIWAMS.Application.Constants;

public static class ConfigurationConstants
{
    public const string SqlConnectionString = "SqlConnectionString";

    public const string DefaultConnectionString = "ConnectionStrings:DefaultConnection";

    public const string AuthMode = "Auth:Mode";

    public const string AuthEntraTenantId = "Auth:Entra:TenantId";

    public const string AuthEntraClientId = "Auth:Entra:ClientId";

    public const string AuthEntraSpaClientId = "Auth:Entra:SpaClientId";

    public const string AuthEntraAudience = "Auth:Entra:Audience";

    public const string AuthEntraRequiredScope = "Auth:Entra:RequiredScope";

    public const string AuthEntraApiScope = "Auth:Entra:ApiScope";

    public const string AuthEntraRequiredGroupId = "Auth:Entra:RequiredGroupId";
}

public static class HttpConstants
{
    public const string UserIdHeader = "X-User-Id";

    public const string CorrelationIdHeader = "X-Correlation-Id";

    public const string ForwardedForHeader = "X-Forwarded-For";

    public const string AccessControlExposeHeadersHeader = "Access-Control-Expose-Headers";

    public const string ContentDispositionHeader = "Content-Disposition";

    public const int DefaultPageSize = 20;

    public const int MaxPageSize = 100;

    public const int MaxExportRows = 50000;

    public const string CsvContentType = "text/csv; charset=utf-8";

    public static readonly string[] AnonymousFunctions = ["GetAuthConfig", "GetDevUsers"];

    // Authenticated-only functions: no permission code, but a valid active user is required (except anonymous ones).
    public static readonly string[] NoPermissionFunctions =
    [
        "GetAuthConfig", "GetDevUsers", "GetMe", "GetMyMenu", "Me_GetProfile", "Me_UpdateProfile", "Me_GetPhoto", "Me_PutPhoto", "GetLookups",
        "GetNotifications", "GetUnreadNotificationCount", "MarkNotificationRead", "MarkAllNotificationsRead",
    ];
}

public static class ApiMessages
{
    public const string Success = "Success";
    public const string Created = "Created successfully.";
    public const string Updated = "Updated successfully.";
    public const string Unauthenticated = "Authentication is required.";
    public const string InvalidUserHeader = "The X-User-Id header is missing or invalid.";
    public const string UnknownUser = "The user is unknown or inactive.";
    public const string Forbidden = "You do not have permission to perform this action.";
    public const string InvalidToken = "The access token is invalid or expired.";
    public const string DevHeaderNotAllowed = "The X-User-Id header is not accepted in this environment.";
    public const string AuthServiceUnavailable = "The identity provider is unavailable. Try again later.";
    public const string NotFound = "The requested resource was not found.";
    public const string ValidationFailed = "One or more validation errors occurred.";
    public const string InvalidRequestBody = "The request body is missing or is not valid JSON.";
    public const string InvalidQueryParameter = "Query parameter '{0}' has an invalid value.";
    public const string InvalidDateRange = "'from' must be earlier than or equal to 'to'.";
    public const string Conflict = "The record was changed by another user or conflicts with an existing record.";
    public const string Duplicate = "A record with the same unique value already exists.";
    public const string ReferenceViolation = "The request references a record that does not exist or is still in use.";
    public const string Unexpected = "An unexpected error occurred. Quote the correlation id when contacting support.";
    public const string TooManyRequests = "Too many requests. Slow down and try again shortly.";
    public const string UnknownReport = "Unknown report.";
}

public static class Permissions
{
    public const string DashboardView = "Dashboard.View";
    public const string EmployeesView = "Employees.View";
    public const string EmployeesViewAll = "Employees.ViewAll";
    public const string EmployeesManage = "Employees.Manage";
    public const string EmployeesTransfer = "Employees.Transfer";
    public const string EmployeesDeactivate = "Employees.Deactivate";
    public const string EmployeesSync = "Employees.Sync";
    public const string CardsView = "Cards.View";
    public const string CardsViewAll = "Cards.ViewAll";
    public const string CardsRequest = "Cards.Request";
    public const string CardsVerify = "Cards.Verify";
    public const string CardsManagerApprove = "Cards.ManagerApprove";
    public const string CardsHrVerify = "Cards.HrVerify";
    public const string CardsSecurityReview = "Cards.SecurityReview";
    public const string CardsProcess = "Cards.Process";
    public const string CardsIssue = "Cards.Issue";
    public const string CardsBlock = "Cards.Block";
    public const string AccessRequestsView = "AccessRequests.View";
    public const string AccessRequestsViewAll = "AccessRequests.ViewAll";
    public const string AccessRequestsCreate = "AccessRequests.Create";
    public const string ApprovalsDecide = "Approvals.Decide";
    public const string ApprovalsTeam = "Approvals.Team";
    public const string PermissionsView = "Permissions.View";
    public const string PermissionsProvision = "Permissions.Provision";
    public const string PermissionsRevoke = "Permissions.Revoke";
    public const string RfidView = "Rfid.View";
    public const string RfidIngest = "Rfid.Ingest";
    public const string ViolationsView = "Violations.View";
    public const string ViolationsReview = "Violations.Review";
    public const string IncidentsView = "Incidents.View";
    public const string IncidentsManage = "Incidents.Manage";
    public const string BlacklistView = "Blacklist.View";
    public const string BlacklistManage = "Blacklist.Manage";
    public const string VisitorsView = "Visitors.View";
    public const string VisitorsManage = "Visitors.Manage";
    public const string VisitorsApprove = "Visitors.Approve";
    public const string ReportsView = "Reports.View";
    public const string ReportsExport = "Reports.Export";
    public const string AuditView = "Audit.View";
    public const string UsersManage = "Users.Manage";
    public const string RolesManage = "Roles.Manage";
    public const string ReferenceManage = "Reference.Manage";
    public const string SettingsManage = "Settings.Manage";
}

/// <summary>Enumerations mirrored from the SQL CHECK constraints (01_Tables.sql).</summary>
public static class LookupValues
{
    public static readonly string[] EmployeeTypes = ["Permanent", "Contract", "Intern", "Vendor"];
    public static readonly string[] EmploymentStatuses = ["Active", "Inactive", "Exited"];
    public static readonly string[] DeactivationStatuses = ["Exited", "Inactive"];
    public static readonly string[] CardTypes = ["Permanent", "Temporary"];
    public static readonly string[] CardStatuses = ["Requested", "Active", "Lost", "Blocked", "Damaged", "Expired", "Deactivated"];
    public static readonly string[] CardRequestTypes = ["New", "Lost", "Damaged", "Replacement", "Temporary"];
    public static readonly string[] CardRequestStatuses = ["PendingManager", "PendingHR", "PendingSecurity", "PendingIdCardTeam", "Printing", "ReadyToIssue", "Closed", "Rejected", "Cancelled"];
    public static readonly string[] CardRequestTypesOffered = ["New", "Lost", "Damaged"];
    public static readonly string[] CardRequestStages = ["Manager", "HR", "Security", "IdCardTeam"];
    public static readonly string[] CardRequestActions = ["Approve", "Reject", "Verify", "MarkPrinted", "Issue", "Cancel"];
    public static readonly string[] DamagedReasons = ["Scratched", "Broken", "RfidNotWorking", "CardExpired", "PhotoNotVisible"];
    public static readonly string[] BloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    public static readonly string[] AccessTypes = ["Building", "WingFloor"];
    public static readonly string[] DurationCodes = ["OneWeek", "OneMonth", "ThreeMonths", "SixMonths", "OneYear", "Permanent", "Custom"];
    public static readonly string[] AccessRequestStatuses = ["Draft", "Submitted", "PendingApproval", "Returned", "Approved", "Rejected", "Cancelled", "Provisioned", "Expired"];
    public static readonly string[] ApprovalStages = ["Manager", "SecurityHead", "Security", "AccessControl"];
    public static readonly string[] ApprovalDecisions = ["Approve", "Return", "Reject"];
    public static readonly string[] PermissionStatuses = ["Active", "Suspended", "Revoked", "Expired"];
    public static readonly string[] EventTypes = ["Entry", "Exit"];
    public static readonly string[] Decisions = ["Granted", "Denied"];
    public static readonly string[] ViolationTypes = ["BlockedCard", "ExpiredPermission", "UnauthorizedZone", "RepeatedDenied", "EventAnomaly"];
    public static readonly string[] ViolationStatuses = ["Open", "UnderReview", "Confirmed", "FalsePositive", "Closed"];
    public static readonly string[] Severities = ["Low", "Medium", "High", "Critical"];
    public static readonly string[] IncidentTypes = ["UnauthorizedAccess", "Tailgating", "LostCard", "BlacklistHit", "EquipmentFault", "Other"];
    public static readonly string[] IncidentStatuses = ["Open", "UnderReview", "Confirmed", "FalsePositive", "Closed"];
    public static readonly string[] VisitorPassStatuses = ["PendingApproval", "Approved", "Active", "CheckedOut", "Expired", "Revoked"];
    public static readonly string[] LocationTypes = ["Campus", "Building", "Floor", "Wing", "Zone"];
    public static readonly string[] BlacklistSubjectTypes = ["Employee", "Visitor", "Card"];
    public static readonly string[] ReaderDirections = ["In", "Out", "Both"];
}

public static class ReportNames
{
    public static readonly IReadOnlyDictionary<string, string> ProcedureByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["employee-register"] = StoredProcedures.ReportEmployeeRegister,
        ["card-lifecycle"] = StoredProcedures.ReportCardLifecycle,
        ["access-permissions"] = StoredProcedures.ReportAccessPermissions,
        ["access-activity"] = StoredProcedures.ReportAccessActivity,
        ["request-aging"] = StoredProcedures.ReportRequestAging,
        ["violations-incidents"] = StoredProcedures.ReportViolationsIncidents,
        ["audit-compliance"] = StoredProcedures.ReportAuditCompliance,
    };
}

public static class StoredProcedures
{
    public const string UserGetContext = "dbo.usp_User_GetContext";
    public const string UserResolveEntra = "dbo.usp_User_ResolveEntra";
    public const string UserListForSwitch = "dbo.usp_User_ListForSwitch";
    public const string MenuGetForUser = "dbo.usp_Menu_GetForUser";
    public const string LookupGetAll = "dbo.usp_Lookup_GetAll";
    public const string NotificationSearch = "dbo.usp_Notification_Search";
    public const string NotificationUnreadCount = "dbo.usp_Notification_UnreadCount";
    public const string NotificationMarkRead = "dbo.usp_Notification_MarkRead";
    public const string NotificationMarkAllRead = "dbo.usp_Notification_MarkAllRead";
    public const string MeGetProfile = "dbo.usp_Me_GetProfile";
    public const string MeUpdateProfile = "dbo.usp_Me_UpdateProfile";
    public const string MeGetPhoto = "dbo.usp_Me_GetPhoto";
    public const string MePutPhoto = "dbo.usp_Me_PutPhoto";
    public const string EmployeeGetPhoto = "dbo.usp_Employee_GetPhoto";
    public const string EmployeeSync = "dbo.usp_Employee_Sync";
    public const string ApprovalTeamSearch = "dbo.usp_Approval_TeamSearch";

    public const string EmployeeSearch = "dbo.usp_Employee_Search";
    public const string EmployeeGet = "dbo.usp_Employee_Get";
    public const string EmployeeCreate = "dbo.usp_Employee_Create";
    public const string EmployeeUpdate = "dbo.usp_Employee_Update";
    public const string EmployeeTransfer = "dbo.usp_Employee_Transfer";
    public const string EmployeeDeactivate = "dbo.usp_Employee_Deactivate";
    public const string EmployeeGetCards = "dbo.usp_Employee_GetCards";
    public const string EmployeeGetHistory = "dbo.usp_Employee_GetHistory";

    public const string CardSearch = "dbo.usp_Card_Search";
    public const string CardCreate = "dbo.usp_Card_Create";
    public const string CardActivate = "dbo.usp_Card_Activate";
    public const string CardBlock = "dbo.usp_Card_Block";
    public const string CardReportLost = "dbo.usp_Card_ReportLost";
    public const string CardReplace = "dbo.usp_Card_Replace";
    public const string CardDeactivate = "dbo.usp_Card_Deactivate";
    public const string CardRequestSearch = "dbo.usp_CardRequest_Search";
    public const string CardRequestCreate = "dbo.usp_CardRequest_Create";
    public const string CardRequestDecide = "dbo.usp_CardRequest_Decide";
    public const string CardRequestQueue = "dbo.usp_CardRequest_Queue";
    public const string CardRequestGet = "dbo.usp_CardRequest_Get";

    public const string AccessRequestSearch = "dbo.usp_AccessRequest_Search";
    public const string AccessRequestGet = "dbo.usp_AccessRequest_Get";
    public const string AccessRequestCreate = "dbo.usp_AccessRequest_Create";
    public const string AccessRequestUpdate = "dbo.usp_AccessRequest_Update";
    public const string AccessRequestSubmit = "dbo.usp_AccessRequest_Submit";
    public const string AccessRequestCancel = "dbo.usp_AccessRequest_Cancel";
    public const string ApprovalPending = "dbo.usp_Approval_Pending";
    public const string ApprovalDecide = "dbo.usp_Approval_Decide";
    public const string PermissionSearch = "dbo.usp_Permission_Search";
    public const string PermissionProvision = "dbo.usp_Permission_Provision";
    public const string PermissionRevoke = "dbo.usp_Permission_Revoke";

    public const string RfidEventIngest = "dbo.usp_RfidEvent_Ingest";
    public const string AccessLogSearch = "dbo.usp_AccessLog_Search";
    public const string ViolationSearch = "dbo.usp_Violation_Search";
    public const string ViolationReview = "dbo.usp_Violation_Review";
    public const string IncidentSearch = "dbo.usp_Incident_Search";
    public const string IncidentGet = "dbo.usp_Incident_Get";
    public const string IncidentCreate = "dbo.usp_Incident_Create";
    public const string IncidentUpdate = "dbo.usp_Incident_Update";
    public const string BlacklistSearch = "dbo.usp_Blacklist_Search";
    public const string BlacklistCreate = "dbo.usp_Blacklist_Create";
    public const string BlacklistLift = "dbo.usp_Blacklist_Lift";

    public const string VisitorSearch = "dbo.usp_Visitor_Search";
    public const string VisitorCreate = "dbo.usp_Visitor_Create";
    public const string VisitorPassSearch = "dbo.usp_VisitorPass_Search";
    public const string VisitorPassCreate = "dbo.usp_VisitorPass_Create";
    public const string VisitorPassTransition = "dbo.usp_VisitorPass_Transition";

    public const string DashboardSummary = "dbo.usp_Dashboard_Summary";
    public const string DashboardHome = "dbo.usp_Dashboard_Home";
    public const string DashboardEventsTrend = "dbo.usp_Dashboard_EventsTrend";
    public const string DashboardRequestsByStatus = "dbo.usp_Dashboard_RequestsByStatus";
    public const string DashboardViolationsByType = "dbo.usp_Dashboard_ViolationsByType";
    public const string DashboardCardsByStatus = "dbo.usp_Dashboard_CardsByStatus";
    public const string DashboardOccupancy = "dbo.usp_Dashboard_Occupancy";
    public const string DashboardMyWork = "dbo.usp_Dashboard_MyWork";
    public const string DashboardActivity = "dbo.usp_Dashboard_Activity";
    public const string ReportEmployeeRegister = "dbo.usp_Report_EmployeeRegister";
    public const string ReportCardLifecycle = "dbo.usp_Report_CardLifecycle";
    public const string ReportAccessPermissions = "dbo.usp_Report_AccessPermissions";
    public const string ReportAccessActivity = "dbo.usp_Report_AccessActivity";
    public const string ReportRequestAging = "dbo.usp_Report_RequestAging";
    public const string ReportViolationsIncidents = "dbo.usp_Report_ViolationsIncidents";
    public const string ReportAuditCompliance = "dbo.usp_Report_AuditCompliance";
    public const string AuditSearch = "dbo.usp_Audit_Search";
    public const string AuditTimeline = "dbo.usp_Audit_Timeline";

    public const string AdminEmployeeSearch = "dbo.usp_AdminEmployee_Search";
    public const string AdminEmployeeSave = "dbo.usp_AdminEmployee_Save";
    public const string RoleList = "dbo.usp_Role_List";
    public const string RoleGetPermissions = "dbo.usp_Role_GetPermissions";
    public const string RoleSetPermissions = "dbo.usp_Role_SetPermissions";
    public const string PermissionCatalog = "dbo.usp_Permission_Catalog";
    public const string DepartmentList = "dbo.usp_Department_List";
    public const string DepartmentSave = "dbo.usp_Department_Save";
    public const string LocationList = "dbo.usp_Location_List";
    public const string LocationSave = "dbo.usp_Location_Save";
    public const string ReaderList = "dbo.usp_Reader_List";
    public const string ReaderSave = "dbo.usp_Reader_Save";
    public const string SettingList = "dbo.usp_Setting_List";
    public const string SettingUpdate = "dbo.usp_Setting_Update";
}
