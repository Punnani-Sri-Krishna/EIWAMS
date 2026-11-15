using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Visitors;

public sealed class VisitorDto
{
    public int VisitorId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string? Organization { get; set; }

    public string? ContactReference { get; set; }

    public string? VisitPurpose { get; set; }

    public int? SponsorUserId { get; set; }

    public string? SponsorName { get; set; }

    public bool IsBlacklisted { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public int PassCount { get; set; }
}

public sealed class CreateVisitorRequest
{
    public string? DisplayName { get; set; }

    public string? Organization { get; set; }

    public string? ContactReference { get; set; }

    public string? VisitPurpose { get; set; }

    public int? SponsorUserId { get; set; }
}

public sealed class VisitorPassQuery : PagedQuery
{
    public string? Status { get; set; }

    public int? LocationId { get; set; }

    public DateTime? From { get; set; }

    public DateTime? To { get; set; }

    public bool? OnSite { get; set; }
}

public sealed class VisitorPassDto
{
    public long VisitorPassId { get; set; }

    public string PassNumber { get; set; } = string.Empty;

    public int VisitorId { get; set; }

    public string? VisitorName { get; set; }

    public string? Organization { get; set; }

    public int LocationId { get; set; }

    public string? LocationName { get; set; }

    public int? SponsorUserId { get; set; }

    public string? SponsorName { get; set; }

    public DateTime ValidFromUtc { get; set; }

    public DateTime ValidToUtc { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? ApprovedByName { get; set; }

    public DateTime? ApprovedAtUtc { get; set; }

    public DateTime? CheckedInAtUtc { get; set; }

    public DateTime? CheckedOutAtUtc { get; set; }

    public string? RevokeReason { get; set; }
}

public sealed class CreateVisitorPassRequest
{
    public int VisitorId { get; set; }

    public int LocationId { get; set; }

    public DateTime? ValidFromUtc { get; set; }

    public DateTime? ValidToUtc { get; set; }

    public int? SponsorUserId { get; set; }
}
