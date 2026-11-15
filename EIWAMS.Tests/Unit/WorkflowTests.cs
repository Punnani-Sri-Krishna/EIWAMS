using EIWAMS.Domain.Workflow;

namespace EIWAMS.Tests.Unit;

public class WorkflowTests
{
    [Theory]
    [InlineData("Draft", "Submitted", true)]
    [InlineData("PendingApproval", "Approved", true)]
    [InlineData("Approved", "Provisioned", true)]
    [InlineData("Draft", "Provisioned", false)]
    [InlineData("PendingApproval", "Provisioned", false)]
    [InlineData("Rejected", "PendingApproval", false)]
    public void AccessRequestTransitions(string from, string to, bool allowed)
        => Assert.Equal(allowed, AccessRequestWorkflow.CanTransition(from, to));

    [Fact]
    public void StagesAdvanceManagerSecurityFacilityAdminThenApproved()
    {
        Assert.Equal("Security", AccessRequestWorkflow.NextStage("Manager"));
        Assert.Equal("FacilityAdmin", AccessRequestWorkflow.NextStage("Security"));
        Assert.Null(AccessRequestWorkflow.NextStage("FacilityAdmin"));
        Assert.Equal("PendingApproval", AccessRequestWorkflow.StatusAfterDecision("Manager", "Approve"));
        Assert.Equal("Approved", AccessRequestWorkflow.StatusAfterDecision("FacilityAdmin", "Approve"));
        Assert.Equal("Rejected", AccessRequestWorkflow.StatusAfterDecision("Security", "Reject"));
        Assert.Equal("Returned", AccessRequestWorkflow.StatusAfterDecision("Manager", "Return"));
    }

    [Fact]
    public void EditableAndTerminalStates()
    {
        Assert.True(AccessRequestWorkflow.IsEditable("Draft"));
        Assert.True(AccessRequestWorkflow.IsEditable("Returned"));
        Assert.False(AccessRequestWorkflow.IsEditable("PendingApproval"));
        Assert.True(AccessRequestWorkflow.IsTerminal("Rejected"));
        Assert.False(AccessRequestWorkflow.IsTerminal("Approved"));
    }

    [Theory]
    [InlineData("Approve", "PendingApproval", true)]
    [InlineData("CheckIn", "Approved", true)]
    [InlineData("CheckOut", "Active", true)]
    [InlineData("CheckIn", "PendingApproval", false)]
    [InlineData("CheckOut", "Approved", false)]
    [InlineData("Revoke", "CheckedOut", false)]
    public void VisitorPassActions(string action, string status, bool allowed)
        => Assert.Equal(allowed, VisitorPassWorkflow.IsAllowed(action, status));
}
