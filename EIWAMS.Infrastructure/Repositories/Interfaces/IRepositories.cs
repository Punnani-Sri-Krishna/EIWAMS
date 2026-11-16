using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Infrastructure.Auth;

namespace EIWAMS.Infrastructure.Repositories.Interfaces;

public interface IIdentityRepository
{
    Task<CurrentUserDto?> GetUserContextAsync(int userId);

    Task<EntraUserDto?> ResolveEntraUserAsync(TokenIdentity identity);

    Task<IReadOnlyList<DevUserDto>> GetDevUsersAsync();

    Task<IReadOnlyList<MenuItemDto>> GetMenuAsync(ActorContext actor);

    Task<LookupsDto> GetLookupsAsync(ActorContext actor);

    Task<MyProfileDto> GetMyProfileAsync(ActorContext actor);

    Task<MyProfileDto> UpdateMyProfileAsync(ActorContext actor, UpdateMyProfileRequest request);

    Task<PhotoDto> GetMyPhotoAsync(ActorContext actor);

    Task<PhotoInfoDto> PutMyPhotoAsync(ActorContext actor, PhotoUploadRequest request);

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

    Task<PhotoDto> GetPhotoAsync(ActorContext actor, int employeeId);

    Task<EmployeeSyncResultDto> SyncAsync(ActorContext actor, EmployeeSyncRequest request);
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

    Task<PagedResult<CardRequestDto>> QueueRequestsAsync(ActorContext actor, CardRequestQueueQuery query);

    Task<CardRequestDetailDto> GetRequestAsync(ActorContext actor, long cardRequestId);

    Task<CardRequestDetailDto> CreateRequestAsync(ActorContext actor, CreateCardRequestRequest request);

    Task<CardRequestDetailDto> DecideRequestAsync(ActorContext actor, long cardRequestId, CardRequestDecisionRequest request);
}

public interface IAccessRepository
{
    Task<PagedResult<AccessRequestDto>> SearchRequestsAsync(ActorContext actor, AccessRequestQuery query);

    Task<AccessRequestDetailDto> GetRequestAsync(ActorContext actor, long accessRequestId);

    Task<AccessRequestDetailDto> CreateRequestAsync(ActorContext actor, CreateAccessRequestRequest request);

    Task<AccessRequestDetailDto> UpdateRequestAsync(ActorContext actor, long accessRequestId, UpdateAccessRequestRequest request);

    Task<AccessRequestDetailDto> SubmitRequestAsync(ActorContext actor, long accessRequestId, byte[] version);

    Task<AccessRequestDetailDto> CancelRequestAsync(ActorContext actor, long accessRequestId, string reason, byte[] version);

    Task<PagedResult<PendingApprovalDto>> GetPendingApprovalsAsync(ActorContext actor, ApprovalQueueQuery query);

    Task<PagedResult<TeamRequestItemDto>> GetTeamApprovalsAsync(ActorContext actor, TeamRequestQuery query);

    Task<AccessRequestDetailDto> DecideAsync(ActorContext actor, long accessRequestId, ApprovalDecisionRequest request);

    Task<PagedResult<AccessPermissionDto>> SearchPermissionsAsync(ActorContext actor, PermissionQuery query);

    Task<AccessPermissionDto> ProvisionAsync(ActorContext actor, long accessRequestId);

    Task<AccessPermissionDto> RevokeAsync(ActorContext actor, long permissionId, string reason);
}

public interface IInsightsRepository
{
    Task<HomeDashboardDto> GetHomeAsync(ActorContext actor);

    Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync(ActorContext actor);

    Task<IReadOnlyList<ActivityDto>> GetActivityAsync(ActorContext actor, int top);

    Task<PagedResult<AuditLogDto>> SearchAuditAsync(ActorContext actor, AuditQuery query);

    Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(ActorContext actor, string entityType, string entityId);
}

public interface IAdminRepository
{
    Task<PagedResult<AdminUserDto>> SearchUsersAsync(ActorContext actor, AdminUserQuery query);

    Task<AdminUserDto> SaveEmployeeAsync(ActorContext actor, int employeeId, SaveAdminUserRequest request);

    Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync(ActorContext actor);

    Task<DepartmentDto> SaveDepartmentAsync(ActorContext actor, int? departmentId, SaveDepartmentRequest request);

    Task<IReadOnlyList<LocationDto>> GetLocationsAsync(ActorContext actor);

    Task<LocationDto> SaveLocationAsync(ActorContext actor, int? locationId, SaveLocationRequest request);
}
