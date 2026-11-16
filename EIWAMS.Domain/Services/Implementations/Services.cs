using System.Text.Json;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Domain.Services.Interfaces;
using EIWAMS.Domain.Workflow;
using EIWAMS.Infrastructure.Repositories.Interfaces;
using Microsoft.Extensions.Logging;

namespace EIWAMS.Domain.Services.Implementations;

public sealed class IdentityService(IIdentityRepository repository, ICurrentUserAccessor currentUser) : IIdentityService
{
    public CurrentUserDto GetMe() => currentUser.User ?? throw AppException.Unauthorized(ApiMessages.Unauthenticated);

    public Task<IReadOnlyList<DevUserDto>> GetDevUsersAsync() => repository.GetDevUsersAsync();

    public Task<IReadOnlyList<MenuItemDto>> GetMenuAsync() => repository.GetMenuAsync(currentUser.GetActor());

    public Task<LookupsDto> GetLookupsAsync() => repository.GetLookupsAsync(currentUser.GetActor());

    public Task<MyProfileDto> GetMyProfileAsync() => repository.GetMyProfileAsync(currentUser.GetActor());

    public Task<MyProfileDto> UpdateMyProfileAsync(UpdateMyProfileRequest request)
        => repository.UpdateMyProfileAsync(currentUser.GetActor(), request);

    public Task<PhotoDto> GetMyPhotoAsync() => repository.GetMyPhotoAsync(currentUser.GetActor());

    public Task<PhotoInfoDto> PutMyPhotoAsync(PhotoUploadRequest request)
    {
        ValidatePhoto(request);
        return repository.PutMyPhotoAsync(currentUser.GetActor(), request);
    }

    private static void ValidatePhoto(PhotoUploadRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.PhotoBase64) || string.IsNullOrWhiteSpace(request.PhotoContentType))
            throw AppException.Validation(ApiMessages.ValidationFailed, ["photoContentType and photoBase64 are required."]);
        string value = request.PhotoBase64.Trim();
        int comma = value.IndexOf(',');
        if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
            value = value[(comma + 1)..];
        byte[] bytes;
        try { bytes = Convert.FromBase64String(value); }
        catch (FormatException) { throw AppException.Validation(ApiMessages.ValidationFailed, ["photoBase64 must be valid base64."]); }
        bool signatureMatches = request.PhotoContentType switch
        {
            "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
            "image/png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            _ => false
        };
        if (bytes.Length is < 1 or > 1_048_576 || !signatureMatches)
            throw AppException.Validation(ApiMessages.ValidationFailed, ["Photo must be JPEG or PNG and no larger than 1 MB."]);
    }

    public Task<PagedResult<NotificationDto>> GetNotificationsAsync(NotificationQuery query)
        => repository.SearchNotificationsAsync(currentUser.GetActor(), query);

    public Task<CountDto> GetUnreadCountAsync() => repository.GetUnreadNotificationCountAsync(currentUser.GetActor());

    public async Task<bool> MarkReadAsync(long notificationId)
        => await repository.MarkNotificationReadAsync(currentUser.GetActor(), notificationId)
            ? true
            : throw AppException.NotFound(ApiMessages.NotFound);

    public Task<CountDto> MarkAllReadAsync() => repository.MarkAllNotificationsReadAsync(currentUser.GetActor());
}

public sealed class EmployeeService(IEmployeeRepository repository, ICurrentUserAccessor currentUser, ILogger<EmployeeService> logger) : IEmployeeService
{
    public Task<PagedResult<EmployeeListItemDto>> SearchAsync(EmployeeQuery query) => repository.SearchAsync(currentUser.GetActor(), query);

    public Task<EmployeeDetailDto> GetAsync(int employeeId) => repository.GetAsync(currentUser.GetActor(), employeeId);

    public async Task<EmployeeDetailDto> CreateAsync(CreateEmployeeRequest request)
    {
        EmployeeDetailDto created = await repository.CreateAsync(currentUser.GetActor(), request);
        logger.LogInformation("Employee {EmployeeId} created by user {UserId}.", created.EmployeeId, currentUser.User?.UserId);
        return created;
    }

    public Task<EmployeeDetailDto> UpdateAsync(int employeeId, UpdateEmployeeRequest request)
        => repository.UpdateAsync(currentUser.GetActor(), employeeId, request);

    public Task<EmployeeDetailDto> TransferAsync(int employeeId, TransferEmployeeRequest request)
        => repository.TransferAsync(currentUser.GetActor(), employeeId, request);

