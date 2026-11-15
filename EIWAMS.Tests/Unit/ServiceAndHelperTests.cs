using EIWAMS.API.Helpers;
using EIWAMS.API.Middleware;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Application.Utilities;
using EIWAMS.Domain.Services.Implementations;
using EIWAMS.Infrastructure.Repositories.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace EIWAMS.Tests.Unit;

public class ServiceAndHelperTests
{
    private static readonly ActorContext Actor = new(3, ["Manager"], ["Approvals.Decide"], Guid.NewGuid(), "127.0.0.1");

    private static ICurrentUserAccessor Accessor()
    {
        var accessor = Substitute.For<ICurrentUserAccessor>();
        accessor.GetActor().Returns(Actor);
        return accessor;
    }

    [Theory]
    [InlineData("Reject")]
    [InlineData("Return")]
    public async Task AccessService_RejectOrReturnWithoutCommentsNeverReachesDatabase(string decision)
    {
        var repository = Substitute.For<IAccessRepository>();
        var service = new AccessService(repository, Accessor(), NullLogger<AccessService>.Instance);

        AppException ex = await Assert.ThrowsAsync<AppException>(() =>
            service.DecideAsync(11, new ApprovalDecisionRequest { Decision = decision, Comments = " ", Version = [1] }));

        Assert.Equal(ErrorType.Validation, ex.ErrorType);
        await repository.DidNotReceiveWithAnyArgs().DecideAsync(default!, default, default!);
    }

    [Fact]
    public async Task AccessService_ApprovePassesActorFromRequestContext()
    {
        var repository = Substitute.For<IAccessRepository>();
        repository.DecideAsync(Actor, 11, Arg.Any<ApprovalDecisionRequest>()).Returns(new AccessRequestDetailDto { Status = "PendingApproval" });
        var service = new AccessService(repository, Accessor(), NullLogger<AccessService>.Instance);

        AccessRequestDetailDto result = await service.DecideAsync(11, new ApprovalDecisionRequest { Decision = "Approve", Version = [1] });

        Assert.Equal("PendingApproval", result.Status);
        await repository.Received(1).DecideAsync(Actor, 11, Arg.Any<ApprovalDecisionRequest>());
    }

    [Fact]
    public async Task InsightsService_UnknownReportIsNotFound()
    {
        var repository = Substitute.For<IInsightsRepository>();
        var service = new InsightsService(repository, Accessor());

        AppException ex = await Assert.ThrowsAsync<AppException>(() => service.RunReportAsync("sys.objects", new ReportQuery()));
        Assert.Equal(ErrorType.NotFound, ex.ErrorType);
    }

    [Fact]
    public async Task InsightsService_ReportRowsUseCamelCaseColumnKeys()
    {
        var repository = Substitute.For<IInsightsRepository>();
        repository.RunReportAsync(Actor, Arg.Any<string>(), Arg.Any<ReportQuery>(), false).Returns(new ReportResult
        {
            Columns = ["EmployeeNumber", "DeniedCount"],
            Rows = [new object?[] { "EMP0007", 3 }],
            TotalCount = 1,
            Page = 1,
            PageSize = 20,
        });
        var service = new InsightsService(repository, Accessor());

        PagedResult<IDictionary<string, object?>> result = await service.RunReportAsync("access-activity", new ReportQuery());

        Assert.Equal("EMP0007", result.Items.Single()["employeeNumber"]);
        Assert.Equal(3, result.Items.Single()["deniedCount"]);
    }

    [Fact]
    public void BindQuery_FromAfterToIsValidationError()
    {
        var context = new DefaultHttpContext();
        context.Request.QueryString = new QueryString("?from=2026-02-01&to=2026-01-01");
        AppException ex = Assert.Throws<AppException>(() => FunctionBase.BindQuery<ReportQuery>(context.Request));
        Assert.Equal(ErrorType.Validation, ex.ErrorType);
    }

    [Fact]
    public void BindQuery_InvalidNumberIsValidationErrorAndSearchIsKeptAsData()
    {
        var context = new DefaultHttpContext();
        context.Request.QueryString = new QueryString("?page=abc");
        Assert.Throws<AppException>(() => FunctionBase.BindQuery<PagedQuery>(context.Request));

        context.Request.QueryString = QueryString.Create("search", "x' OR 1=1 --");
        Assert.Equal("x' OR 1=1 --", FunctionBase.BindQuery<PagedQuery>(context.Request).Search);
    }

    [Fact]
    public void CsvWriter_NeutralisesFormulaInjectionAndQuotes()
    {
        string csv = System.Text.Encoding.UTF8.GetString(CsvWriter.Write(["Name", "Note"], [new object?[] { "=HYPERLINK(\"x\")", "a,b" }]));
        Assert.Contains("\"'=HYPERLINK(\"\"x\"\")\"", csv);
        Assert.Contains("\"a,b\"", csv);
    }

    [Fact]
    public void RateLimiter_FixedWindowPerKey()
    {
        var clock = new ManualTimeProvider(new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var limiter = new RateLimiter(clock);

        Assert.True(limiter.TryAcquire("u1:ReportLostCard", 2));
        Assert.True(limiter.TryAcquire("u1:ReportLostCard", 2));
        Assert.False(limiter.TryAcquire("u1:ReportLostCard", 2));
        Assert.True(limiter.TryAcquire("u2:ReportLostCard", 2));

        clock.Advance(TimeSpan.FromMinutes(1));
        Assert.True(limiter.TryAcquire("u1:ReportLostCard", 2));
    }

    private sealed class ManualTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;

        public void Advance(TimeSpan by) => _now += by;

        public override DateTimeOffset GetUtcNow() => _now;
    }
}
