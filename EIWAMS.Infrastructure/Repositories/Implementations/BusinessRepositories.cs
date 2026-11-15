using System.Data;
using System.Globalization;
using System.Text.Json;
using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
using EIWAMS.Infrastructure.DataAccessLayer;
using EIWAMS.Infrastructure.Repositories.Interfaces;

namespace EIWAMS.Infrastructure.Repositories.Implementations;

public sealed class AccessRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IAccessRepository
{
    public Task<PagedResult<AccessRequestDto>> SearchRequestsAsync(ActorContext actor, AccessRequestQuery query)
        => QueryPagedAsync<AccessRequestDto>(StoredProcedures.AccessRequestSearch, Read(actor, new
        {
            query.Status,
            query.CurrentStage,
            query.LocationId,
            query.EmployeeId,
            Mine = query.Mine ?? false,
            query.Search,
            query.SortBy,
            query.SortDir,
        }), query.Page, query.PageSize);

    public Task<AccessRequestDetailDto> GetRequestAsync(ActorContext actor, long accessRequestId)
        => ReadDetailAsync(StoredProcedures.AccessRequestGet, Read(actor, new { AccessRequestId = accessRequestId }));

    public Task<AccessRequestDetailDto> CreateRequestAsync(ActorContext actor, CreateAccessRequestRequest r)
        => ReadDetailAsync(StoredProcedures.AccessRequestCreate, Write(actor, new
        {
            r.EmployeeId,
            r.LocationId,
            BusinessJustification = r.BusinessJustification!.Trim(),
            r.ValidFromUtc,
            r.ValidToUtc,
            r.Submit,
        }));

    public Task<AccessRequestDetailDto> UpdateRequestAsync(ActorContext actor, long accessRequestId, UpdateAccessRequestRequest r)
        => ReadDetailAsync(StoredProcedures.AccessRequestUpdate, Write(actor, new
        {
            AccessRequestId = accessRequestId,
            r.LocationId,
            BusinessJustification = r.BusinessJustification!.Trim(),
            r.ValidFromUtc,
            r.ValidToUtc,
            r.Version,
        }));

    public Task<AccessRequestDetailDto> SubmitRequestAsync(ActorContext actor, long accessRequestId, byte[] version)
        => ReadDetailAsync(StoredProcedures.AccessRequestSubmit, Write(actor, new { AccessRequestId = accessRequestId, Version = version }));

    public Task<AccessRequestDetailDto> CancelRequestAsync(ActorContext actor, long accessRequestId, string reason, byte[] version)
        => ReadDetailAsync(StoredProcedures.AccessRequestCancel, Write(actor, new { AccessRequestId = accessRequestId, Reason = reason, Version = version }));

    public Task<PagedResult<PendingApprovalDto>> GetPendingApprovalsAsync(ActorContext actor, PagedQuery query)
        => QueryPagedAsync<PendingApprovalDto>(StoredProcedures.ApprovalPending, Read(actor, new { query.Search }), query.Page, query.PageSize);

    public Task<AccessRequestDetailDto> DecideAsync(ActorContext actor, long accessRequestId, ApprovalDecisionRequest r)
        => ReadDetailAsync(StoredProcedures.ApprovalDecide, Write(actor, new
        {
            AccessRequestId = accessRequestId,
            r.Decision,
            r.Comments,
            r.Version,
        }));

    public Task<PagedResult<AccessPermissionDto>> SearchPermissionsAsync(ActorContext actor, PermissionQuery query)
        => QueryPagedAsync<AccessPermissionDto>(StoredProcedures.PermissionSearch, Read(actor, new
        {
            query.Status,
            query.LocationId,
            query.EmployeeId,
            query.ExpiringWithinDays,
            query.Search,
        }), query.Page, query.PageSize);

    public Task<AccessPermissionDto> ProvisionAsync(ActorContext actor, long accessRequestId)
        => QuerySingleAsync<AccessPermissionDto>(StoredProcedures.PermissionProvision, Write(actor, new { AccessRequestId = accessRequestId }));