    public async Task<EmployeeDetailDto> DeactivateAsync(int employeeId, DeactivateEmployeeRequest request)
    {
        EmployeeDetailDto result = await repository.DeactivateAsync(currentUser.GetActor(), employeeId, request);
        logger.LogInformation("Employee {EmployeeId} set to {Status} by user {UserId}; cards and permissions revoked.", employeeId, result.EmploymentStatus, currentUser.User?.UserId);
        return result;
    }

    public Task<IReadOnlyList<CardDto>> GetCardsAsync(int employeeId) => repository.GetCardsAsync(currentUser.GetActor(), employeeId);

    public Task<IReadOnlyList<EmployeeHistoryDto>> GetHistoryAsync(int employeeId) => repository.GetHistoryAsync(currentUser.GetActor(), employeeId);

    public Task<PhotoDto> GetPhotoAsync(int employeeId) => repository.GetPhotoAsync(currentUser.GetActor(), employeeId);

    public Task<EmployeeSyncResultDto> SyncAsync(EmployeeSyncRequest request) => repository.SyncAsync(currentUser.GetActor(), request);
}

public sealed class CardService(ICardRepository repository, ICurrentUserAccessor currentUser, ILogger<CardService> logger) : ICardService
{
    public Task<PagedResult<CardDto>> SearchAsync(CardQuery query) => repository.SearchAsync(currentUser.GetActor(), query);

    public Task<CardDto> CreateAsync(CreateCardRequest request) => repository.CreateAsync(currentUser.GetActor(), request);

    public Task<CardDto> ActivateAsync(long cardId, VersionRequest request) => repository.ActivateAsync(currentUser.GetActor(), cardId, request.Version!);

    public Task<CardDto> BlockAsync(long cardId, ReasonVersionRequest request)
        => repository.BlockAsync(currentUser.GetActor(), cardId, request.Reason!.Trim(), request.Version!);

    public async Task<CardDto> ReportLostAsync(long cardId, ReasonRequest request)
    {
        CardDto card = await repository.ReportLostAsync(currentUser.GetActor(), cardId, request.Reason!.Trim());
        logger.LogWarning("Card {CardId} ({MaskedUid}) reported lost by user {UserId}; blocked immediately.", cardId, card.MaskedCardUid, currentUser.User?.UserId);
        return card;
    }

    public Task<CardDto> ReplaceAsync(long cardId, ReplaceCardRequest request) => repository.ReplaceAsync(currentUser.GetActor(), cardId, request);

    public Task<CardDto> DeactivateAsync(long cardId, ReasonVersionRequest request)
        => repository.DeactivateAsync(currentUser.GetActor(), cardId, request.Reason!.Trim(), request.Version!);

    public Task<PagedResult<CardRequestDto>> SearchRequestsAsync(CardRequestQuery query) => repository.SearchRequestsAsync(currentUser.GetActor(), query);

    public Task<PagedResult<CardRequestDto>> QueueRequestsAsync(CardRequestQueueQuery query)
        => repository.QueueRequestsAsync(currentUser.GetActor(), query);

    public Task<CardRequestDetailDto> GetRequestAsync(long cardRequestId)
        => repository.GetRequestAsync(currentUser.GetActor(), cardRequestId);

    public Task<CardRequestDetailDto> CreateRequestAsync(CreateCardRequestRequest request)
        => repository.CreateRequestAsync(currentUser.GetActor(), request);

    public Task<CardRequestDetailDto> DecideRequestAsync(long cardRequestId, CardRequestDecisionRequest request)
    {
        if (request.Action == "Reject" && string.IsNullOrWhiteSpace(request.Comments))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, ["Comments are required when rejecting a card request."]);
        }

        return repository.DecideRequestAsync(currentUser.GetActor(), cardRequestId, request);
    }
}

public sealed class AccessService(IAccessRepository repository, ICurrentUserAccessor currentUser, ILogger<AccessService> logger) : IAccessService
{
    public Task<PagedResult<AccessRequestDto>> SearchRequestsAsync(AccessRequestQuery query) => repository.SearchRequestsAsync(currentUser.GetActor(), query);

    public Task<AccessRequestDetailDto> GetRequestAsync(long accessRequestId) => repository.GetRequestAsync(currentUser.GetActor(), accessRequestId);

    public Task<AccessRequestDetailDto> CreateRequestAsync(CreateAccessRequestRequest request) => repository.CreateRequestAsync(currentUser.GetActor(), request);

