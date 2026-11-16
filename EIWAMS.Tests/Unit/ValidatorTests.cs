using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Validators;
using FluentValidation.Results;

namespace EIWAMS.Tests.Unit;

public class ValidatorTests
{
    private static CreateEmployeeRequest ValidEmployee() => new()
    {
        EmployeeNumber = "EMP2001",
        FirstName = "Ananya",
        LastName = "Iyer",
        WorkEmail = "ananya.iyer@example.com",
        EmployeeType = "Permanent",
        DepartmentId = 1,
        LocationId = 2,
        JoinDate = new DateOnly(2025, 1, 6),
    };

    [Fact]
    public void CreateEmployee_ValidRequestPasses()
        => Assert.True(new CreateEmployeeRequestValidator().Validate(ValidEmployee()).IsValid);

    [Theory]
    [InlineData("EMP 01; DROP", "ananya.iyer@example.com", "Permanent")]
    [InlineData("EMP2001", "not-an-email", "Permanent")]
    [InlineData("EMP2001", "ananya.iyer@example.com", "Consultant")]
    public void CreateEmployee_InvalidFieldsFail(string number, string email, string type)
    {
        CreateEmployeeRequest request = ValidEmployee();
        request.EmployeeNumber = number;
        request.WorkEmail = email;
        request.EmployeeType = type;
        Assert.False(new CreateEmployeeRequestValidator().Validate(request).IsValid);
    }

    [Fact]
    public void CreateEmployee_EndDateBeforeJoinDateFails()
    {
        CreateEmployeeRequest request = ValidEmployee();
        request.EndDate = request.JoinDate!.Value.AddDays(-1);
        Assert.Contains(new CreateEmployeeRequestValidator().Validate(request).Errors, e => e.ErrorMessage.Contains("endDate"));
    }

    [Fact]
    public void CreateAccessRequest_InvalidDateRangeFails()
    {
        var request = new CreateAccessRequestRequest
        {
            EmployeeId = 6,
            AccessType = "WingFloor",
            BuildingLocationId = 2,
            LocationId = 10,
            DurationCode = "Custom",
            Justification = "Project work in the R&D lab",
            ValidFromUtc = DateTime.UtcNow.AddDays(5),
            ValidToUtc = DateTime.UtcNow.AddDays(1),
        };
        ValidationResult result = new CreateAccessRequestRequestValidator().Validate(request);
        Assert.Contains(result.Errors, e => e.ErrorMessage.Contains("validToUtc"));
    }

    [Fact]
    public void CardRequest_RejectsInvalidReasonAndPhotoMetadata()
    {
        var request = new EIWAMS.Application.Models.DTOs.Cards.CreateCardRequestRequest
        {
            RequestType = "Lost",
            Reason = "lost",
            MobileNumber = "+1 555 555 5555",
            Address = "Somewhere",
            BloodGroup = "O+",
            EmergencyContactName = "Contact",
            EmergencyContactNumber = "+1 555 555 5556",
            PhotoBase64 = Convert.ToBase64String([1, 2, 3]),
            PhotoContentType = "image/jpeg",
        };
        Assert.False(new CreateCardRequestRequestValidator().Validate(request).IsValid);
    }

    [Fact]
    public void CardRequest_ValidatesDamagedReasonAndPhotoSignature()
    {
        var request = new EIWAMS.Application.Models.DTOs.Cards.CreateCardRequestRequest
        {
            RequestType = "Damaged",
            Reason = "Broken",
            MobileNumber = "+1 555 555 5555",
            Address = "Somewhere",
            BloodGroup = "O+",
            EmergencyContactName = "Contact",
            EmergencyContactNumber = "+1 555 555 5556",
            PhotoBase64 = Convert.ToBase64String([0xFF, 0xD8, 0xFF]),
            PhotoContentType = "image/jpeg",
        };
        Assert.True(new CreateCardRequestRequestValidator().Validate(request).IsValid);
    }

    [Theory]
    [InlineData("Reject", null, false)]
    [InlineData("Return", "  ", false)]
    [InlineData("Reject", "Not justified", true)]
    [InlineData("Approve", null, true)]
    [InlineData("Escalate", "x", false)]
    public void ApprovalDecision_CommentsRequiredForRejectAndReturn(string decision, string? comments, bool valid)
    {
        var request = new ApprovalDecisionRequest { Decision = decision, Comments = comments, Version = [1, 2, 3, 4, 5, 6, 7, 8] };
        Assert.Equal(valid, new ApprovalDecisionRequestValidator().Validate(request).IsValid);
    }

    [Fact]
    public void ApprovalDecision_VersionRequired()
        => Assert.False(new ApprovalDecisionRequestValidator().Validate(new ApprovalDecisionRequest { Decision = "Approve" }).IsValid);

    [Theory]
    [InlineData("Entry", 0, true)]
    [InlineData("Tailgate", 0, false)]
    [InlineData("Exit", 60, false)]
    public void RfidEvent_EventTypeAndFutureTimestampValidated(string eventType, int minutesAhead, bool valid)
    {
        var request = new RfidEventRequest
        {
            ReaderId = "RDR-BLR-ODC1-01",
            ExternalEventId = "evt-1",
            CardUid = "04A10000000007",
            EventType = eventType,
            EventAtUtc = DateTime.UtcNow.AddMinutes(minutesAhead),
        };
        Assert.Equal(valid, new RfidEventRequestValidator().Validate(request).IsValid);
    }
}
