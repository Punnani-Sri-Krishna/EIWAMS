using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
using EIWAMS.Application.Models.DTOs.Identity;
using FluentValidation;

namespace EIWAMS.Application.Validators;

internal static class Rules
{
    public const string CardUidPattern = "^[0-9A-Fa-f]{4,32}$";
    public const string CodePattern = "^[A-Za-z0-9][A-Za-z0-9_-]*$";

    public static IRuleBuilderOptions<T, string?> OneOf<T>(this IRuleBuilder<T, string?> rule, IReadOnlyCollection<string> values, string name)
        => rule.Must(v => v is not null && values.Contains(v, StringComparer.Ordinal))
            .WithMessage($"'{name}' must be one of: {string.Join(", ", values)}.");

    public static IRuleBuilderOptions<T, string?> RequiredText<T>(this IRuleBuilder<T, string?> rule, string name, int maxLength)
        => rule.Must(v => !string.IsNullOrWhiteSpace(v)).WithMessage($"'{name}' is required.")
            .MaximumLength(maxLength).WithMessage($"'{name}' must be {maxLength} characters or fewer.");

    public static IRuleBuilderOptions<T, byte[]?> RequiredVersion<T>(this IRuleBuilder<T, byte[]?> rule)
        => rule.Must(v => v is { Length: 8 }).WithMessage("'version' is required (base64 rowversion).");
}

public sealed class VersionRequestValidator : AbstractValidator<VersionRequest>
{
    public VersionRequestValidator() => RuleFor(x => x.Version).RequiredVersion();
}

public sealed class ReasonRequestValidator : AbstractValidator<ReasonRequest>
{
    public ReasonRequestValidator() => RuleFor(x => x.Reason).RequiredText("reason", 500);
}