    public Task<AccessRequestDetailDto> UpdateRequestAsync(long accessRequestId, UpdateAccessRequestRequest request)
        => repository.UpdateRequestAsync(currentUser.GetActor(), accessRequestId, request);

    public Task<AccessRequestDetailDto> SubmitRequestAsync(long accessRequestId, VersionRequest request)
        => repository.SubmitRequestAsync(currentUser.GetActor(), accessRequestId, request.Version!);

    public Task<AccessRequestDetailDto> CancelRequestAsync(long accessRequestId, ReasonVersionRequest request)
        => repository.CancelRequestAsync(currentUser.GetActor(), accessRequestId, request.Reason!.Trim(), request.Version!);

    public Task<PagedResult<PendingApprovalDto>> GetPendingApprovalsAsync(ApprovalQueueQuery query) => repository.GetPendingApprovalsAsync(currentUser.GetActor(), query);

    public Task<PagedResult<TeamRequestItemDto>> GetTeamApprovalsAsync(TeamRequestQuery query) => repository.GetTeamApprovalsAsync(currentUser.GetActor(), query);

    public async Task<AccessRequestDetailDto> DecideAsync(long accessRequestId, ApprovalDecisionRequest request)
    {
        if (AccessRequestWorkflow.RequiresComments(request.Decision!) && string.IsNullOrWhiteSpace(request.Comments))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, ["Comments are required to return or reject a request."]);
        }

        AccessRequestDetailDto result = await repository.DecideAsync(currentUser.GetActor(), accessRequestId, request);
        logger.LogInformation("Access request {AccessRequestId} decision {Decision} by user {UserId}; status now {Status}.", accessRequestId, request.Decision, currentUser.User?.UserId, result.Status);
        return result;
    }

    public Task<PagedResult<AccessPermissionDto>> SearchPermissionsAsync(PermissionQuery query) => repository.SearchPermissionsAsync(currentUser.GetActor(), query);

    public Task<AccessPermissionDto> ProvisionAsync(ProvisionPermissionRequest request) => repository.ProvisionAsync(currentUser.GetActor(), request.AccessRequestId);

    public Task<AccessPermissionDto> RevokeAsync(long permissionId, ReasonRequest request)
        => repository.RevokeAsync(currentUser.GetActor(), permissionId, request.Reason!.Trim());
}

public sealed class InsightsService(IInsightsRepository repository, ICurrentUserAccessor currentUser) : IInsightsService
{
    public Task<HomeDashboardDto> GetHomeAsync() => repository.GetHomeAsync(currentUser.GetActor());

    public Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync() => repository.GetMyWorkAsync(currentUser.GetActor());

    public Task<IReadOnlyList<ActivityDto>> GetActivityAsync(int top) => repository.GetActivityAsync(currentUser.GetActor(), Math.Clamp(top, 1, 100));

    public Task<PagedResult<AuditLogDto>> SearchAuditAsync(AuditQuery query) => repository.SearchAuditAsync(currentUser.GetActor(), query);

    public Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(AuditTimelineQuery query)
    {
        if (string.IsNullOrWhiteSpace(query.EntityType) || string.IsNullOrWhiteSpace(query.EntityId))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, ["entityType and entityId are required."]);
        }

        return repository.GetTimelineAsync(currentUser.GetActor(), query.EntityType.Trim(), query.EntityId.Trim());
    }
}

public sealed class AdminService(IAdminRepository repository, ICurrentUserAccessor currentUser) : IAdminService
{
    public Task<PagedResult<AdminUserDto>> SearchUsersAsync(AdminUserQuery query) => repository.SearchUsersAsync(currentUser.GetActor(), query);

    public Task<AdminUserDto> UpdateEmployeeAsync(int employeeId, SaveAdminUserRequest request)
        => repository.SaveEmployeeAsync(currentUser.GetActor(), employeeId, request);

    public Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync() => repository.GetDepartmentsAsync(currentUser.GetActor());

    public Task<DepartmentDto> SaveDepartmentAsync(int? departmentId, SaveDepartmentRequest request)
        => repository.SaveDepartmentAsync(currentUser.GetActor(), departmentId, request);

    public Task<IReadOnlyList<LocationDto>> GetLocationsAsync() => repository.GetLocationsAsync(currentUser.GetActor());

    public Task<LocationDto> SaveLocationAsync(int? locationId, SaveLocationRequest request)
        => repository.SaveLocationAsync(currentUser.GetActor(), locationId, request);
}
