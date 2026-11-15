using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
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
        RuleFor(x => x.EmployeeId).GreaterThan(0).WithMessage("'employeeId' is required.");
        RuleFor(x => x.RequestType).OneOf(LookupValues.CardRequestTypes, "requestType");
        RuleFor(x => x.Reason).RequiredText("reason", 500);
    }
}

public sealed class CardRequestDecisionRequestValidator : AbstractValidator<CardRequestDecisionRequest>
{
    public CardRequestDecisionRequestValidator()
    {
        RuleFor(x => x.Decision).OneOf(LookupValues.CardRequestDecisions, "decision");
        RuleFor(x => x.Comments).MaximumLength(1000);
        RuleFor(x => x.Comments).Must(c => !string.IsNullOrWhiteSpace(c)).When(x => x.Decision == "Reject")
            .WithMessage("'comments' are required when rejecting.");
    }
}

public sealed class CreateAccessRequestRequestValidator : AbstractValidator<CreateAccessRequestRequest>
{
    public CreateAccessRequestRequestValidator()
    {
        RuleFor(x => x.EmployeeId).GreaterThan(0).WithMessage("'employeeId' is required.");
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.BusinessJustification).RequiredText("businessJustification", 1000)
            .MinimumLength(10).WithMessage("'businessJustification' must be at least 10 characters.");
        RuleFor(x => x.ValidFromUtc).NotNull().WithMessage("'validFromUtc' is required.");
        RuleFor(x => x.ValidToUtc).NotNull().WithMessage("'validToUtc' is required.");
        RuleFor(x => x.ValidToUtc).GreaterThan(x => x.ValidFromUtc).When(x => x.ValidFromUtc.HasValue && x.ValidToUtc.HasValue)
            .WithMessage("'validToUtc' must be later than 'validFromUtc'.");
    }
}

public sealed class UpdateAccessRequestRequestValidator : AbstractValidator<UpdateAccessRequestRequest>
{
    public UpdateAccessRequestRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0).WithMessage("'locationId' is required.");
        RuleFor(x => x.BusinessJustification).RequiredText("businessJustification", 1000)
            .MinimumLength(10).WithMessage("'businessJustification' must be at least 10 characters.");
        RuleFor(x => x.ValidFromUtc).NotNull().WithMessage("'validFromUtc' is required.");
        RuleFor(x => x.ValidToUtc).NotNull().WithMessage("'validToUtc' is required.");
        RuleFor(x => x.ValidToUtc).GreaterThan(x => x.ValidFromUtc).When(x => x.ValidFromUtc.HasValue && x.ValidToUtc.HasValue)
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
