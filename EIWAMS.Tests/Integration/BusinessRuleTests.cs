using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Infrastructure.DataAccessLayer;
using EIWAMS.Infrastructure.Repositories.Implementations;
using Microsoft.Data.SqlClient;

namespace EIWAMS.Tests.Integration;

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class DatabaseCollection
{
    public const string Name = "Database";
}

/// <summary>SDD 17.2 core cases, executed against the stored procedures in a disposable *_Test database.</summary>
[Collection(DatabaseCollection.Name)]
public class BusinessRuleTests
{
    private const int AdminUserId = 1;
    private const int ManagerUserId = 3;
    private const int SecurityUserId = 4;
    private const int FacilityAdminUserId = 5;
    private const int EshaUserId = 7;
    private const int EshaEmployeeId = 6;

    private readonly IDbConnectionFactory _factory = new SqlDbConnectionFactory(TestDatabase.ConnectionString);

    private static ActorContext Actor(int userId) => new(userId, [], [], Guid.NewGuid(), "127.0.0.1");

    private static async Task EnsureDatabaseAsync()
    {
        string? skipReason = await TestDatabase.EnsureDeployedAsync();
        Skip.If(skipReason is not null, skipReason);
    }

    private static string Unique(string prefix) => prefix + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();

    private async Task<T> ScalarAsync<T>(string sql, object? args = null)
    {
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        return await connection.ExecuteScalarAsync<T>(sql, args) ?? throw new InvalidOperationException(sql);
    }

    private async Task<EmployeeDetailDto> CreateEmployeeAsync(string? number = null)
    {
        int departmentId = await ScalarAsync<int>("SELECT TOP (1) DepartmentId FROM dbo.Departments ORDER BY DepartmentId");
        int locationId = await ScalarAsync<int>("SELECT LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-ODC1'");
        number ??= Unique("IT");
        return await new EmployeeRepository(_factory).CreateAsync(Actor(AdminUserId), new CreateEmployeeRequest
        {
            EmployeeNumber = number,
            FirstName = "Kavya",
            LastName = "Menon",
            WorkEmail = $"{number.ToLowerInvariant()}@example.com",
            EmployeeType = "Permanent",
            DepartmentId = departmentId,
            LocationId = locationId,
            JoinDate = new DateOnly(2025, 4, 1),
        });
    }

    private async Task<(CardDto Card, string Uid)> CreateActiveCardAsync(int employeeId)
    {
        var cards = new CardRepository(_factory);
        string uid = Unique("04F");
        CardDto card = await cards.CreateAsync(Actor(AdminUserId), new CreateCardRequest { EmployeeId = employeeId, CardUid = uid, CardType = "Permanent" });
        return (await cards.ActivateAsync(Actor(AdminUserId), card.CardId, card.Version!), uid);
    }

    private Task<RfidIngestResultDto> SwipeAsync(string readerId, string cardUid, string? eventId = null)
        => new SecurityRepository(_factory).IngestEventAsync(Actor(AdminUserId), new RfidEventRequest
        {
            ReaderId = readerId,
            ExternalEventId = eventId ?? Unique("EVT"),
            CardUid = cardUid,
            EventType = "Entry",
            EventAtUtc = DateTime.UtcNow,
        });

    private static async Task<ErrorType> ErrorOf(Func<Task> action) => (await Assert.ThrowsAsync<AppException>(action)).ErrorType;