public sealed class ReasonVersionRequestValidator : AbstractValidator<ReasonVersionRequest>
{
    public ReasonVersionRequestValidator()
    {
        RuleFor(x => x.Reason).RequiredText("reason", 500);
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class CommentsRequestValidator : AbstractValidator<CommentsRequest>
{
    public CommentsRequestValidator() => RuleFor(x => x.Comments).MaximumLength(1000);
}

public sealed class CreateEmployeeRequestValidator : AbstractValidator<CreateEmployeeRequest>
{
    public CreateEmployeeRequestValidator()
    {
        RuleFor(x => x.EmployeeNumber).RequiredText("employeeNumber", 30)
            .Matches(Rules.CodePattern).WithMessage("'employeeNumber' may contain letters, digits, '-' and '_' only.");
        RuleFor(x => x.FirstName).RequiredText("firstName", 100);
        RuleFor(x => x.LastName).RequiredText("lastName", 100);
        RuleFor(x => x.WorkEmail).RequiredText("workEmail", 256).EmailAddress().WithMessage("'workEmail' must be a valid email address.");
        RuleFor(x => x.EmployeeType).OneOf(LookupValues.EmployeeTypes, "employeeType");
        RuleFor(x => x.DepartmentId).GreaterThan(0).WithMessage("'departmentId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.ManagerEmployeeId).GreaterThan(0).When(x => x.ManagerEmployeeId.HasValue);
        RuleFor(x => x.JoinDate).NotNull().WithMessage("'joinDate' is required.");
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.JoinDate).When(x => x.EndDate.HasValue && x.JoinDate.HasValue)
            .WithMessage("'endDate' must be on or after 'joinDate'.");
    }
}

public sealed class UpdateEmployeeRequestValidator : AbstractValidator<UpdateEmployeeRequest>
{
    public UpdateEmployeeRequestValidator()
    {
        RuleFor(x => x.FirstName).RequiredText("firstName", 100);
        RuleFor(x => x.LastName).RequiredText("lastName", 100);
        RuleFor(x => x.WorkEmail).RequiredText("workEmail", 256).EmailAddress().WithMessage("'workEmail' must be a valid email address.");
        RuleFor(x => x.EmployeeType).OneOf(LookupValues.EmployeeTypes, "employeeType");
        RuleFor(x => x.DepartmentId).GreaterThan(0).WithMessage("'departmentId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.JoinDate).NotNull().WithMessage("'joinDate' is required.");
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.JoinDate).When(x => x.EndDate.HasValue && x.JoinDate.HasValue)
            .WithMessage("'endDate' must be on or after 'joinDate'.");
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class TransferEmployeeRequestValidator : AbstractValidator<TransferEmployeeRequest>
{
    public TransferEmployeeRequestValidator()
    {
        RuleFor(x => x.DepartmentId).GreaterThan(0).WithMessage("'departmentId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.EffectiveDate).NotNull().WithMessage("'effectiveDate' is required.");
        RuleFor(x => x.Reason).RequiredText("reason", 500);
    }
}

public sealed class DeactivateEmployeeRequestValidator : AbstractValidator<DeactivateEmployeeRequest>
{
    public DeactivateEmployeeRequestValidator()
    {
        RuleFor(x => x.EmploymentStatus).OneOf(LookupValues.DeactivationStatuses, "employmentStatus");
        RuleFor(x => x.EndDate).NotNull().WithMessage("'endDate' is required.");
        RuleFor(x => x.Reason).RequiredText("reason", 500);
    }
}

public sealed class UpdateMyProfileRequestValidator : AbstractValidator<UpdateMyProfileRequest>
{
    private const string PhonePattern = @"^\+?[0-9][0-9 -]{6,19}$";
    private static readonly string[] BloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

    public UpdateMyProfileRequestValidator()
    {
        RuleFor(x => x.MobileNumber).Matches(PhonePattern).When(x => x.MobileNumber is not null);
        RuleFor(x => x.EmergencyContactNumber).Matches(PhonePattern).When(x => x.EmergencyContactNumber is not null);
        RuleFor(x => x.Address).MaximumLength(400);
        RuleFor(x => x.EmergencyContactName).MaximumLength(150);
        RuleFor(x => x.BloodGroup).Must(v => v is null || BloodGroups.Contains(v, StringComparer.Ordinal))
            .WithMessage("'bloodGroup' must be a supported blood group or null.");
    }
}

public sealed class EmployeeSyncRequestValidator : AbstractValidator<EmployeeSyncRequest>
{
    public EmployeeSyncRequestValidator()
    {
        RuleFor(x => x.Employees).NotNull().Must(x => x.Count is >= 1 and <= 500)
            .WithMessage("'employees' must contain between 1 and 500 rows.");
        RuleForEach(x => x.Employees).ChildRules(row =>
        {
            row.RuleFor(x => x.EmployeeNumber).RequiredText("employeeNumber", 30).Matches(Rules.CodePattern);
            row.RuleFor(x => x.FirstName).RequiredText("firstName", 100);
            row.RuleFor(x => x.LastName).RequiredText("lastName", 100);
            row.RuleFor(x => x.WorkEmail).RequiredText("workEmail", 256).EmailAddress();
            row.RuleFor(x => x.Designation).MaximumLength(100);
            row.RuleFor(x => x.DepartmentCode).RequiredText("departmentCode", 20).Matches(Rules.CodePattern);
            row.RuleFor(x => x.ManagerEmployeeNumber).MaximumLength(30).Matches(Rules.CodePattern).When(x => !string.IsNullOrEmpty(x.ManagerEmployeeNumber));
            row.RuleFor(x => x.LocationCode).RequiredText("locationCode", 30).Matches(Rules.CodePattern);
            row.RuleFor(x => x.EmployeeType).OneOf(LookupValues.EmployeeTypes, "employeeType");
            row.RuleFor(x => x.EmploymentStatus).OneOf(LookupValues.EmploymentStatuses, "employmentStatus");
            row.RuleFor(x => x.JoinDate).NotEqual(default(DateOnly)).WithMessage("'joinDate' is required.");
            row.RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.JoinDate).When(x => x.EndDate.HasValue)
                .WithMessage("'endDate' must be on or after 'joinDate'.");
        });
    }
}

public sealed class CreateCardRequestValidator : AbstractValidator<CreateCardRequest>
{
    public CreateCardRequestValidator()
    {
        RuleFor(x => x.EmployeeId).GreaterThan(0).WithMessage("'employeeId' is required.");
        RuleFor(x => x.CardUid).RequiredText("cardUid", 32)
            .Matches(Rules.CardUidPattern).WithMessage("'cardUid' must be 4-32 hexadecimal characters.");
        RuleFor(x => x.CardType).OneOf(LookupValues.CardTypes, "cardType");
        RuleFor(x => x.ExpiresAtUtc).NotNull().When(x => x.CardType == "Temporary")
            .WithMessage("'expiresAtUtc' is required for temporary cards.");
    }
}

public sealed class ReplaceCardRequestValidator : AbstractValidator<ReplaceCardRequest>
{
    public ReplaceCardRequestValidator()
    {
        RuleFor(x => x.NewCardUid).RequiredText("newCardUid", 32)
            .Matches(Rules.CardUidPattern).WithMessage("'newCardUid' must be 4-32 hexadecimal characters.");
        RuleFor(x => x.Reason).RequiredText("reason", 500);
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class CreateCardRequestRequestValidator : AbstractValidator<CreateCardRequestRequest>
{
    public CreateCardRequestRequestValidator()
    {
        RuleFor(x => x.EmployeeId).GreaterThan(0).When(x => x.EmployeeId.HasValue)
            .WithMessage("'employeeId' must be positive.");
        RuleFor(x => x.RequestType).OneOf(LookupValues.CardRequestTypesOffered, "requestType");
        RuleFor(x => x.Reason).MaximumLength(500);
        RuleFor(x => x.Reason).Must(x => !string.IsNullOrWhiteSpace(x) && x.Trim().Length >= 5)
            .When(x => x.RequestType == "Lost").WithMessage("'reason' must be 5-500 characters for Lost requests.");
        RuleFor(x => x.Reason).OneOf(LookupValues.DamagedReasons, "reason")
            .When(x => x.RequestType == "Damaged");
        RuleFor(x => x.MobileNumber).RequiredText("mobileNumber", 20)
            .Matches(@"^\+?[0-9][0-9 -]{6,19}$").WithMessage("'mobileNumber' has an invalid format.");
        RuleFor(x => x.Address).RequiredText("address", 400);
        RuleFor(x => x.BloodGroup).OneOf(LookupValues.BloodGroups, "bloodGroup");
        RuleFor(x => x.EmergencyContactName).RequiredText("emergencyContactName", 150);
        RuleFor(x => x.EmergencyContactNumber).RequiredText("emergencyContactNumber", 20)
            .Matches(@"^\+?[0-9][0-9 -]{6,19}$").WithMessage("'emergencyContactNumber' has an invalid format.");
        RuleFor(x => x).Must(x => (string.IsNullOrWhiteSpace(x.PhotoBase64) && string.IsNullOrWhiteSpace(x.PhotoContentType))
                                 || (!string.IsNullOrWhiteSpace(x.PhotoBase64) && !string.IsNullOrWhiteSpace(x.PhotoContentType)))
            .WithMessage("'photoBase64' and 'photoContentType' must be supplied together.");
        RuleFor(x => x).Must(ValidPhoto).WithMessage("Photo must be valid JPEG or PNG base64 data up to 1 MB.");
    }

    private static bool ValidPhoto(CreateCardRequestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.PhotoBase64) && string.IsNullOrWhiteSpace(request.PhotoContentType))
            return true;

        string value = request.PhotoBase64!.Trim();
        int comma = value.IndexOf(',');
        if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
            value = value[(comma + 1)..];
        try
        {
            byte[] bytes = Convert.FromBase64String(value);
            if (bytes.Length is < 1 or > 1_048_576)
                return false;
            return request.PhotoContentType switch
            {
                "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
                "image/png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
                _ => false
            };
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed class CardRequestDecisionRequestValidator : AbstractValidator<CardRequestDecisionRequest>
{
    public CardRequestDecisionRequestValidator()
    {
        RuleFor(x => x.Action).OneOf(LookupValues.CardRequestActions, "action");
        RuleFor(x => x.Comments).MaximumLength(1000);
        RuleFor(x => x.Comments).Must(c => !string.IsNullOrWhiteSpace(c)).When(x => x.Action == "Reject")
            .WithMessage("'comments' are required when rejecting.");
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class CreateAccessRequestRequestValidator : AbstractValidator<CreateAccessRequestRequest>
{
    public CreateAccessRequestRequestValidator()
    {
        RuleFor(x => x.EmployeeId).GreaterThan(0).When(x => x.EmployeeId.HasValue)
            .WithMessage("'employeeId' must be positive.");
        RuleFor(x => x.AccessType).OneOf(LookupValues.AccessTypes, "accessType");
        RuleFor(x => x.BuildingLocationId).GreaterThan(0).WithMessage("'buildingLocationId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.DurationCode).OneOf(LookupValues.DurationCodes, "durationCode");
        RuleFor(x => x.Justification).RequiredText("justification", 1000)
            .MinimumLength(10).WithMessage("'justification' must be at least 10 characters.");
        RuleFor(x => x.ValidFromUtc).Must(x => !x.HasValue || x.Value >= DateTime.UtcNow.AddMinutes(-5))
            .WithMessage("'validFromUtc' cannot be earlier than five minutes ago.");
        RuleFor(x => x.ValidToUtc).NotNull().When(x => x.DurationCode == "Custom")
            .WithMessage("'validToUtc' is required for Custom duration.");
        RuleFor(x => x.ValidToUtc).GreaterThan(x => x.ValidFromUtc)
            .When(x => x.DurationCode == "Custom" && x.ValidFromUtc.HasValue && x.ValidToUtc.HasValue)
            .WithMessage("'validToUtc' must be later than 'validFromUtc'.");
        RuleFor(x => x.ValidToUtc).Must((x, to) => !to.HasValue || !x.ValidFromUtc.HasValue || to.Value <= x.ValidFromUtc.Value.AddYears(1))
            .When(x => x.DurationCode == "Custom").WithMessage("A custom access duration cannot exceed one year.");
    }
}

public sealed class UpdateAccessRequestRequestValidator : AbstractValidator<UpdateAccessRequestRequest>
{
    public UpdateAccessRequestRequestValidator()
    {
        RuleFor(x => x.AccessType).OneOf(LookupValues.AccessTypes, "accessType");
        RuleFor(x => x.BuildingLocationId).GreaterThan(0).WithMessage("'buildingLocationId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.DurationCode).OneOf(LookupValues.DurationCodes, "durationCode");
        RuleFor(x => x.Justification).RequiredText("justification", 1000)
            .MinimumLength(10).WithMessage("'justification' must be at least 10 characters.");
        RuleFor(x => x.ValidFromUtc).Must(x => !x.HasValue || x.Value >= DateTime.UtcNow.AddMinutes(-5))
            .WithMessage("'validFromUtc' cannot be earlier than five minutes ago.");
        RuleFor(x => x.ValidToUtc).NotNull().When(x => x.DurationCode == "Custom")
            .WithMessage("'validToUtc' is required for Custom duration.");
        RuleFor(x => x.ValidToUtc).GreaterThan(x => x.ValidFromUtc)
            .When(x => x.DurationCode == "Custom" && x.ValidFromUtc.HasValue && x.ValidToUtc.HasValue)
            .WithMessage("'validToUtc' must be later than 'validFromUtc'.");
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class ApprovalDecisionRequestValidator : AbstractValidator<ApprovalDecisionRequest>
{
    public ApprovalDecisionRequestValidator()
    {
        RuleFor(x => x.Decision).OneOf(LookupValues.ApprovalDecisions, "decision");
        RuleFor(x => x.Comments).MaximumLength(1000);
        RuleFor(x => x.Comments).Must(c => !string.IsNullOrWhiteSpace(c)).When(x => x.Decision is "Return" or "Reject")
            .WithMessage("'comments' are required when returning or rejecting a request.");
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class ProvisionPermissionRequestValidator : AbstractValidator<ProvisionPermissionRequest>
{
    public ProvisionPermissionRequestValidator() => RuleFor(x => x.AccessRequestId).GreaterThan(0).WithMessage("'accessRequestId' is required.");
}

public sealed class RfidEventRequestValidator : AbstractValidator<RfidEventRequest>
{
    public RfidEventRequestValidator()
    {
        RuleFor(x => x.ReaderId).RequiredText("readerId", 80);
        RuleFor(x => x.ExternalEventId).RequiredText("externalEventId", 100);
        RuleFor(x => x.CardUid).RequiredText("cardUid", 64);
        RuleFor(x => x.EventType).OneOf(LookupValues.EventTypes, "eventType");
        RuleFor(x => x.EventAtUtc).NotNull().WithMessage("'eventAtUtc' is required.");
        RuleFor(x => x.EventAtUtc).Must(d => d!.Value.ToUniversalTime() <= DateTime.UtcNow.AddMinutes(5))
            .When(x => x.EventAtUtc.HasValue).WithMessage("'eventAtUtc' cannot be in the future.");
    }
}

public sealed class ReviewViolationRequestValidator : AbstractValidator<ReviewViolationRequest>
{
    public ReviewViolationRequestValidator()
    {
        RuleFor(x => x.Status).OneOf(LookupValues.ViolationStatuses.Where(s => s != "Open").ToArray(), "status");
        RuleFor(x => x.ReviewNotes).RequiredText("reviewNotes", 2000);
    }
}

public sealed class CreateIncidentRequestValidator : AbstractValidator<CreateIncidentRequest>
{
    public CreateIncidentRequestValidator()
    {
        RuleFor(x => x.Title).RequiredText("title", 200);
        RuleFor(x => x.Description).MaximumLength(4000);
        RuleFor(x => x.IncidentType).OneOf(LookupValues.IncidentTypes, "incidentType");
        RuleFor(x => x.Severity).OneOf(LookupValues.Severities, "severity");
    }
}

public sealed class UpdateIncidentRequestValidator : AbstractValidator<UpdateIncidentRequest>
{
    public UpdateIncidentRequestValidator()
    {
        RuleFor(x => x.Status).OneOf(LookupValues.IncidentStatuses, "status").When(x => x.Status is not null);
        RuleFor(x => x.Resolution).MaximumLength(4000);
        RuleFor(x => x.Note).MaximumLength(4000);
        RuleFor(x => x.Version).RequiredVersion();
    }
}

public sealed class CreateBlacklistRequestValidator : AbstractValidator<CreateBlacklistRequest>
{
    public CreateBlacklistRequestValidator()
    {
        RuleFor(x => x.SubjectType).OneOf(LookupValues.BlacklistSubjectTypes, "subjectType");
        RuleFor(x => x.SubjectId).GreaterThan(0).WithMessage("'subjectId' is required.");
        RuleFor(x => x.Reason).RequiredText("reason", 1000);
    }
}

public sealed class CreateVisitorRequestValidator : AbstractValidator<CreateVisitorRequest>
{
    public CreateVisitorRequestValidator()
    {
        RuleFor(x => x.DisplayName).RequiredText("displayName", 150);
        RuleFor(x => x.Organization).MaximumLength(150);
        RuleFor(x => x.ContactReference).MaximumLength(150);
        RuleFor(x => x.VisitPurpose).RequiredText("visitPurpose", 500);
    }
}

public sealed class CreateVisitorPassRequestValidator : AbstractValidator<CreateVisitorPassRequest>
{
    public CreateVisitorPassRequestValidator()
    {
        RuleFor(x => x.VisitorId).GreaterThan(0).WithMessage("'visitorId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.ValidFromUtc).NotNull().WithMessage("'validFromUtc' is required.");
        RuleFor(x => x.ValidToUtc).NotNull().WithMessage("'validToUtc' is required.");
        RuleFor(x => x.ValidToUtc).GreaterThan(x => x.ValidFromUtc).When(x => x.ValidFromUtc.HasValue && x.ValidToUtc.HasValue)
            .WithMessage("'validToUtc' must be later than 'validFromUtc'.");
    }
}

public sealed class SaveAdminUserRequestValidator : AbstractValidator<SaveAdminUserRequest>
{
    public SaveAdminUserRequestValidator()
    {
        RuleFor(x => x.DisplayName).RequiredText("displayName", 150);
        RuleFor(x => x.Email).RequiredText("email", 256).EmailAddress().WithMessage("'email' must be a valid email address.");
        RuleFor(x => x.RoleIds).NotNull().Must(r => r.All(id => id > 0)).WithMessage("'roleIds' must contain valid role ids.");
        RuleFor(x => x.FacilityIds).NotNull().Must(r => r.All(id => id > 0)).WithMessage("'facilityIds' must contain valid location ids.");
    }
}

public sealed class SetRolePermissionsRequestValidator : AbstractValidator<SetRolePermissionsRequest>
{
    public SetRolePermissionsRequestValidator()
        => RuleFor(x => x.PermissionIds).NotNull().WithMessage("'permissionIds' is required.")
            .Must(p => p!.All(id => id > 0)).When(x => x.PermissionIds is not null).WithMessage("'permissionIds' must contain valid ids.");
}

public sealed class SaveDepartmentRequestValidator : AbstractValidator<SaveDepartmentRequest>
{
    public SaveDepartmentRequestValidator()
    {
        RuleFor(x => x.DepartmentCode).RequiredText("departmentCode", 20).Matches(Rules.CodePattern)
            .WithMessage("'departmentCode' may contain letters, digits, '-' and '_' only.");
        RuleFor(x => x.DepartmentName).RequiredText("departmentName", 150);
    }
}

public sealed class SaveLocationRequestValidator : AbstractValidator<SaveLocationRequest>
{
    public SaveLocationRequestValidator()
    {
        RuleFor(x => x.LocationCode).RequiredText("locationCode", 30).Matches(Rules.CodePattern)
            .WithMessage("'locationCode' may contain letters, digits, '-' and '_' only.");
        RuleFor(x => x.LocationName).RequiredText("locationName", 150);
        RuleFor(x => x.LocationType).OneOf(LookupValues.LocationTypes, "locationType");
        RuleFor(x => x.TimeZone).MaximumLength(64);
    }
}

public sealed class SaveReaderRequestValidator : AbstractValidator<SaveReaderRequest>
{
    public SaveReaderRequestValidator()
    {
        RuleFor(x => x.ReaderId).RequiredText("readerId", 80).Matches(Rules.CodePattern)
            .WithMessage("'readerId' may contain letters, digits, '-' and '_' only.");
        RuleFor(x => x.ReaderName).RequiredText("readerName", 150);
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.Direction).OneOf(LookupValues.ReaderDirections, "direction");
    }
}

public sealed class UpdateSettingRequestValidator : AbstractValidator<UpdateSettingRequest>
{
    public UpdateSettingRequestValidator()
    {
        RuleFor(x => x.SettingKey).RequiredText("settingKey", 100);
        RuleFor(x => x.SettingValue).NotNull().WithMessage("'settingValue' is required.").MaximumLength(4000);
    }
}
