using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
using EIWAMS.Infrastructure.Auth;

namespace EIWAMS.Infrastructure.Repositories.Interfaces;

public interface IIdentityRepository
{
    Task<CurrentUserDto?> GetUserContextAsync(int userId);

    Task<EntraUserDto?> ResolveEntraUserAsync(TokenIdentity identity);

    Task<IReadOnlyList<DevUserDto>> GetDevUsersAsync();

    Task<IReadOnlyList<MenuItemDto>> GetMenuAsync(ActorContext actor);

    Task<LookupsDto> GetLookupsAsync(ActorContext actor);

    Task<PagedResult<NotificationDto>> SearchNotificationsAsync(ActorContext actor, NotificationQuery query);

    Task<CountDto> GetUnreadNotificationCountAsync(ActorContext actor);

    Task<bool> MarkNotificationReadAsync(ActorContext actor, long notificationId);

    Task<CountDto> MarkAllNotificationsReadAsync(ActorContext actor);
}

public interface IEmployeeRepository
{
    Task<PagedResult<EmployeeListItemDto>> SearchAsync(ActorContext actor, EmployeeQuery query);

    Task<EmployeeDetailDto> GetAsync(ActorContext actor, int employeeId);

    Task<EmployeeDetailDto> CreateAsync(ActorContext actor, CreateEmployeeRequest request);

    Task<EmployeeDetailDto> UpdateAsync(ActorContext actor, int employeeId, UpdateEmployeeRequest request);

    Task<EmployeeDetailDto> TransferAsync(ActorContext actor, int employeeId, TransferEmployeeRequest request);

    Task<EmployeeDetailDto> DeactivateAsync(ActorContext actor, int employeeId, DeactivateEmployeeRequest request);

    Task<IReadOnlyList<CardDto>> GetCardsAsync(ActorContext actor, int employeeId);

    Task<IReadOnlyList<EmployeeHistoryDto>> GetHistoryAsync(ActorContext actor, int employeeId);
}

public interface ICardRepository
{
    Task<PagedResult<CardDto>> SearchAsync(ActorContext actor, CardQuery query);

    Task<CardDto> CreateAsync(ActorContext actor, CreateCardRequest request);

    Task<CardDto> ActivateAsync(ActorContext actor, long cardId, byte[] version);

    Task<CardDto> BlockAsync(ActorContext actor, long cardId, string reason, byte[] version);

    Task<CardDto> ReportLostAsync(ActorContext actor, long cardId, string reason);

    Task<CardDto> ReplaceAsync(ActorContext actor, long cardId, ReplaceCardRequest request);

    Task<CardDto> DeactivateAsync(ActorContext actor, long cardId, string reason, byte[] version);

    Task<PagedResult<CardRequestDto>> SearchRequestsAsync(ActorContext actor, CardRequestQuery query);

    Task<CardRequestDto> CreateRequestAsync(ActorContext actor, CreateCardRequestRequest request);

    Task<CardRequestDto> DecideRequestAsync(ActorContext actor, long cardRequestId, CardRequestDecisionRequest request);
}

public interface IAccessRepository
{
    Task<PagedResult<AccessRequestDto>> SearchRequestsAsync(ActorContext actor, AccessRequestQuery query);

    Task<AccessRequestDetailDto> GetRequestAsync(ActorContext actor, long accessRequestId);

    Task<AccessRequestDetailDto> CreateRequestAsync(ActorContext actor, CreateAccessRequestRequest request);

    Task<AccessRequestDetailDto> UpdateRequestAsync(ActorContext actor, long accessRequestId, UpdateAccessRequestRequest request);

    Task<AccessRequestDetailDto> SubmitRequestAsync(ActorContext actor, long accessRequestId, byte[] version);

    Task<AccessRequestDetailDto> CancelRequestAsync(ActorContext actor, long accessRequestId, string reason, byte[] version);

    Task<PagedResult<PendingApprovalDto>> GetPendingApprovalsAsync(ActorContext actor, PagedQuery query);

    Task<AccessRequestDetailDto> DecideAsync(ActorContext actor, long accessRequestId, ApprovalDecisionRequest request);

    Task<PagedResult<AccessPermissionDto>> SearchPermissionsAsync(ActorContext actor, PermissionQuery query);

    Task<AccessPermissionDto> ProvisionAsync(ActorContext actor, long accessRequestId);

    Task<AccessPermissionDto> RevokeAsync(ActorContext actor, long permissionId, string reason);
}

