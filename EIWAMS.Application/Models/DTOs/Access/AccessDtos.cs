using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Access;

public sealed class AccessRequestQuery : PagedQuery
{
    public string? Status { get; set; }

    public string? CurrentStage { get; set; }

    public int? LocationId { get; set; }

    public int? EmployeeId { get; set; }

    public bool? Mine { get; set; }
}

public class AccessRequestDto
{
    public long AccessRequestId { get; set; }

    public string RequestNumber { get; set; } = string.Empty;

    public int EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public string? EmployeeNumber { get; set; }

    public int LocationId { get; set; }

    public string? LocationName { get; set; }

    public string? LocationCode { get; set; }

    public bool IsRestricted { get; set; }

    public int RequesterUserId { get; set; }

    public string? RequesterName { get; set; }

    public string BusinessJustification { get; set; } = string.Empty;

    public DateTime ValidFromUtc { get; set; }

    public DateTime ValidToUtc { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? CurrentStage { get; set; }

    public string? CurrentApproverNames { get; set; }

    public DateTime? SubmittedAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class AccessRequestDetailDto : AccessRequestDto
{
    public IReadOnlyList<ApprovalDto> Approvals { get; set; } = [];

    public long? PermissionId { get; set; }

    public string? PermissionStatus { get; set; }

    public bool CanEdit { get; set; }

    public bool CanSubmit { get; set; }

    public bool CanCancel { get; set; }

    public bool CanDecide { get; set; }

    public bool CanProvision { get; set; }
}

public sealed class ApprovalDto
{
    public long ApprovalId { get; set; }

    public string Stage { get; set; } = string.Empty;

    public int StageOrder { get; set; }

    public string? AssignedToNames { get; set; }

    public string? DecidedByName { get; set; }

    public string Decision { get; set; } = string.Empty;

    public string? Comments { get; set; }

    public DateTime? DecidedAtUtc { get; set; }
}

public sealed class CreateAccessRequestRequest
{
    public int EmployeeId { get; set; }

    public int LocationId { get; set; }

    public string? BusinessJustification { get; set; }

    public DateTime? ValidFromUtc { get; set; }

    public DateTime? ValidToUtc { get; set; }

    public bool Submit { get; set; }
}

public sealed class UpdateAccessRequestRequest
{
    public int LocationId { get; set; }

    public string? BusinessJustification { get; set; }

    public DateTime? ValidFromUtc { get; set; }

    public DateTime? ValidToUtc { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class PendingApprovalDto
{
    public long AccessRequestId { get; set; }

    public string RequestNumber { get; set; } = string.Empty;

    public string? EmployeeName { get; set; }

    public string? EmployeeNumber { get; set; }

    public string? LocationName { get; set; }

    public bool IsRestricted { get; set; }

    public string Stage { get; set; } = string.Empty;

    public string? BusinessJustification { get; set; }

    public DateTime ValidFromUtc { get; set; }

    public DateTime ValidToUtc { get; set; }

    public DateTime? SubmittedAtUtc { get; set; }

    public decimal AgeHours { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class ApprovalDecisionRequest
{
    public string? Decision { get; set; }

    public string? Comments { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class PermissionQuery : PagedQuery
{
    public string? Status { get; set; }

    public int? LocationId { get; set; }

    public int? EmployeeId { get; set; }

    public int? ExpiringWithinDays { get; set; }
}

public sealed class AccessPermissionDto
{
    public long PermissionId { get; set; }

    public int EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public string? EmployeeNumber { get; set; }

    public int LocationId { get; set; }

    public string? LocationName { get; set; }

    public long? AccessRequestId { get; set; }

    public string? RequestNumber { get; set; }

    public DateTime ValidFromUtc { get; set; }

    public DateTime ValidToUtc { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? ProvisionedByName { get; set; }

    public DateTime? ProvisionedAtUtc { get; set; }

    public DateTime? RevokedAtUtc { get; set; }

    public string? RevokeReason { get; set; }

    public string? ControllerSyncStatus { get; set; }
}

public sealed class ProvisionPermissionRequest
{
    public long AccessRequestId { get; set; }
}
