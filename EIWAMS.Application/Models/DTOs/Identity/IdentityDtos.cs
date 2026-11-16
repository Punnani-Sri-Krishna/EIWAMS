using System.Text.Json.Serialization;

namespace EIWAMS.Application.Models.DTOs.Identity;

public sealed class CurrentUserDto
{
    public int UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public int? EmployeeId { get; set; }

    public string? EmployeeNumber { get; set; }

    public string? Designation { get; set; }

    public string? DepartmentName { get; set; }

    public string? ManagerName { get; set; }

    public string? ManagerEmail { get; set; }

    public string? LocationName { get; set; }

    public bool HasPhoto { get; set; }

    public IReadOnlyList<string> Roles { get; set; } = [];

    public IReadOnlyList<string> Permissions { get; set; } = [];

    public bool AllFacilities { get; set; }

    public IReadOnlyList<int> FacilityIds { get; set; } = [];

    [JsonIgnore]
    public bool IsActive { get; set; }
}

public sealed class DevUserDto
{
    public int UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public IReadOnlyList<string> Roles { get; set; } = [];
}

public sealed class AuthConfigDto
{
    public string Mode { get; set; } = string.Empty;

    public string? TenantId { get; set; }

    public string? SpaClientId { get; set; }

    public string? ApiScope { get; set; }

    public string? Authority { get; set; }
}

public sealed class MyProfileDto
{
    public int EmployeeId { get; set; }
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? WorkEmail { get; set; }
    public string? Designation { get; set; }
    public string? DepartmentName { get; set; }
    public string? ManagerName { get; set; }
    public string? ManagerEmail { get; set; }
    public string? LocationName { get; set; }
    public string EmploymentStatus { get; set; } = string.Empty;
    public DateOnly? JoinDate { get; set; }
    public string? MobileNumber { get; set; }
    public string? Address { get; set; }
    public string? BloodGroup { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactNumber { get; set; }
    public bool HasPhoto { get; set; }
    public ActiveCardDto? ActiveCard { get; set; }
}

public sealed class ActiveCardDto
{
    public long CardId { get; set; }
    public string MaskedUid { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? IssuedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
}

public sealed class UpdateMyProfileRequest
{
    public string? MobileNumber { get; set; }
    public string? Address { get; set; }
    public string? BloodGroup { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactNumber { get; set; }
}

public sealed class PhotoUploadRequest
{
    public string? PhotoContentType { get; set; }
    public string? PhotoBase64 { get; set; }
}

public sealed class PhotoDto
{
    public string ContentType { get; set; } = string.Empty;
    public string PhotoBase64 { get; set; } = string.Empty;
    public int SizeBytes { get; set; }
    public DateTime UploadedAtUtc { get; set; }
}

public sealed class PhotoInfoDto
{
    public bool HasPhoto { get; set; } = true;
    public string ContentType { get; set; } = string.Empty;
    public int SizeBytes { get; set; }
    public DateTime UploadedAtUtc { get; set; }
}

public sealed class EntraUserDto
{
    public int UserId { get; set; }

    public bool IsActive { get; set; }
}

public sealed class MenuItemDto
{
    public int MenuId { get; set; }

    public string Section { get; set; } = string.Empty;

    public int SectionOrder { get; set; }

    public string Label { get; set; } = string.Empty;

    public string? Icon { get; set; }

    public string Route { get; set; } = string.Empty;

    public int SortOrder { get; set; }
}

public sealed class CodeLookupDto
{
    public int Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}

public sealed class LocationLookupDto
{
    public int Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string LocationType { get; set; } = string.Empty;

    public int? ParentLocationId { get; set; }

    public bool IsRestricted { get; set; }
}

public sealed class EmployeeLookupDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string EmployeeNumber { get; set; } = string.Empty;
}

public sealed class NameLookupDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;
}

public sealed class ReaderLookupDto
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public int LocationId { get; set; }
}

public sealed class LookupsDto
{
    public IReadOnlyList<CodeLookupDto> Departments { get; set; } = [];

    public IReadOnlyList<LocationLookupDto> Locations { get; set; } = [];

    public IReadOnlyList<EmployeeLookupDto> Employees { get; set; } = [];

    public IReadOnlyList<NameLookupDto> Users { get; set; } = [];

    public IReadOnlyList<ReaderLookupDto> Readers { get; set; } = [];

    public IReadOnlyList<string> EmployeeTypes { get; set; } = [];

    public IReadOnlyList<string> EmploymentStatuses { get; set; } = [];

    public IReadOnlyList<string> CardTypes { get; set; } = [];

    public IReadOnlyList<string> CardStatuses { get; set; } = [];

    public IReadOnlyList<string> CardRequestTypes { get; set; } = [];

    public IReadOnlyList<string> CardRequestTypesOffered { get; set; } = [];

    public IReadOnlyList<string> CardRequestStatuses { get; set; } = [];

    public IReadOnlyList<string> CardRequestStages { get; set; } = [];

    public IReadOnlyList<string> CardRequestActions { get; set; } = [];

    public IReadOnlyList<string> DamagedReasons { get; set; } = [];

    public IReadOnlyList<string> BloodGroups { get; set; } = [];

    public IReadOnlyList<string> AccessTypes { get; set; } = [];

    public IReadOnlyList<string> DurationCodes { get; set; } = [];

    public IReadOnlyList<string> AccessRequestStatuses { get; set; } = [];

    public IReadOnlyList<string> ApprovalStages { get; set; } = [];

    public IReadOnlyList<string> PermissionStatuses { get; set; } = [];

    public IReadOnlyList<string> EventTypes { get; set; } = [];

    public IReadOnlyList<string> ViolationTypes { get; set; } = [];

    public IReadOnlyList<string> ViolationStatuses { get; set; } = [];

    public IReadOnlyList<string> Severities { get; set; } = [];

    public IReadOnlyList<string> IncidentTypes { get; set; } = [];

    public IReadOnlyList<string> IncidentStatuses { get; set; } = [];

    public IReadOnlyList<string> VisitorPassStatuses { get; set; } = [];

    public IReadOnlyList<string> LocationTypes { get; set; } = [];
}

public sealed class NotificationDto
{
    public long NotificationId { get; set; }

    public string Type { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string? RelatedEntityType { get; set; }

    public string? RelatedEntityId { get; set; }

    public string? Route { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? ReadAtUtc { get; set; }
}

public sealed class NotificationQuery : Common.PagedQuery
{
    public bool? UnreadOnly { get; set; }
}
