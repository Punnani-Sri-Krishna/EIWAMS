using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Insights;

public sealed class DashboardSummaryDto
{
    public int ActiveEmployees { get; set; }

    public int ActiveCards { get; set; }

    public int BlockedCards { get; set; }

    public int PendingAccessRequests { get; set; }

    public int MyPendingApprovals { get; set; }

    public int ActivePermissions { get; set; }

    public int PermissionsExpiring7d { get; set; }

    public int EventsToday { get; set; }

    public int DeniedToday { get; set; }

    public int OpenViolations { get; set; }

    public int OpenIncidents { get; set; }

    public int VisitorsOnSite { get; set; }

    public decimal? AvgApprovalTurnaroundHours { get; set; }
}

public sealed class EventsTrendDto
{
    public DateOnly Date { get; set; }

    public int Entries { get; set; }

    public int Exits { get; set; }

    public int Denied { get; set; }
}

public sealed class OccupancyDto
{
    public int LocationId { get; set; }

    public string LocationName { get; set; } = string.Empty;

    public int OnSite { get; set; }
}

public sealed class MyWorkItemDto
{
    public string ItemType { get; set; } = string.Empty;

    public long ReferenceId { get; set; }

    public string? ReferenceNumber { get; set; }

    public string? Title { get; set; }

    public string? Status { get; set; }

    public DateTime? CreatedAtUtc { get; set; }

    public string? Route { get; set; }
}

public sealed class ActivityDto
{
    public long AuditLogId { get; set; }

    public string Action { get; set; } = string.Empty;

    public string? EntityType { get; set; }

    public string? EntityId { get; set; }

    public string? ActorName { get; set; }

    public string? Summary { get; set; }

    public DateTime OccurredAtUtc { get; set; }
}

public sealed class DaysQuery
{
    public int Days { get; set; } = 14;
}

public sealed class TopQuery
{
    public int Top { get; set; } = 15;
}

public sealed class ReportQuery
{
    public DateTime? From { get; set; }

    public DateTime? To { get; set; }

    public int? LocationId { get; set; }

    public int? DepartmentId { get; set; }

    public string? Status { get; set; }

    public int Page { get; set; } = 1;

    public int PageSize { get; set; } = 20;
}

public sealed class ReportResult
{
    public IReadOnlyList<string> Columns { get; set; } = [];

    public IReadOnlyList<IReadOnlyList<object?>> Rows { get; set; } = [];

    public int TotalCount { get; set; }

    public int Page { get; set; }

    public int PageSize { get; set; }
}

public sealed class AuditQuery : PagedQuery
{
    public DateTime? From { get; set; }

    public DateTime? To { get; set; }

    public int? ActorUserId { get; set; }

    public string? Action { get; set; }

    public string? EntityType { get; set; }

    public string? EntityId { get; set; }
}

public sealed class AuditTimelineQuery
{
    public string? EntityType { get; set; }

    public string? EntityId { get; set; }
}

public sealed class AuditLogDto
{
    public long AuditLogId { get; set; }

    public int? ActorUserId { get; set; }

    public string? ActorName { get; set; }

    public string Action { get; set; } = string.Empty;

    public string? EntityType { get; set; }

    public string? EntityId { get; set; }

    public string? Summary { get; set; }

    public string? BeforeJson { get; set; }

    public string? AfterJson { get; set; }

    public string? Reason { get; set; }

    public DateTime OccurredAtUtc { get; set; }

    public Guid? CorrelationId { get; set; }

    public string? IpAddress { get; set; }
}
