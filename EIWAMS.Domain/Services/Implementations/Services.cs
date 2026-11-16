using System.Globalization;
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
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
using EIWAMS.Application.Utilities;
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

public sealed class SecurityService(ISecurityRepository repository, ICurrentUserAccessor currentUser, ILogger<SecurityService> logger) : ISecurityService
{
    public async Task<RfidIngestResultDto> IngestEventAsync(RfidEventRequest request)
    {
        RfidIngestResultDto result = await repository.IngestEventAsync(currentUser.GetActor(), request);
        if (string.Equals(result.Decision, "Denied", StringComparison.OrdinalIgnoreCase) && !result.IsDuplicate)
        {
            // Never log the full card UID (SDD 15).
            logger.LogWarning("RFID event {ExternalEventId} at reader {ReaderId} denied: {DenialReason}.", request.ExternalEventId, request.ReaderId, result.DenialReason);
        }

        return result;
    }

    public Task<PagedResult<AccessLogDto>> SearchAccessLogsAsync(AccessLogQuery query) => repository.SearchAccessLogsAsync(currentUser.GetActor(), query);

    public Task<PagedResult<ViolationDto>> SearchViolationsAsync(ViolationQuery query) => repository.SearchViolationsAsync(currentUser.GetActor(), query);

    public Task<ViolationDto> ReviewViolationAsync(long violationId, ReviewViolationRequest request)
        => repository.ReviewViolationAsync(currentUser.GetActor(), violationId, request);

    public Task<PagedResult<IncidentDto>> SearchIncidentsAsync(IncidentQuery query) => repository.SearchIncidentsAsync(currentUser.GetActor(), query);

    public Task<IncidentDetailDto> GetIncidentAsync(int incidentId) => repository.GetIncidentAsync(currentUser.GetActor(), incidentId);

    public Task<IncidentDetailDto> CreateIncidentAsync(CreateIncidentRequest request) => repository.CreateIncidentAsync(currentUser.GetActor(), request);

    public Task<IncidentDetailDto> UpdateIncidentAsync(int incidentId, UpdateIncidentRequest request)
        => repository.UpdateIncidentAsync(currentUser.GetActor(), incidentId, request);

    public Task<PagedResult<BlacklistEntryDto>> SearchBlacklistAsync(BlacklistQuery query) => repository.SearchBlacklistAsync(currentUser.GetActor(), query);

    public Task<BlacklistEntryDto> CreateBlacklistAsync(CreateBlacklistRequest request) => repository.CreateBlacklistAsync(currentUser.GetActor(), request);

    public Task<BlacklistEntryDto> LiftBlacklistAsync(int blacklistId, ReasonRequest request)
        => repository.LiftBlacklistAsync(currentUser.GetActor(), blacklistId, request.Reason!.Trim());
}

public sealed class VisitorService(IVisitorRepository repository, ICurrentUserAccessor currentUser) : IVisitorService
{
    public Task<PagedResult<VisitorDto>> SearchVisitorsAsync(PagedQuery query) => repository.SearchVisitorsAsync(currentUser.GetActor(), query);

    public Task<VisitorDto> CreateVisitorAsync(CreateVisitorRequest request) => repository.CreateVisitorAsync(currentUser.GetActor(), request);

    public Task<PagedResult<VisitorPassDto>> SearchPassesAsync(VisitorPassQuery query) => repository.SearchPassesAsync(currentUser.GetActor(), query);

    public Task<VisitorPassDto> CreatePassAsync(CreateVisitorPassRequest request) => repository.CreatePassAsync(currentUser.GetActor(), request);

    public Task<VisitorPassDto> TransitionPassAsync(long visitorPassId, string action, string? comments)
    {
        if (!VisitorPassWorkflow.AllActions.Contains(action, StringComparer.OrdinalIgnoreCase))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, [$"Unknown visitor pass action '{action}'."]);
        }

        if (action == VisitorPassWorkflow.Revoke && string.IsNullOrWhiteSpace(comments))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, ["A reason is required to revoke a pass."]);
        }

        return repository.TransitionPassAsync(currentUser.GetActor(), visitorPassId, action, string.IsNullOrWhiteSpace(comments) ? null : comments.Trim());
    }
}

public sealed class InsightsService(IInsightsRepository repository, ICurrentUserAccessor currentUser) : IInsightsService
{
    public Task<HomeDashboardDto> GetHomeAsync() => repository.GetHomeAsync(currentUser.GetActor());

    public Task<DashboardSummaryDto> GetSummaryAsync() => repository.GetSummaryAsync(currentUser.GetActor());

    public Task<IReadOnlyList<EventsTrendDto>> GetEventsTrendAsync(int days) => repository.GetEventsTrendAsync(currentUser.GetActor(), Math.Clamp(days, 1, 90));

    public Task<IReadOnlyList<LabelCountDto>> GetRequestsByStatusAsync() => repository.GetLabelCountsAsync(currentUser.GetActor(), StoredProcedures.DashboardRequestsByStatus);

    public Task<IReadOnlyList<LabelCountDto>> GetViolationsByTypeAsync() => repository.GetLabelCountsAsync(currentUser.GetActor(), StoredProcedures.DashboardViolationsByType);

    public Task<IReadOnlyList<LabelCountDto>> GetCardsByStatusAsync() => repository.GetLabelCountsAsync(currentUser.GetActor(), StoredProcedures.DashboardCardsByStatus);

