using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Employees;

public sealed class EmployeeQuery : PagedQuery
{
    public string? EmploymentStatus { get; set; }

    public int? DepartmentId { get; set; }

    public int? LocationId { get; set; }

    public string? EmployeeType { get; set; }
}

public sealed class EmployeeSyncRequest
{
    public IReadOnlyList<EmployeeSyncItem> Employees { get; set; } = [];
}

public sealed class EmployeeSyncItem
{
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string WorkEmail { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public string DepartmentCode { get; set; } = string.Empty;
    public string? ManagerEmployeeNumber { get; set; }
    public string LocationCode { get; set; } = string.Empty;
    public string EmployeeType { get; set; } = string.Empty;
    public string EmploymentStatus { get; set; } = "Active";
    public DateOnly JoinDate { get; set; }
    public DateOnly? EndDate { get; set; }
}

public sealed class EmployeeSyncResultDto
{
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public int Deactivated { get; set; }
}

public class EmployeeListItemDto
{
    public int EmployeeId { get; set; }

    public string EmployeeNumber { get; set; } = string.Empty;

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    public string FullName { get; set; } = string.Empty;

    public string WorkEmail { get; set; } = string.Empty;

    public string? Designation { get; set; }

    public string EmployeeType { get; set; } = string.Empty;

    public int DepartmentId { get; set; }

    public string? DepartmentName { get; set; }

    public int? ManagerEmployeeId { get; set; }

    public string? ManagerName { get; set; }

    public int LocationId { get; set; }

    public string? LocationName { get; set; }

    public string EmploymentStatus { get; set; } = string.Empty;

    public DateOnly JoinDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public int ActiveCardCount { get; set; }
}

public sealed class EmployeeDetailDto : EmployeeListItemDto
{
    public int? UserId { get; set; }

    public int ActivePermissionCount { get; set; }

    public int OpenAccessRequestCount { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public byte[]? Version { get; set; }
}

public class CreateEmployeeRequest
{
    public string? EmployeeNumber { get; set; }

    public string? FirstName { get; set; }

    public string? LastName { get; set; }

    public string? WorkEmail { get; set; }

    public string? EmployeeType { get; set; }

    public int DepartmentId { get; set; }

    public int? ManagerEmployeeId { get; set; }

    public int LocationId { get; set; }

    public DateOnly? JoinDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public int? UserId { get; set; }
}

public sealed class UpdateEmployeeRequest
{
    public string? FirstName { get; set; }

    public string? LastName { get; set; }

    public string? WorkEmail { get; set; }

    public string? EmployeeType { get; set; }

    public int DepartmentId { get; set; }

    public int? ManagerEmployeeId { get; set; }

    public int LocationId { get; set; }

    public DateOnly? JoinDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public int? UserId { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class TransferEmployeeRequest
{
    public int DepartmentId { get; set; }

    public int? ManagerEmployeeId { get; set; }

    public int LocationId { get; set; }

    public DateOnly? EffectiveDate { get; set; }

    public string? Reason { get; set; }
}

public sealed class DeactivateEmployeeRequest
{
    public string? EmploymentStatus { get; set; }

    public DateOnly? EndDate { get; set; }

    public string? Reason { get; set; }
}

public sealed class EmployeeHistoryDto
{
    public long HistoryId { get; set; }

    public string ChangeType { get; set; } = string.Empty;

    public string? Summary { get; set; }

    public DateOnly? EffectiveDate { get; set; }

    public string? ChangedByName { get; set; }

    public DateTime ChangedAtUtc { get; set; }
}