public interface ISecurityRepository
{
    Task<RfidIngestResultDto> IngestEventAsync(ActorContext actor, RfidEventRequest request);

    Task<PagedResult<AccessLogDto>> SearchAccessLogsAsync(ActorContext actor, AccessLogQuery query);

    Task<PagedResult<ViolationDto>> SearchViolationsAsync(ActorContext actor, ViolationQuery query);

    Task<ViolationDto> ReviewViolationAsync(ActorContext actor, long violationId, ReviewViolationRequest request);

    Task<PagedResult<IncidentDto>> SearchIncidentsAsync(ActorContext actor, IncidentQuery query);

    Task<IncidentDetailDto> GetIncidentAsync(ActorContext actor, int incidentId);

    Task<IncidentDetailDto> CreateIncidentAsync(ActorContext actor, CreateIncidentRequest request);

    Task<IncidentDetailDto> UpdateIncidentAsync(ActorContext actor, int incidentId, UpdateIncidentRequest request);

    Task<PagedResult<BlacklistEntryDto>> SearchBlacklistAsync(ActorContext actor, BlacklistQuery query);

    Task<BlacklistEntryDto> CreateBlacklistAsync(ActorContext actor, CreateBlacklistRequest request);

    Task<BlacklistEntryDto> LiftBlacklistAsync(ActorContext actor, int blacklistId, string reason);
}

public interface IVisitorRepository
{
    Task<PagedResult<VisitorDto>> SearchVisitorsAsync(ActorContext actor, PagedQuery query);

    Task<VisitorDto> CreateVisitorAsync(ActorContext actor, CreateVisitorRequest request);

    Task<PagedResult<VisitorPassDto>> SearchPassesAsync(ActorContext actor, VisitorPassQuery query);

    Task<VisitorPassDto> CreatePassAsync(ActorContext actor, CreateVisitorPassRequest request);

    Task<VisitorPassDto> TransitionPassAsync(ActorContext actor, long visitorPassId, string action, string? comments);
}

public interface IInsightsRepository
{
    Task<DashboardSummaryDto> GetSummaryAsync(ActorContext actor);

    Task<IReadOnlyList<EventsTrendDto>> GetEventsTrendAsync(ActorContext actor, int days);

    Task<IReadOnlyList<LabelCountDto>> GetLabelCountsAsync(ActorContext actor, string procedure);

    Task<IReadOnlyList<OccupancyDto>> GetOccupancyAsync(ActorContext actor);

    Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync(ActorContext actor);

    Task<IReadOnlyList<ActivityDto>> GetActivityAsync(ActorContext actor, int top);

    Task<ReportResult> RunReportAsync(ActorContext actor, string procedure, ReportQuery query, bool export);

    Task<PagedResult<AuditLogDto>> SearchAuditAsync(ActorContext actor, AuditQuery query);

    Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(ActorContext actor, string entityType, string entityId);
}

public interface IAdminRepository
{
    Task<PagedResult<AdminUserDto>> SearchUsersAsync(ActorContext actor, AdminUserQuery query);

    Task<AdminUserDto> SaveUserAsync(ActorContext actor, int? userId, SaveAdminUserRequest request);

    Task<IReadOnlyList<RoleDto>> GetRolesAsync(ActorContext actor);

    Task<IReadOnlyList<RolePermissionDto>> GetRolePermissionsAsync(ActorContext actor, int roleId);

    Task<IReadOnlyList<RolePermissionDto>> SetRolePermissionsAsync(ActorContext actor, int roleId, IReadOnlyList<int> permissionIds);

    Task<IReadOnlyList<PermissionCatalogDto>> GetPermissionCatalogAsync(ActorContext actor);

    Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync(ActorContext actor);

    Task<DepartmentDto> SaveDepartmentAsync(ActorContext actor, int? departmentId, SaveDepartmentRequest request);

    Task<IReadOnlyList<LocationDto>> GetLocationsAsync(ActorContext actor);

    Task<LocationDto> SaveLocationAsync(ActorContext actor, int? locationId, SaveLocationRequest request);

    Task<IReadOnlyList<ReaderDto>> GetReadersAsync(ActorContext actor);

    Task<ReaderDto> SaveReaderAsync(ActorContext actor, bool isNew, string readerId, SaveReaderRequest request);

    Task<IReadOnlyList<SettingDto>> GetSettingsAsync(ActorContext actor);

    Task<IReadOnlyList<SettingDto>> UpdateSettingAsync(ActorContext actor, UpdateSettingRequest request);
}
