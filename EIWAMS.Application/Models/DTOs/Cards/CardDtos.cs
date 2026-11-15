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
}

public sealed class CardRequestDto
{
    public long CardRequestId { get; set; }

    public string RequestNumber { get; set; } = string.Empty;

    public string RequestType { get; set; } = string.Empty;

    public int EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public string? EmployeeNumber { get; set; }

    public long? OldCardId { get; set; }

    public long? NewCardId { get; set; }

    public string? Reason { get; set; }

    public string Status { get; set; } = string.Empty;

    public DateTime RequestedAtUtc { get; set; }

    public string? RequestedByName { get; set; }

    public string? VerifiedByName { get; set; }

    public string? ApprovedByName { get; set; }

    public DateTime? DecidedAtUtc { get; set; }

    public string? DecisionComments { get; set; }

    public DateTime? RequestedValidToUtc { get; set; }
}

public sealed class CreateCardRequestRequest
{
    public int EmployeeId { get; set; }

    public string? RequestType { get; set; }

    public long? OldCardId { get; set; }

    public string? Reason { get; set; }

    public DateTime? RequestedValidToUtc { get; set; }
}

public sealed class CardRequestDecisionRequest
{
    public string? Decision { get; set; }

    public string? Comments { get; set; }
}