    public Task<AccessPermissionDto> RevokeAsync(ActorContext actor, long permissionId, string reason)
        => QuerySingleAsync<AccessPermissionDto>(StoredProcedures.PermissionRevoke, Write(actor, new { PermissionId = permissionId, Reason = reason }));

    private Task<AccessRequestDetailDto> ReadDetailAsync(string procedure, DynamicParameters parameters)
        => QueryMultipleAsync(procedure, parameters, async grid =>
        {
            AccessRequestDetailDto detail = await grid.ReadFirstOrDefaultAsync<AccessRequestDetailDto>()
                ?? throw AppException.NotFound(ApiMessages.NotFound);
            detail.Approvals = (await grid.ReadAsync<ApprovalDto>()).AsList();
            return detail;
        });
}

public sealed class SecurityRepository(IDbConnectionFactory factory) : RepositoryBase(factory), ISecurityRepository
{
    public Task<RfidIngestResultDto> IngestEventAsync(ActorContext actor, RfidEventRequest r)
        => QuerySingleAsync<RfidIngestResultDto>(StoredProcedures.RfidEventIngest, Write(actor, new
        {
            ReaderId = r.ReaderId!.Trim(),
            ExternalEventId = r.ExternalEventId!.Trim(),
            CardUid = r.CardUid!.Trim().ToUpperInvariant(),
            r.EventType,
            r.EventAtUtc,
        }));

