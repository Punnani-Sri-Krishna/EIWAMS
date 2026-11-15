using EIWAMS.Application.Models.DTOs.Common;

namespace EIWAMS.Application.Models.DTOs.Admin;

public sealed class AdminUserQuery : PagedQuery
{
    public bool? IsActive { get; set; }
}

public sealed class AdminUserDto
{
    public int UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public Guid? EntraObjectId { get; set; }

    public bool IsActive { get; set; }

    public bool AllFacilities { get; set; }

    public IReadOnlyList<int> RoleIds { get; set; } = [];

    public IReadOnlyList<string> RoleNames { get; set; } = [];

    public IReadOnlyList<int> FacilityIds { get; set; } = [];

    public IReadOnlyList<string> FacilityNames { get; set; } = [];

    public int? EmployeeId { get; set; }

    public string? EmployeeNumber { get; set; }

    public DateTime? LastLoginAtUtc { get; set; }
}

public sealed class SaveAdminUserRequest
{
    public string? DisplayName { get; set; }

    public string? Email { get; set; }

    public Guid? EntraObjectId { get; set; }

    public bool IsActive { get; set; } = true;

    public bool AllFacilities { get; set; }

    public IReadOnlyList<int> RoleIds { get; set; } = [];

    public IReadOnlyList<int> FacilityIds { get; set; } = [];

    public int? EmployeeId { get; set; }
}

public sealed class RoleDto
{
    public int RoleId { get; set; }

    public string RoleName { get; set; } = string.Empty;

    public string? Description { get; set; }

    public bool IsSystem { get; set; }

    public int UserCount { get; set; }

    public int PermissionCount { get; set; }
}

public sealed class RolePermissionDto
{
    public int PermissionId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Module { get; set; } = string.Empty;

    public string? Description { get; set; }

    public bool Granted { get; set; }
}

public sealed class PermissionCatalogDto
{
    public int PermissionId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Module { get; set; } = string.Empty;

    public string? Description { get; set; }
}

public sealed class SetRolePermissionsRequest
{
    public IReadOnlyList<int>? PermissionIds { get; set; }
}

public sealed class DepartmentDto
{
    public int DepartmentId { get; set; }

    public string DepartmentCode { get; set; } = string.Empty;

    public string DepartmentName { get; set; } = string.Empty;

    public int? HeadUserId { get; set; }

    public string? HeadUserName { get; set; }

    public bool IsActive { get; set; }

    public int EmployeeCount { get; set; }
}

public sealed class SaveDepartmentRequest
{
    public string? DepartmentCode { get; set; }

    public string? DepartmentName { get; set; }

    public int? HeadUserId { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed class LocationDto
{
    public int LocationId { get; set; }

    public int? ParentLocationId { get; set; }

    public string? ParentLocationName { get; set; }

    public string LocationCode { get; set; } = string.Empty;

    public string LocationName { get; set; } = string.Empty;

    public string LocationType { get; set; } = string.Empty;

    public bool IsRestricted { get; set; }

    public bool IsActive { get; set; }

    public string? TimeZone { get; set; }

    public string? Path { get; set; }

    public int ReaderCount { get; set; }
}

public sealed class SaveLocationRequest
{
    public int? ParentLocationId { get; set; }

    public string? LocationCode { get; set; }

    public string? LocationName { get; set; }

    public string? LocationType { get; set; }

    public bool IsRestricted { get; set; }

    public bool IsActive { get; set; } = true;

    public string? TimeZone { get; set; }
}

public sealed class ReaderDto
{
    public string ReaderId { get; set; } = string.Empty;

    public string ReaderName { get; set; } = string.Empty;

    public int LocationId { get; set; }

    public string? LocationName { get; set; }

    public string Direction { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    public DateTime? LastSeenAtUtc { get; set; }
}

public sealed class SaveReaderRequest
{
    public string? ReaderId { get; set; }

    public string? ReaderName { get; set; }

    public int LocationId { get; set; }

    public string? Direction { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed class SettingDto
{
    public string SettingKey { get; set; } = string.Empty;

    public string? SettingValue { get; set; }

    public string? Description { get; set; }

    public string? DataType { get; set; }
}

public sealed class UpdateSettingRequest
{
    public string? SettingKey { get; set; }

    public string? SettingValue { get; set; }
}
