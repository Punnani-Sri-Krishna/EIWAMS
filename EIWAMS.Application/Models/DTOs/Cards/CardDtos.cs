using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Cards;

public sealed class CardQuery : PagedQuery
{
    public string? Status { get; set; }

    public string? CardType { get; set; }

    public int? EmployeeId { get; set; }
}

public sealed class CardDto
{
    public long CardId { get; set; }

    public string MaskedCardUid { get; set; } = string.Empty;

    public int EmployeeId { get; set; }

    public string? EmployeeNumber { get; set; }

    public string? EmployeeName { get; set; }

    public string CardType { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTime? IssuedAtUtc { get; set; }

    public DateTime? ActivatedAtUtc { get; set; }

    public DateTime? ExpiresAtUtc { get; set; }

    public DateTime? BlockedAtUtc { get; set; }

    public string? BlockReason { get; set; }

    public string? ControllerSyncStatus { get; set; }

    public long? ReplacedByCardId { get; set; }

    public long? CardRequestId { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class CreateCardRequest
{
    public int EmployeeId { get; set; }

    public string? CardUid { get; set; }

    public string? CardType { get; set; }

    public DateTime? ExpiresAtUtc { get; set; }

    public long? CardRequestId { get; set; }
}

public sealed class ReplaceCardRequest
{
    public string? NewCardUid { get; set; }

    public string? Reason { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class CardRequestQuery : PagedQuery
{
    public string? Status { get; set; }

    public string? RequestType { get; set; }

    public int? EmployeeId { get; set; }

    public bool? Mine { get; set; }
}

public class CardRequestDto
{
    public long CardRequestId { get; set; }

    public string RequestNumber { get; set; } = string.Empty;

    public string RequestType { get; set; } = string.Empty;

    public int EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public string? EmployeeNumber { get; set; }

    public string? Designation { get; set; }

    public string? DepartmentName { get; set; }

    public string? ManagerName { get; set; }

    public long? OldCardId { get; set; }

    public string? OldMaskedCardUid { get; set; }

    public long? NewCardId { get; set; }

    public string? NewMaskedCardUid { get; set; }

    public string? Reason { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? CurrentStage { get; set; }

    public DateTime RequestedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime? ClosedAtUtc { get; set; }

    public int RequestedByUserId { get; set; }

    public string? RequestedByName { get; set; }

    public string? VerifiedByName { get; set; }

    public string? ApprovedByName { get; set; }

    public DateTime? DecidedAtUtc { get; set; }

    public string? DecisionComments { get; set; }

    public DateTime? RequestedValidToUtc { get; set; }

    public string? LastActionByName { get; set; }

    public DateTime? LastActionAtUtc { get; set; }

    public string? LastComments { get; set; }

    public bool HasPhoto { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class CardRequestQueueQuery : PagedQuery
{
    public string? Stage { get; set; }
}

public sealed class CardRequestDetailDto : CardRequestDto
{
    public string? WorkEmail { get; set; }

    public string? LocationName { get; set; }

    public string? MobileNumber { get; set; }

    public string? Address { get; set; }

    public string? BloodGroup { get; set; }

    public string? EmergencyContactName { get; set; }

    public string? EmergencyContactNumber { get; set; }

    public IReadOnlyList<string> AvailableActions { get; set; } = [];

    public IReadOnlyList<CardRequestHistoryDto> History { get; set; } = [];
}

public sealed class CardRequestHistoryDto
{
    public long HistoryId { get; set; }

    public string? FromStatus { get; set; }

    public string ToStatus { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string? Comments { get; set; }

    public int? ActorUserId { get; set; }

    public string? ActorName { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}

public sealed class CreateCardRequestRequest
{
    public int? EmployeeId { get; set; }

    public string? RequestType { get; set; }

    public string? Reason { get; set; }

    public string? MobileNumber { get; set; }

    public string? Address { get; set; }

    public string? BloodGroup { get; set; }

    public string? EmergencyContactName { get; set; }

    public string? EmergencyContactNumber { get; set; }

    public string? PhotoContentType { get; set; }

    public string? PhotoBase64 { get; set; }
}

public sealed class CardRequestDecisionRequest
{
    public string? Action { get; set; }

    public string? Comments { get; set; }

    public byte[]? Version { get; set; }
}