    public Task<PagedResult<AccessLogDto>> SearchAccessLogsAsync(ActorContext actor, AccessLogQuery q)
        => QueryPagedAsync<AccessLogDto>(StoredProcedures.AccessLogSearch, Read(actor, new
        {
            q.From,
            q.To,
            q.LocationId,
            q.ReaderId,
            q.EventType,
            q.Decision,
            q.EmployeeId,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<PagedResult<ViolationDto>> SearchViolationsAsync(ActorContext actor, ViolationQuery q)
        => QueryPagedAsync<ViolationDto>(StoredProcedures.ViolationSearch, Read(actor, new
        {
            q.Status,
            q.ViolationType,
            q.Severity,
            q.LocationId,
            q.From,
            q.To,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<ViolationDto> ReviewViolationAsync(ActorContext actor, long violationId, ReviewViolationRequest r)
        => QuerySingleAsync<ViolationDto>(StoredProcedures.ViolationReview, Write(actor, new
        {
            ViolationId = violationId,
            r.Status,
            r.ReviewNotes,
            r.CreateIncident,
        }));

    public Task<PagedResult<IncidentDto>> SearchIncidentsAsync(ActorContext actor, IncidentQuery q)
        => QueryPagedAsync<IncidentDto>(StoredProcedures.IncidentSearch, Read(actor, new
        {
            q.Status,
            q.Severity,
            q.AssignedToUserId,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<IncidentDetailDto> GetIncidentAsync(ActorContext actor, int incidentId)
        => ReadIncidentAsync(StoredProcedures.IncidentGet, Read(actor, new { IncidentId = incidentId }));

    public Task<IncidentDetailDto> CreateIncidentAsync(ActorContext actor, CreateIncidentRequest r)
        => ReadIncidentAsync(StoredProcedures.IncidentCreate, Write(actor, new
        {
            Title = r.Title!.Trim(),
            r.Description,
            r.IncidentType,
            r.Severity,
            r.ViolationId,
            r.LocationId,
            r.AssignedToUserId,
        }));

    public Task<IncidentDetailDto> UpdateIncidentAsync(ActorContext actor, int incidentId, UpdateIncidentRequest r)
        => ReadIncidentAsync(StoredProcedures.IncidentUpdate, Write(actor, new
        {
            IncidentId = incidentId,
            r.Status,
            r.AssignedToUserId,
            r.Resolution,
            r.Note,
            r.Version,
        }));

    public Task<PagedResult<BlacklistEntryDto>> SearchBlacklistAsync(ActorContext actor, BlacklistQuery q)
        => QueryPagedAsync<BlacklistEntryDto>(StoredProcedures.BlacklistSearch, Read(actor, new
        {
            q.IsActive,
            q.SubjectType,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<BlacklistEntryDto> CreateBlacklistAsync(ActorContext actor, CreateBlacklistRequest r)
        => QuerySingleAsync<BlacklistEntryDto>(StoredProcedures.BlacklistCreate, Write(actor, new
        {
            r.SubjectType,
            r.SubjectId,
            r.Reason,
            r.ReviewDate,
        }));

    public Task<BlacklistEntryDto> LiftBlacklistAsync(ActorContext actor, int blacklistId, string reason)
        => QuerySingleAsync<BlacklistEntryDto>(StoredProcedures.BlacklistLift, Write(actor, new { BlacklistId = blacklistId, Reason = reason }));

    private Task<IncidentDetailDto> ReadIncidentAsync(string procedure, DynamicParameters parameters)
        => QueryMultipleAsync(procedure, parameters, async grid =>
        {
            IncidentDetailDto detail = await grid.ReadFirstOrDefaultAsync<IncidentDetailDto>()
                ?? throw AppException.NotFound(ApiMessages.NotFound);
            detail.Notes = (await grid.ReadAsync<IncidentNoteDto>()).AsList();
            return detail;
        });
}

public sealed class VisitorRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IVisitorRepository
{
    public Task<PagedResult<VisitorDto>> SearchVisitorsAsync(ActorContext actor, PagedQuery q)
        => QueryPagedAsync<VisitorDto>(StoredProcedures.VisitorSearch, Read(actor, new { q.Search }), q.Page, q.PageSize);

    public Task<VisitorDto> CreateVisitorAsync(ActorContext actor, CreateVisitorRequest r)
        => QuerySingleAsync<VisitorDto>(StoredProcedures.VisitorCreate, Write(actor, new
        {
            DisplayName = r.DisplayName!.Trim(),
            r.Organization,
            r.ContactReference,
            r.VisitPurpose,
            r.SponsorUserId,
        }));

    public Task<PagedResult<VisitorPassDto>> SearchPassesAsync(ActorContext actor, VisitorPassQuery q)
        => QueryPagedAsync<VisitorPassDto>(StoredProcedures.VisitorPassSearch, Read(actor, new
        {
            q.Status,
            q.LocationId,
            q.From,
            q.To,
            q.OnSite,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<VisitorPassDto> CreatePassAsync(ActorContext actor, CreateVisitorPassRequest r)
        => QuerySingleAsync<VisitorPassDto>(StoredProcedures.VisitorPassCreate, Write(actor, new
        {
            r.VisitorId,
            r.LocationId,
            r.ValidFromUtc,
            r.ValidToUtc,
            r.SponsorUserId,
        }));

    public Task<VisitorPassDto> TransitionPassAsync(ActorContext actor, long visitorPassId, string action, string? comments)
        => QuerySingleAsync<VisitorPassDto>(StoredProcedures.VisitorPassTransition, Write(actor, new
        {
            VisitorPassId = visitorPassId,
            Action = action,
            Comments = comments,
        }));
}

public sealed class InsightsRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IInsightsRepository
{
    public Task<DashboardSummaryDto> GetSummaryAsync(ActorContext actor)
        => QuerySingleAsync<DashboardSummaryDto>(StoredProcedures.DashboardSummary, Read(actor));

    public Task<IReadOnlyList<EventsTrendDto>> GetEventsTrendAsync(ActorContext actor, int days)
        => QueryAsync<EventsTrendDto>(StoredProcedures.DashboardEventsTrend, Read(actor, new { Days = days }));

    public Task<IReadOnlyList<LabelCountDto>> GetLabelCountsAsync(ActorContext actor, string procedure)
        => QueryAsync<LabelCountDto>(procedure, Read(actor));

    public Task<IReadOnlyList<OccupancyDto>> GetOccupancyAsync(ActorContext actor)
        => QueryAsync<OccupancyDto>(StoredProcedures.DashboardOccupancy, Read(actor));

    public Task<IReadOnlyList<MyWorkItemDto>> GetMyWorkAsync(ActorContext actor)
        => QueryAsync<MyWorkItemDto>(StoredProcedures.DashboardMyWork, Read(actor));

    public Task<IReadOnlyList<ActivityDto>> GetActivityAsync(ActorContext actor, int top)
        => QueryAsync<ActivityDto>(StoredProcedures.DashboardActivity, Read(actor, new { Top = top }));

    public Task<ReportResult> RunReportAsync(ActorContext actor, string procedure, ReportQuery q, bool export)
    {
        (int page, int pageSize) = export ? (1, HttpConstants.MaxExportRows) : NormalizePaging(q.Page, q.PageSize);
        DynamicParameters p = Read(actor, new
        {
            q.From,
            q.To,
            q.LocationId,
            q.DepartmentId,
            q.Status,
            Page = page,
            PageSize = pageSize,
            Export = export,
        });
        return ExecuteReaderAsync(procedure, p, reader =>
        {
            int total = 0;
            if (reader.Read())
            {
                total = Convert.ToInt32(reader.GetValue(0), CultureInfo.InvariantCulture);
            }

            var columns = new List<string>();
            var rows = new List<IReadOnlyList<object?>>();
            if (reader.NextResult())
            {
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    columns.Add(reader.GetName(i));
                }

                while (reader.Read())
                {
                    var row = new object?[reader.FieldCount];
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                    }

                    rows.Add(row);
                }
            }

            return Task.FromResult(new ReportResult { Columns = columns, Rows = rows, TotalCount = total, Page = page, PageSize = pageSize });
        });
    }

    public Task<PagedResult<AuditLogDto>> SearchAuditAsync(ActorContext actor, AuditQuery q)
        => QueryPagedAsync<AuditLogDto>(StoredProcedures.AuditSearch, Read(actor, new
        {
            q.From,
            q.To,
            FilterActorUserId = q.ActorUserId,
            q.Action,
            q.EntityType,
            q.EntityId,
            q.Search,
        }), q.Page, q.PageSize);

    public Task<IReadOnlyList<AuditLogDto>> GetTimelineAsync(ActorContext actor, string entityType, string entityId)
        => QueryAsync<AuditLogDto>(StoredProcedures.AuditTimeline, Read(actor, new { EntityType = entityType, EntityId = entityId }));
}

public sealed class AdminRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IAdminRepository
{
    public async Task<PagedResult<AdminUserDto>> SearchUsersAsync(ActorContext actor, AdminUserQuery q)
    {
        PagedResult<AdminUserRow> rows = await QueryPagedAsync<AdminUserRow>(StoredProcedures.AdminUserSearch, Read(actor, new { q.Search, q.IsActive }), q.Page, q.PageSize);
        return new PagedResult<AdminUserDto>
        {
            Items = rows.Items.Select(r => r.ToDto()).ToList(),
            TotalCount = rows.TotalCount,
            Page = rows.Page,
            PageSize = rows.PageSize,
        };
    }

    public async Task<AdminUserDto> SaveUserAsync(ActorContext actor, int? userId, SaveAdminUserRequest r)
    {
        AdminUserRow row = await QuerySingleAsync<AdminUserRow>(StoredProcedures.AdminUserSave, Write(actor, new
        {
            UserId = userId,
            DisplayName = r.DisplayName!.Trim(),
            Email = r.Email!.Trim(),
            r.EntraObjectId,
            r.IsActive,
            r.AllFacilities,
            RoleIds = JsonSerializer.Serialize(r.RoleIds ?? []),
            FacilityIds = JsonSerializer.Serialize(r.FacilityIds ?? []),
            r.EmployeeId,
        }));
        return row.ToDto();
    }

    public Task<IReadOnlyList<RoleDto>> GetRolesAsync(ActorContext actor)
        => QueryAsync<RoleDto>(StoredProcedures.RoleList, Read(actor));

    public Task<IReadOnlyList<RolePermissionDto>> GetRolePermissionsAsync(ActorContext actor, int roleId)
        => QueryAsync<RolePermissionDto>(StoredProcedures.RoleGetPermissions, Read(actor, new { RoleId = roleId }));

    public Task<IReadOnlyList<RolePermissionDto>> SetRolePermissionsAsync(ActorContext actor, int roleId, IReadOnlyList<int> permissionIds)
        => QueryAsync<RolePermissionDto>(StoredProcedures.RoleSetPermissions, Write(actor, new
        {
            RoleId = roleId,
            PermissionIds = JsonSerializer.Serialize(permissionIds),
        }));

    public Task<IReadOnlyList<PermissionCatalogDto>> GetPermissionCatalogAsync(ActorContext actor)
        => QueryAsync<PermissionCatalogDto>(StoredProcedures.PermissionCatalog, Read(actor));

    public Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync(ActorContext actor)
        => QueryAsync<DepartmentDto>(StoredProcedures.DepartmentList, Read(actor));

    public Task<DepartmentDto> SaveDepartmentAsync(ActorContext actor, int? departmentId, SaveDepartmentRequest r)
        => QuerySingleAsync<DepartmentDto>(StoredProcedures.DepartmentSave, Write(actor, new
        {
            DepartmentId = departmentId,
            DepartmentCode = r.DepartmentCode!.Trim().ToUpperInvariant(),
            DepartmentName = r.DepartmentName!.Trim(),
            r.HeadUserId,
            r.IsActive,
        }));

    public Task<IReadOnlyList<LocationDto>> GetLocationsAsync(ActorContext actor)
        => QueryAsync<LocationDto>(StoredProcedures.LocationList, Read(actor));

    public Task<LocationDto> SaveLocationAsync(ActorContext actor, int? locationId, SaveLocationRequest r)
        => QuerySingleAsync<LocationDto>(StoredProcedures.LocationSave, Write(actor, new
        {
            LocationId = locationId,
            r.ParentLocationId,
            LocationCode = r.LocationCode!.Trim().ToUpperInvariant(),
            LocationName = r.LocationName!.Trim(),
            r.LocationType,
            r.IsRestricted,
            r.IsActive,
            r.TimeZone,
        }));

    public Task<IReadOnlyList<ReaderDto>> GetReadersAsync(ActorContext actor)
        => QueryAsync<ReaderDto>(StoredProcedures.ReaderList, Read(actor));

    public Task<ReaderDto> SaveReaderAsync(ActorContext actor, bool isNew, string readerId, SaveReaderRequest r)
        => QuerySingleAsync<ReaderDto>(StoredProcedures.ReaderSave, Write(actor, new
        {
            IsNew = isNew,
            ReaderId = readerId.Trim(),
            ReaderName = r.ReaderName!.Trim(),
            r.LocationId,
            r.Direction,
            r.IsActive,
        }));

    public Task<IReadOnlyList<SettingDto>> GetSettingsAsync(ActorContext actor)
        => QueryAsync<SettingDto>(StoredProcedures.SettingList, Read(actor));

    public Task<IReadOnlyList<SettingDto>> UpdateSettingAsync(ActorContext actor, UpdateSettingRequest r)
        => QueryAsync<SettingDto>(StoredProcedures.SettingUpdate, Write(actor, new { r.SettingKey, r.SettingValue }));

    private sealed class AdminUserRow
    {
        public int UserId { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;

        public Guid? EntraObjectId { get; set; }

        public bool IsActive { get; set; }

        public bool AllFacilities { get; set; }

        public string? RoleIds { get; set; }

        public string? RoleNames { get; set; }

        public string? FacilityIds { get; set; }

        public string? FacilityNames { get; set; }

        public int? EmployeeId { get; set; }

        public string? EmployeeNumber { get; set; }

        public DateTime? LastLoginAtUtc { get; set; }

        public AdminUserDto ToDto() => new()
        {
            UserId = UserId,
            DisplayName = DisplayName,
            Email = Email,
            EntraObjectId = EntraObjectId,
            IsActive = IsActive,
            AllFacilities = AllFacilities,
            RoleIds = SplitInts(RoleIds),
            RoleNames = Split(RoleNames),
            FacilityIds = SplitInts(FacilityIds),
            FacilityNames = Split(FacilityNames),
            EmployeeId = EmployeeId,
            EmployeeNumber = EmployeeNumber,
            LastLoginAtUtc = LastLoginAtUtc,
        };

        private static List<string> Split(string? value)
            => (value ?? string.Empty).Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

        private static List<int> SplitInts(string? value)
            => Split(value).Select(v => int.Parse(v, CultureInfo.InvariantCulture)).ToList();
    }
}
