using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Application.Models.DTOs.Insights;

namespace EIWAMS.Domain.Services.Interfaces;

public interface IIdentityService
{
    CurrentUserDto GetMe();

    Task<IReadOnlyList<DevUserDto>> GetDevUsersAsync();

    Task<IReadOnlyList<MenuItemDto>> GetMenuAsync();

    Task<LookupsDto> GetLookupsAsync();

    Task<MyProfileDto> GetMyProfileAsync();

    Task<MyProfileDto> UpdateMyProfileAsync(UpdateMyProfileRequest request);

    Task<PhotoDto> GetMyPhotoAsync();

    Task<PhotoInfoDto> PutMyPhotoAsync(PhotoUploadRequest request);

    Task<PagedResult<NotificationDto>> GetNotificationsAsync(NotificationQuery query);

    Task<CountDto> GetUnreadCountAsync();

    Task<bool> MarkReadAsync(long notificationId);

    Task<CountDto> MarkAllReadAsync();
}

public interface IEmployeeService
{
    Task<PagedResult<EmployeeListItemDto>> SearchAsync(EmployeeQuery query);

    Task<EmployeeDetailDto> GetAsync(int employeeId);

    Task<EmployeeDetailDto> CreateAsync(CreateEmployeeRequest request);

    Task<EmployeeDetailDto> UpdateAsync(int employeeId, UpdateEmployeeRequest request);

    Task<EmployeeDetailDto> TransferAsync(int employeeId, TransferEmployeeRequest request);

    Task<EmployeeDetailDto> DeactivateAsync(int employeeId, DeactivateEmployeeRequest request);

    Task<IReadOnlyList<CardDto>> GetCardsAsync(int employeeId);

    Task<IReadOnlyList<EmployeeHistoryDto>> GetHistoryAsync(int employeeId);

    Task<PhotoDto> GetPhotoAsync(int employeeId);

    Task<EmployeeSyncResultDto> SyncAsync(EmployeeSyncRequest request);
}

public interface ICardService
{
    Task<PagedResult<CardDto>> SearchAsync(CardQuery query);

    Task<CardDto> CreateAsync(CreateCardRequest request);

    Task<CardDto> ActivateAsync(long cardId, VersionRequest request);

    Task<CardDto> BlockAsync(long cardId, ReasonVersionRequest request);

    Task<CardDto> ReportLostAsync(long cardId, ReasonRequest request);

    Task<CardDto> ReplaceAsync(long cardId, ReplaceCardRequest request);

    Task<CardDto> DeactivateAsync(long cardId, ReasonVersionRequest request);

    Task<PagedResult<CardRequestDto>> SearchRequestsAsync(CardRequestQuery query);

    Task<PagedResult<CardRequestDto>> QueueRequestsAsync(CardRequestQueueQuery query);

    Task<CardRequestDetailDto> GetRequestAsync(long cardRequestId);

    Task<CardRequestDetailDto> CreateRequestAsync(CreateCardRequestRequest request);

    Task<CardRequestDetailDto> DecideRequestAsync(long cardRequestId, CardRequestDecisionRequest request);
}

public interface IAccessService
{
    Task<PagedResult<AccessRequestDto>> SearchRequestsAsync(AccessRequestQuery query);

    Task<AccessRequestDetailDto> GetRequestAsync(long accessRequestId);

    Task<AccessRequestDetailDto> CreateRequestAsync(CreateAccessRequestRequest request);

    Task<AccessRequestDetailDto> UpdateRequestAsync(long accessRequestId, UpdateAccessRequestRequest request);

    Task<AccessRequestDetailDto> SubmitRequestAsync(long accessRequestId, VersionRequest request);

    Task<AccessRequestDetailDto> CancelRequestAsync(long accessRequestId, ReasonVersionRequest request);

    Task<PagedResult<PendingApprovalDto>> GetPendingApprovalsAsync(ApprovalQueueQuery query);

    Task<PagedResult<TeamRequestItemDto>> GetTeamApprovalsAsync(TeamRequestQuery query);

    Task<AccessRequestDetailDto> DecideAsync(long accessRequestId, ApprovalDecisionRequest request);

    Task<PagedResult<AccessPermissionDto>> SearchPermissionsAsync(PermissionQuery query);

    Task<AccessPermissionDto> ProvisionAsync(ProvisionPermissionRequest request);

    Task<AccessPermissionDto> RevokeAsync(long permissionId, ReasonRequest request);
}

public interface IInsightsService
{
    Task<HomeDashboardDto> GetHomeAsync();

    Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync();

    Task<IReadOnlyList<ActivityDto>> GetActivityAsync(int top);

    Task<PagedResult<AuditLogDto>> SearchAuditAsync(AuditQuery query);

    Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(AuditTimelineQuery query);
}

public interface IAdminService
{
    Task<PagedResult<AdminUserDto>> SearchUsersAsync(AdminUserQuery query);

    Task<AdminUserDto> UpdateEmployeeAsync(int employeeId, SaveAdminUserRequest request);

    Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync();

    Task<DepartmentDto> SaveDepartmentAsync(int? departmentId, SaveDepartmentRequest request);

    Task<IReadOnlyList<LocationDto>> GetLocationsAsync();

    Task<LocationDto> SaveLocationAsync(int? locationId, SaveLocationRequest request);
}
