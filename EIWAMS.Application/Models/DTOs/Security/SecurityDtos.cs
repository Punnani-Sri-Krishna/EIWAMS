using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Security;

public sealed class RfidEventRequest
{
    public string? ReaderId { get; set; }

    public string? ExternalEventId { get; set; }

    public string? CardUid { get; set; }

    public string? EventType { get; set; }

    public DateTime? EventAtUtc { get; set; }
}

public sealed class RfidIngestResultDto
{
    public long AccessLogId { get; set; }

    public string ProcessingStatus { get; set; } = string.Empty;

    public string Decision { get; set; } = string.Empty;

    public string? DenialReason { get; set; }

    public long? ViolationId { get; set; }

    public bool IsDuplicate { get; set; }
}

public sealed class AccessLogQuery : PagedQuery
{
    public DateTime? From { get; set; }

    public DateTime? To { get; set; }

    public int? LocationId { get; set; }

    public string? ReaderId { get; set; }

    public string? EventType { get; set; }

    public string? Decision { get; set; }

    public int? EmployeeId { get; set; }
}

public sealed class AccessLogDto
{
    public long AccessLogId { get; set; }

    public string ExternalEventId { get; set; } = string.Empty;

    public string ReaderId { get; set; } = string.Empty;

    public string? ReaderName { get; set; }

    public string? MaskedCardUid { get; set; }

    public long? CardId { get; set; }

    public int? EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public int? LocationId { get; set; }

    public string? LocationName { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string Decision { get; set; } = string.Empty;

    public string? DenialReason { get; set; }

    public DateTime EventAtUtc { get; set; }

    public DateTime ReceivedAtUtc { get; set; }

    public string ProcessingStatus { get; set; } = string.Empty;
}

public sealed class ViolationQuery : PagedQuery
{
    public string? Status { get; set; }

    public string? ViolationType { get; set; }

    public string? Severity { get; set; }

    public int? LocationId { get; set; }

    public DateTime? From { get; set; }

    public DateTime? To { get; set; }
}

public sealed class ViolationDto
{
    public long ViolationId { get; set; }

    public long? AccessLogId { get; set; }

    public int? EmployeeId { get; set; }

    public string? EmployeeName { get; set; }

    public int? LocationId { get; set; }

    public string? LocationName { get; set; }

    public string ViolationType { get; set; } = string.Empty;

    public string Severity { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTime DetectedAtUtc { get; set; }

    public string? ReviewNotes { get; set; }

    public string? ReviewedByName { get; set; }

    public DateTime? ReviewedAtUtc { get; set; }

    public int? IncidentId { get; set; }
}

public sealed class ReviewViolationRequest
{
    public string? Status { get; set; }

    public string? ReviewNotes { get; set; }

    public bool CreateIncident { get; set; }
}

public sealed class IncidentQuery : PagedQuery
{
    public string? Status { get; set; }

    public string? Severity { get; set; }

    public int? AssignedToUserId { get; set; }
}

public class IncidentDto
{
    public int IncidentId { get; set; }

    public string IncidentNumber { get; set; } = string.Empty;

    public long? ViolationId { get; set; }

    public string IncidentType { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string Severity { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public int? LocationId { get; set; }

    public string? LocationName { get; set; }

    public int? AssignedToUserId { get; set; }

    public string? AssignedToName { get; set; }

    public string? Resolution { get; set; }

    public string? OpenedByName { get; set; }

    public DateTime OpenedAtUtc { get; set; }

    public DateTime? ClosedAtUtc { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class IncidentDetailDto : IncidentDto
{
    public IReadOnlyList<IncidentNoteDto> Notes { get; set; } = [];
}

public sealed class IncidentNoteDto
{
    public long NoteId { get; set; }

    public string Note { get; set; } = string.Empty;

    public string? CreatedByName { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}

public sealed class CreateIncidentRequest
{
    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? IncidentType { get; set; }

    public string? Severity { get; set; }

    public long? ViolationId { get; set; }

    public int? LocationId { get; set; }

    public int? AssignedToUserId { get; set; }
}

public sealed class UpdateIncidentRequest
{
    public string? Status { get; set; }

    public int? AssignedToUserId { get; set; }

    public string? Resolution { get; set; }

    public string? Note { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class BlacklistQuery : PagedQuery
{
    public bool? IsActive { get; set; }

    public string? SubjectType { get; set; }
}

public sealed class BlacklistEntryDto
{
    public int BlacklistId { get; set; }

    public string SubjectType { get; set; } = string.Empty;

    public long SubjectId { get; set; }

    public string? SubjectName { get; set; }

    public string Reason { get; set; } = string.Empty;

    public DateOnly? ReviewDate { get; set; }

    public bool IsActive { get; set; }

    public string? CreatedByName { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public string? LiftedByName { get; set; }

    public DateTime? LiftedAtUtc { get; set; }

    public string? LiftReason { get; set; }
}

public sealed class CreateBlacklistRequest
{
    public string? SubjectType { get; set; }

    public long SubjectId { get; set; }

    public string? Reason { get; set; }

    public DateOnly? ReviewDate { get; set; }
}
