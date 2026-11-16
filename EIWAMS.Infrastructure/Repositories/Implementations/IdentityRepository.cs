using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Infrastructure.Auth;
using EIWAMS.Infrastructure.DataAccessLayer;
using EIWAMS.Infrastructure.Repositories.Interfaces;

namespace EIWAMS.Infrastructure.Repositories.Implementations;

public sealed class IdentityRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IIdentityRepository
{
    public Task<CurrentUserDto?> GetUserContextAsync(int userId)
        => QueryMultipleAsync(StoredProcedures.UserGetContext, new { UserId = userId }, async grid =>
        {
            CurrentUserDto? user = await grid.ReadFirstOrDefaultAsync<CurrentUserDto>();
            if (user is null)
            {
                return null;
            }

            user.Roles = (await grid.ReadAsync<string>()).AsList();
            user.Permissions = (await grid.ReadAsync<string>()).AsList();
            user.FacilityIds = (await grid.ReadAsync<int>()).AsList();
            return user;
        });

    public Task<EntraUserDto?> ResolveEntraUserAsync(TokenIdentity identity)
        => QuerySingleOrDefaultAsync<EntraUserDto>(StoredProcedures.UserResolveEntra, new
        {
            identity.TenantId,
            identity.ObjectId,
            identity.Email,
            identity.DisplayName,
        });

