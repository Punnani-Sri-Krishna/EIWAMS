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
            Readers = (await grid.ReadAsync<ReaderLookupDto>()).AsList(),
            EmployeeTypes = LookupValues.EmployeeTypes,
            EmploymentStatuses = LookupValues.EmploymentStatuses,
            CardTypes = LookupValues.CardTypes,
            CardStatuses = LookupValues.CardStatuses,
            CardRequestTypes = LookupValues.CardRequestTypes,
            CardRequestStatuses = LookupValues.CardRequestStatuses,
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