    public Task<IReadOnlyList<OccupancyDto>> GetOccupancyAsync() => repository.GetOccupancyAsync(currentUser.GetActor());

    public Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync() => repository.GetMyWorkAsync(currentUser.GetActor());

    public Task<IReadOnlyList<ActivityDto>> GetActivityAsync(int top) => repository.GetActivityAsync(currentUser.GetActor(), Math.Clamp(top, 1, 100));

    public async Task<PagedResult<IDictionary<string, object?>>> RunReportAsync(string reportName, ReportQuery query)
    {
        ReportResult result = await repository.RunReportAsync(currentUser.GetActor(), ResolveReport(reportName), query, export: false);
        string[] keys = result.Columns.Select(JsonNamingPolicy.CamelCase.ConvertName).ToArray();
        var items = result.Rows.Select(row =>
        {
            IDictionary<string, object?> item = new Dictionary<string, object?>(keys.Length);
            for (int i = 0; i < keys.Length; i++)
            {
                item[keys[i]] = row[i];
            }

            return item;
        }).ToList();
        return new PagedResult<IDictionary<string, object?>> { Items = items, TotalCount = result.TotalCount, Page = result.Page, PageSize = result.PageSize };
    }

    public async Task<(byte[] Content, string FileName)> ExportReportAsync(string reportName, ReportQuery query)
    {
        ReportResult result = await repository.RunReportAsync(currentUser.GetActor(), ResolveReport(reportName), query, export: true);
        string fileName = string.Create(CultureInfo.InvariantCulture, $"{reportName.ToLowerInvariant()}-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv");
        return (CsvWriter.Write(result.Columns, result.Rows), fileName);
    }

    public Task<PagedResult<AuditLogDto>> SearchAuditAsync(AuditQuery query) => repository.SearchAuditAsync(currentUser.GetActor(), query);

    public Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(AuditTimelineQuery query)
    {
        if (string.IsNullOrWhiteSpace(query.EntityType) || string.IsNullOrWhiteSpace(query.EntityId))
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, ["entityType and entityId are required."]);
        }

        return repository.GetTimelineAsync(currentUser.GetActor(), query.EntityType.Trim(), query.EntityId.Trim());
    }

    private static string ResolveReport(string reportName)
        => ReportNames.ProcedureByName.TryGetValue(reportName ?? string.Empty, out string? procedure)
            ? procedure
            : throw AppException.NotFound(ApiMessages.NotFound);
}

public sealed class AdminService(IAdminRepository repository, ICurrentUserAccessor currentUser) : IAdminService
{
    public Task<PagedResult<AdminUserDto>> SearchUsersAsync(AdminUserQuery query) => repository.SearchUsersAsync(currentUser.GetActor(), query);

    public Task<AdminUserDto> CreateUserAsync(SaveAdminUserRequest request) => repository.SaveUserAsync(currentUser.GetActor(), null, request);

    public Task<AdminUserDto> UpdateUserAsync(int userId, SaveAdminUserRequest request) => repository.SaveUserAsync(currentUser.GetActor(), userId, request);

    public Task<IReadOnlyList<RoleDto>> GetRolesAsync() => repository.GetRolesAsync(currentUser.GetActor());

    public Task<IReadOnlyList<RolePermissionDto>> GetRolePermissionsAsync(int roleId) => repository.GetRolePermissionsAsync(currentUser.GetActor(), roleId);

    public Task<IReadOnlyList<RolePermissionDto>> SetRolePermissionsAsync(int roleId, SetRolePermissionsRequest request)
        => repository.SetRolePermissionsAsync(currentUser.GetActor(), roleId, request.PermissionIds ?? []);

    public Task<IReadOnlyList<PermissionCatalogDto>> GetPermissionCatalogAsync() => repository.GetPermissionCatalogAsync(currentUser.GetActor());

    public Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync() => repository.GetDepartmentsAsync(currentUser.GetActor());

    public Task<DepartmentDto> SaveDepartmentAsync(int? departmentId, SaveDepartmentRequest request)
        => repository.SaveDepartmentAsync(currentUser.GetActor(), departmentId, request);

    public Task<IReadOnlyList<LocationDto>> GetLocationsAsync() => repository.GetLocationsAsync(currentUser.GetActor());

    public Task<LocationDto> SaveLocationAsync(int? locationId, SaveLocationRequest request)
        => repository.SaveLocationAsync(currentUser.GetActor(), locationId, request);

    public Task<IReadOnlyList<ReaderDto>> GetReadersAsync() => repository.GetReadersAsync(currentUser.GetActor());

    public Task<ReaderDto> CreateReaderAsync(SaveReaderRequest request)
        => repository.SaveReaderAsync(currentUser.GetActor(), true, request.ReaderId!, request);

    public Task<ReaderDto> UpdateReaderAsync(string readerId, SaveReaderRequest request)
        => repository.SaveReaderAsync(currentUser.GetActor(), false, readerId, request);

    public Task<IReadOnlyList<SettingDto>> GetSettingsAsync() => repository.GetSettingsAsync(currentUser.GetActor());

    public Task<IReadOnlyList<SettingDto>> UpdateSettingAsync(UpdateSettingRequest request) => repository.UpdateSettingAsync(currentUser.GetActor(), request);
}