    public async Task<IReadOnlyList<DevUserDto>> GetDevUsersAsync()
    {
        IReadOnlyList<DevUserRow> rows = await QueryAsync<DevUserRow>(StoredProcedures.UserListForSwitch, null);
        return rows.Select(r => new DevUserDto
        {
            UserId = r.UserId,
            DisplayName = r.DisplayName,
            Email = r.Email,
            Roles = (r.Roles ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        }).ToList();
    }

    public Task<IReadOnlyList<MenuItemDto>> GetMenuAsync(ActorContext actor)
        => QueryAsync<MenuItemDto>(StoredProcedures.MenuGetForUser, Read(actor));

    public Task<LookupsDto> GetLookupsAsync(ActorContext actor)
        => QueryMultipleAsync(StoredProcedures.LookupGetAll, Read(actor), async grid => new LookupsDto
        {
            Departments = (await grid.ReadAsync<CodeLookupDto>()).AsList(),
            Locations = (await grid.ReadAsync<LocationLookupDto>()).AsList(),
            Employees = (await grid.ReadAsync<EmployeeLookupDto>()).AsList(),
            Users = (await grid.ReadAsync<NameLookupDto>()).AsList(),
            EmployeeTypes = LookupValues.EmployeeTypes,
            EmploymentStatuses = LookupValues.EmploymentStatuses,
            CardTypes = LookupValues.CardTypes,
            CardStatuses = LookupValues.CardStatuses,
            CardRequestTypes = LookupValues.CardRequestTypes,
            CardRequestTypesOffered = LookupValues.CardRequestTypesOffered,
            CardRequestStatuses = LookupValues.CardRequestStatuses,
            CardRequestStages = LookupValues.CardRequestStages,
            CardRequestActions = LookupValues.CardRequestActions,
            DamagedReasons = LookupValues.DamagedReasons,
            BloodGroups = LookupValues.BloodGroups,
            AccessTypes = LookupValues.AccessTypes,
            DurationCodes = LookupValues.DurationCodes,
            AccessRequestStatuses = LookupValues.AccessRequestStatuses,
            ApprovalStages = LookupValues.ApprovalStages,
            PermissionStatuses = LookupValues.PermissionStatuses,
            EventTypes = LookupValues.EventTypes,
            ViolationTypes = LookupValues.ViolationTypes,
            ViolationStatuses = LookupValues.ViolationStatuses,
            Severities = LookupValues.Severities,
            IncidentTypes = LookupValues.IncidentTypes,
            IncidentStatuses = LookupValues.IncidentStatuses,
            VisitorPassStatuses = LookupValues.VisitorPassStatuses,
            LocationTypes = LookupValues.LocationTypes,
        });

    public Task<MyProfileDto> GetMyProfileAsync(ActorContext actor)
        => QueryMultipleAsync(StoredProcedures.MeGetProfile, Read(actor), async grid =>
        {
            MyProfileDto profile = await grid.ReadFirstOrDefaultAsync<MyProfileDto>()
                ?? throw AppException.NotFound(ApiMessages.NotFound);
            profile.ActiveCard = await grid.ReadFirstOrDefaultAsync<ActiveCardDto>();
            return profile;
        });

    public Task<MyProfileDto> UpdateMyProfileAsync(ActorContext actor, UpdateMyProfileRequest request)
        => QueryMultipleAsync(StoredProcedures.MeUpdateProfile, Write(actor, new
        {
            request.MobileNumber,
            request.Address,
            request.BloodGroup,
            request.EmergencyContactName,
            request.EmergencyContactNumber,
        }), async grid =>
        {
            MyProfileDto profile = await grid.ReadFirstOrDefaultAsync<MyProfileDto>()
                ?? throw AppException.NotFound(ApiMessages.NotFound);
            profile.ActiveCard = await grid.ReadFirstOrDefaultAsync<ActiveCardDto>();
            return profile;
        });

    public async Task<PhotoDto> GetMyPhotoAsync(ActorContext actor)
    {
        PhotoRecord row = await QuerySingleAsync<PhotoRecord>(StoredProcedures.MeGetPhoto, Read(actor));
        return ToPhotoDto(row);
    }

    public async Task<PhotoInfoDto> PutMyPhotoAsync(ActorContext actor, PhotoUploadRequest request)
    {
        byte[] bytes = DecodePhoto(request.PhotoBase64!);
        PhotoInfoDto result = await QuerySingleAsync<PhotoInfoDto>(StoredProcedures.MePutPhoto, Write(actor, new
        {
            request.PhotoContentType,
            Photo = bytes,
        }));
        return result;
    }

    private static PhotoDto ToPhotoDto(PhotoRecord row) => new()
    {
        ContentType = row.ContentType,
        PhotoBase64 = Convert.ToBase64String(row.Photo),
        SizeBytes = row.SizeBytes,
        UploadedAtUtc = row.UploadedAtUtc,
    };

    private static byte[] DecodePhoto(string input)
    {
        string value = input.Trim();
        int comma = value.IndexOf(',');
        if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
            value = value[(comma + 1)..];
        return Convert.FromBase64String(value);
    }

    private sealed class PhotoRecord
    {
        public string ContentType { get; set; } = string.Empty;
        public byte[] Photo { get; set; } = [];
        public int SizeBytes { get; set; }
        public DateTime UploadedAtUtc { get; set; }
    }

    public Task<PagedResult<NotificationDto>> SearchNotificationsAsync(ActorContext actor, NotificationQuery query)
        => QueryPagedAsync<NotificationDto>(StoredProcedures.NotificationSearch, Read(actor, new { UnreadOnly = query.UnreadOnly ?? false }), query.Page, query.PageSize);

    public Task<CountDto> GetUnreadNotificationCountAsync(ActorContext actor)
        => QuerySingleAsync<CountDto>(StoredProcedures.NotificationUnreadCount, Read(actor));

    public Task<bool> MarkNotificationReadAsync(ActorContext actor, long notificationId)
        => QuerySingleAsync<bool>(StoredProcedures.NotificationMarkRead, Write(actor, new { NotificationId = notificationId }));

    public Task<CountDto> MarkAllNotificationsReadAsync(ActorContext actor)
        => QuerySingleAsync<CountDto>(StoredProcedures.NotificationMarkAllRead, Write(actor));

    private sealed class DevUserRow
    {
        public int UserId { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;

        public string? Roles { get; set; }
    }
}