    [SkippableFact]
    public async Task DuplicateEmployeeNumberIsConflict()
    {
        await EnsureDatabaseAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync();
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => CreateEmployeeAsync(employee.EmployeeNumber)));
    }

    [SkippableFact]
    public async Task DuplicateCardUidIsConflict()
    {
        await EnsureDatabaseAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync();
        (_, string uid) = await CreateActiveCardAsync(employee.EmployeeId);
        EmployeeDetailDto other = await CreateEmployeeAsync();

        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => new CardRepository(_factory).CreateAsync(
            Actor(AdminUserId), new CreateCardRequest { EmployeeId = other.EmployeeId, CardUid = uid.ToLowerInvariant(), CardType = "Permanent" })));
    }

    [SkippableFact]
    public async Task LostCardIsBlockedImmediatelyAndSwipeIsDeniedWithViolation()
    {
        await EnsureDatabaseAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync();
        (CardDto card, string uid) = await CreateActiveCardAsync(employee.EmployeeId);

        CardDto lost = await new CardRepository(_factory).ReportLostAsync(Actor(AdminUserId), card.CardId, "Lost in the cab");
        Assert.Equal("Lost", lost.Status);

        RfidIngestResultDto swipe = await SwipeAsync("RDR-BLR-ODC1-01", uid);
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("CardLost", swipe.DenialReason);
        Assert.NotNull(swipe.ViolationId);
    }

    [SkippableFact]
    public async Task BlockedCardSwipeIsDeniedAndCreatesViolation()
    {
        await EnsureDatabaseAsync();
        RfidIngestResultDto swipe = await SwipeAsync("RDR-BLR-ODC1-01", "04A10000001012");
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("CardBlocked", swipe.DenialReason);
        Assert.NotNull(swipe.ViolationId);
    }

    [SkippableFact]
    public async Task ExpiredPermissionSwipeIsDenied()
    {
        await EnsureDatabaseAsync();
        RfidIngestResultDto swipe = await SwipeAsync("RDR-BLR-RND-01", "04A10000001020");
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("PermissionExpired", swipe.DenialReason);
    }

    [SkippableFact]
    public async Task DuplicateRfidEventIsIdempotent()
    {
        await EnsureDatabaseAsync();
        string eventId = Unique("DUP");
        RfidIngestResultDto first = await SwipeAsync("RDR-BLR-ODC1-01", "04A10000000007", eventId);
        RfidIngestResultDto second = await SwipeAsync("RDR-BLR-ODC1-01", "04A10000000007", eventId);

        Assert.Equal("Granted", first.Decision);
        Assert.False(first.IsDuplicate);
        Assert.True(second.IsDuplicate);
        Assert.Equal(first.AccessLogId, second.AccessLogId);
        Assert.Equal(1, await ScalarAsync<int>("SELECT COUNT(*) FROM dbo.AccessLogs WHERE ExternalEventId = @eventId", new { eventId }));
    }

    [SkippableFact]
    public async Task UnknownCardIsDeniedAndQueuedForReview()
    {
        await EnsureDatabaseAsync();
        RfidIngestResultDto swipe = await SwipeAsync("RDR-BLR-ODC1-01", Unique("FFFF"));
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("UnknownCard", swipe.DenialReason);
        Assert.Equal("Review", swipe.ProcessingStatus);
    }

    [SkippableFact]
    public async Task ApprovalWorkflowEnforcesStagesReasonsDuplicatesAndProvisioningOrder()
    {
        await EnsureDatabaseAsync();
        var access = new AccessRepository(_factory);
        int locationId = await ScalarAsync<int>("SELECT LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-RND'");
        AccessRequestDetailDto request = await access.CreateRequestAsync(Actor(EshaUserId), new CreateAccessRequestRequest
        {
            EmployeeId = EshaEmployeeId,
            LocationId = locationId,
            BusinessJustification = "Integration test: R&D lab access for prototype validation",
            ValidFromUtc = DateTime.UtcNow.AddDays(1),
            ValidToUtc = DateTime.UtcNow.AddDays(30),
            Submit = true,
        });
        Assert.Equal("PendingApproval", request.Status);
        Assert.Equal("Manager", request.CurrentStage);
        long id = request.AccessRequestId;

        ApprovalDecisionRequest Approve(byte[] version) => new() { Decision = "Approve", Comments = "OK", Version = version };

        Assert.Equal(ErrorType.Forbidden, await ErrorOf(() => access.DecideAsync(Actor(SecurityUserId), id, Approve(request.Version!))));
        Assert.Equal(ErrorType.Validation, await ErrorOf(() => access.DecideAsync(Actor(ManagerUserId), id,
            new ApprovalDecisionRequest { Decision = "Reject", Comments = null, Version = request.Version })));
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.ProvisionAsync(Actor(FacilityAdminUserId), id)));

        AccessRequestDetailDto afterManager = await access.DecideAsync(Actor(ManagerUserId), id, Approve(request.Version!));
        Assert.Equal("Security", afterManager.CurrentStage);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.DecideAsync(Actor(ManagerUserId), id, Approve(request.Version!))));

        AccessRequestDetailDto afterSecurity = await access.DecideAsync(Actor(SecurityUserId), id, Approve(afterManager.Version!));
        AccessRequestDetailDto approved = await access.DecideAsync(Actor(FacilityAdminUserId), id, Approve(afterSecurity.Version!));
        Assert.Equal("Approved", approved.Status);

        AccessPermissionDto permission = await access.ProvisionAsync(Actor(FacilityAdminUserId), id);
        Assert.Equal("Active", permission.Status);
        Assert.Equal("Provisioned", (await access.GetRequestAsync(Actor(EshaUserId), id)).Status);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.ProvisionAsync(Actor(FacilityAdminUserId), id)));
    }

    [SkippableFact]
    public async Task InvalidDateRangeIsValidationError()
    {
        await EnsureDatabaseAsync();
        int locationId = await ScalarAsync<int>("SELECT LocationId FROM dbo.Locations WHERE LocationCode = N'BLR-TA-ODC2'");
        Assert.Equal(ErrorType.Validation, await ErrorOf(() => new AccessRepository(_factory).CreateRequestAsync(Actor(EshaUserId), new CreateAccessRequestRequest
        {
            EmployeeId = EshaEmployeeId,
            LocationId = locationId,
            BusinessJustification = "Integration test: invalid window",
            ValidFromUtc = DateTime.UtcNow.AddDays(10),
            ValidToUtc = DateTime.UtcNow.AddDays(2),
        })));

        Assert.Equal(ErrorType.Validation, await ErrorOf(() => new SecurityRepository(_factory).SearchAccessLogsAsync(
            Actor(AdminUserId), new AccessLogQuery { From = DateTime.UtcNow, To = DateTime.UtcNow.AddDays(-1) })));
    }

    [SkippableFact]
    public async Task DeactivatingEmployeeDeactivatesCardsAndRevokesAccess()
    {
        await EnsureDatabaseAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync();
        (CardDto card, string uid) = await CreateActiveCardAsync(employee.EmployeeId);
        var employees = new EmployeeRepository(_factory);

        EmployeeDetailDto exited = await employees.DeactivateAsync(Actor(AdminUserId), employee.EmployeeId, new DeactivateEmployeeRequest
        {
            EmploymentStatus = "Exited",
            EndDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Reason = "Resigned",
        });

        Assert.Equal("Exited", exited.EmploymentStatus);
        Assert.All(await employees.GetCardsAsync(Actor(AdminUserId), employee.EmployeeId), c => Assert.Equal("Deactivated", c.Status));
        Assert.Equal(0, await ScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.AccessPermissions WHERE EmployeeId = @id AND Status = N'Active'", new { id = employee.EmployeeId }));
        Assert.Equal("Denied", (await SwipeAsync("RDR-BLR-ODC1-01", uid)).Decision);
        Assert.NotEqual(0, card.CardId);
    }

    [SkippableTheory]
    [InlineData("UPDATE TOP (1) dbo.AuditLogs SET Summary = N'tampered'")]
    [InlineData("DELETE TOP (1) FROM dbo.AuditLogs")]
    public async Task AuditLogIsAppendOnly(string sql)
    {
        await EnsureDatabaseAsync();
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        SqlException ex = await Assert.ThrowsAsync<SqlException>(() => connection.ExecuteAsync(sql));
        Assert.Equal(50403, ex.Number);
    }

    [SkippableFact]
    public async Task SqlInjectionInSearchIsTreatedAsDataAndPageSizeIsCapped()
    {
        await EnsureDatabaseAsync();
        var employees = new EmployeeRepository(_factory);

        PagedResult<EmployeeListItemDto> injected = await employees.SearchAsync(Actor(AdminUserId),
            new EmployeeQuery { Search = "'; DROP TABLE dbo.Employees; --", Page = 1, PageSize = 20 });
        Assert.Equal(0, injected.TotalCount);

        PagedResult<EmployeeListItemDto> all = await employees.SearchAsync(Actor(AdminUserId), new EmployeeQuery { Page = 1, PageSize = 5000 });
        Assert.Equal(100, all.PageSize);
        Assert.True(all.TotalCount > 0);
        Assert.True(all.Items.Count <= 100);
    }
}
