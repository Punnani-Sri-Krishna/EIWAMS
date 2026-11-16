using System.Data;
using System.Text.Json;
using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Infrastructure.Auth;
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
    private readonly IDbConnectionFactory _factory = new SqlDbConnectionFactory(TestDatabase.ConnectionString);
    private static readonly Lazy<Task<TestFixture>> SharedFixture = new(CreateFixtureAsync);

    private static ActorContext Actor(int userId) => new(userId, [], [], Guid.NewGuid(), "127.0.0.1");

    private async Task<TestFixture> EnsureFixtureAsync()
    {
        string? skipReason = await TestDatabase.EnsureDeployedAsync();
        Skip.If(skipReason is not null, skipReason);
        return await SharedFixture.Value;
    }

    private static string Unique(string prefix) => prefix + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();

    private async Task<T> ScalarAsync<T>(string sql, object? args = null)
    {
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        return await connection.ExecuteScalarAsync<T>(sql, args) ?? throw new InvalidOperationException(sql);
    }

    private static async Task<TestFixture> CreateFixtureAsync()
    {
        var factory = new SqlDbConnectionFactory(TestDatabase.ConnectionString);
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        await connection.OpenAsync();
        int adminUserId = await connection.ExecuteScalarAsync<int>("""
            SELECT TOP (1) u.UserId
            FROM dbo.Users u
            JOIN dbo.UserRoles ur ON ur.UserId = u.UserId
            JOIN dbo.Roles r ON r.RoleId = ur.RoleId
            WHERE r.RoleName = N'SystemAdmin' AND u.IsActive = 1
            ORDER BY u.UserId;
            """);
        if (adminUserId <= 0)
        {
            throw new InvalidOperationException("The test database has no active SystemAdmin bootstrap user.");
        }

        ActorContext admin = Actor(adminUserId);
        var adminRepository = new AdminRepository(factory);
        DepartmentDto department = await adminRepository.SaveDepartmentAsync(admin, null, new SaveDepartmentRequest
        {
            DepartmentCode = Unique("TST"),
            DepartmentName = "Integration Test Department",
            IsActive = true,
        });
        LocationDto campus = await adminRepository.SaveLocationAsync(admin, null, new SaveLocationRequest
        {
            LocationCode = Unique("TSTC"),
            LocationName = "Integration Test Campus",
            LocationType = "Campus",
            IsActive = true,
            TimeZone = "UTC",
        });
        LocationDto building = await adminRepository.SaveLocationAsync(admin, null, new SaveLocationRequest
        {
            ParentLocationId = campus.LocationId,
            LocationCode = Unique("TSTB"),
            LocationName = "Integration Test Building",
            LocationType = "Building",
            IsActive = true,
            TimeZone = "UTC",
        });
        LocationDto publicFloor = await adminRepository.SaveLocationAsync(admin, null, new SaveLocationRequest
        {
            ParentLocationId = building.LocationId,
            LocationCode = Unique("TSTP"),
            LocationName = "Integration Test Public Floor",
            LocationType = "Floor",
            IsRestricted = false,
            IsActive = true,
            TimeZone = "UTC",
        });
        LocationDto restrictedFloor = await adminRepository.SaveLocationAsync(admin, null, new SaveLocationRequest
        {
            ParentLocationId = building.LocationId,
            LocationCode = Unique("TSTR"),
            LocationName = "Integration Test Restricted Floor",
            LocationType = "Floor",
            IsRestricted = true,
            IsActive = true,
            TimeZone = "UTC",
        });
        ReaderDto publicReader = await adminRepository.SaveReaderAsync(admin, true, Unique("TST-RDR-"), new SaveReaderRequest
        {
            ReaderName = "Integration Test Public Reader",
            LocationId = publicFloor.LocationId,
            Direction = "Both",
            IsActive = true,
        });
        ReaderDto restrictedReader = await adminRepository.SaveReaderAsync(admin, true, Unique("TST-RDR-"), new SaveReaderRequest
        {
            ReaderName = "Integration Test Restricted Reader",
            LocationId = restrictedFloor.LocationId,
            Direction = "Both",
            IsActive = true,
        });

        var fixture = new TestFixture(adminUserId, department, campus, building, publicFloor, restrictedFloor, publicReader, restrictedReader);
        fixture.Manager = await CreateActorAsync(factory, fixture, "Manager", "Fixture Manager", null);
        fixture.Security = await CreateActorAsync(factory, fixture, "SecurityTeam", "Fixture Security", null);
        fixture.AccessControl = await CreateActorAsync(factory, fixture, "AccessControlTeam", "Fixture Access Control", null);
        return fixture;
    }

    private static async Task<TestActor> CreateActorAsync(
        IDbConnectionFactory factory,
        TestFixture fixture,
        string roleName,
        string displayName,
        int? managerEmployeeId)
    {
        string employeeNumber = Unique("TSTEMP");
        var employee = await new EmployeeRepository(factory).CreateAsync(Actor(fixture.AdminUserId), new CreateEmployeeRequest
        {
            EmployeeNumber = employeeNumber,
            FirstName = displayName.Split(' ')[0],
            LastName = displayName.Split(' ').Last(),
            WorkEmail = $"{employeeNumber.ToLowerInvariant()}@example.test",
            EmployeeType = "Permanent",
            DepartmentId = fixture.Department.DepartmentId,
            ManagerEmployeeId = managerEmployeeId,
            LocationId = fixture.PublicFloor.LocationId,
            JoinDate = DateOnly.FromDateTime(DateTime.UtcNow.Date),
        });

        var identity = await new IdentityRepository(factory).ResolveEntraUserAsync(new TokenIdentity(
            Guid.NewGuid(),
            Guid.NewGuid(),
            employee.WorkEmail,
            displayName));
        if (identity is null || identity.UserId <= 0)
        {
            throw new InvalidOperationException($"Could not provision test identity for employee {employee.EmployeeNumber}.");
        }

        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        var roleIds = (await connection.QueryAsync<int>(
            "SELECT RoleId FROM dbo.Roles WHERE RoleName IN @Names",
            new { Names = new[] { "Employee", roleName } })).ToArray();
        if (roleIds.Length != (roleName == "Employee" ? 1 : 2))
        {
            throw new InvalidOperationException($"Required test role '{roleName}' was not seeded.");
        }

        await connection.ExecuteAsync("dbo.usp_AdminEmployee_Save", new
        {
            ActorUserId = fixture.AdminUserId,
            EmployeeId = employee.EmployeeId,
            RoleIds = JsonSerializer.Serialize(roleIds),
            ManagerEmployeeId = managerEmployeeId,
            DepartmentId = fixture.Department.DepartmentId,
            LocationId = fixture.PublicFloor.LocationId,
            Designation = displayName,
            IsActive = true,
            AllFacilities = true,
            FacilityIds = "[]",
            CorrelationId = Guid.NewGuid(),
            IpAddress = "127.0.0.1",
        }, commandType: CommandType.StoredProcedure);

        return new TestActor(identity.UserId, employee.EmployeeId);
    }

    private static async Task<EmployeeDetailDto> CreateEmployeeAsync(TestFixture fixture, string? number = null, int? managerEmployeeId = null)
    {
        number ??= Unique("TSTEMP");
        return await new EmployeeRepository(new SqlDbConnectionFactory(TestDatabase.ConnectionString)).CreateAsync(Actor(fixture.AdminUserId), new CreateEmployeeRequest
        {
            EmployeeNumber = number,
            FirstName = "Test",
            LastName = "Employee",
            WorkEmail = $"{number.ToLowerInvariant()}@example.test",
            EmployeeType = "Permanent",
            DepartmentId = fixture.Department.DepartmentId,
            ManagerEmployeeId = managerEmployeeId,
            LocationId = fixture.PublicFloor.LocationId,
            JoinDate = DateOnly.FromDateTime(DateTime.UtcNow.Date),
        });
    }

    private static async Task<TestActor> CreateRequesterAsync(TestFixture fixture)
        => await CreateActorAsync(new SqlDbConnectionFactory(TestDatabase.ConnectionString), fixture, "Employee", "Fixture Requester", fixture.Manager.EmployeeId);

    private static Task<AccessRequestDetailDto> CreateAccessRequestAsync(TestFixture fixture, TestActor requester)
        => new AccessRepository(new SqlDbConnectionFactory(TestDatabase.ConnectionString)).CreateRequestAsync(Actor(requester.UserId), new CreateAccessRequestRequest
        {
            EmployeeId = requester.EmployeeId,
            AccessType = "WingFloor",
            BuildingLocationId = fixture.Building.LocationId,
            LocationId = fixture.RestrictedFloor.LocationId,
            DurationCode = "OneMonth",
            Justification = "Integration test: isolated fixture access request",
            ValidFromUtc = DateTime.UtcNow.AddDays(1),
        });

    private static async Task<(CardDto Card, string Uid)> CreateActiveCardAsync(TestFixture fixture, int employeeId)
    {
        var cards = new CardRepository(new SqlDbConnectionFactory(TestDatabase.ConnectionString));
        string uid = Unique("04F");
        CardDto card = await cards.CreateAsync(Actor(fixture.AdminUserId), new CreateCardRequest { EmployeeId = employeeId, CardUid = uid, CardType = "Permanent" });
        return (await cards.ActivateAsync(Actor(fixture.AdminUserId), card.CardId, card.Version!), uid);
    }

    private static Task<RfidIngestResultDto> SwipeAsync(TestFixture fixture, string readerId, string cardUid, string? eventId = null)
        => new SecurityRepository(new SqlDbConnectionFactory(TestDatabase.ConnectionString)).IngestEventAsync(Actor(fixture.AdminUserId), new RfidEventRequest
        {
            ReaderId = readerId,
            ExternalEventId = eventId ?? Unique("EVT"),
            CardUid = cardUid,
            EventType = "Entry",
            EventAtUtc = DateTime.UtcNow,
        });

    private static Task InsertPermissionAsync(TestFixture fixture, int employeeId, int locationId, string status, DateTime validFromUtc, DateTime validToUtc)
    {
        const string sql = """
            INSERT dbo.AccessPermissions (EmployeeId, LocationId, ValidFromUtc, ValidToUtc, Status, ProvisionedByUserId)
            VALUES (@EmployeeId, @LocationId, @ValidFromUtc, @ValidToUtc, @Status, @ActorUserId);
            """;
        return ExecuteFixtureSqlAsync(sql, new
        {
            EmployeeId = employeeId,
            LocationId = locationId,
            ValidFromUtc = validFromUtc,
            ValidToUtc = validToUtc,
            Status = status,
            ActorUserId = fixture.AdminUserId,
        });
    }

    private static async Task ExecuteFixtureSqlAsync(string sql, object parameters)
    {
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        await connection.ExecuteAsync(sql, parameters);
    }

    private static async Task<ErrorType> ErrorOf(Func<Task> action) => (await Assert.ThrowsAsync<AppException>(action)).ErrorType;

    private sealed record TestActor(int UserId, int EmployeeId);

    private sealed class TestFixture(
        int adminUserId,
        DepartmentDto department,
        LocationDto campus,
        LocationDto building,
        LocationDto publicFloor,
        LocationDto restrictedFloor,
        ReaderDto publicReader,
        ReaderDto restrictedReader)
    {
        public int AdminUserId { get; } = adminUserId;
        public DepartmentDto Department { get; } = department;
        public LocationDto Campus { get; } = campus;
        public LocationDto Building { get; } = building;
        public LocationDto PublicFloor { get; } = publicFloor;
        public LocationDto RestrictedFloor { get; } = restrictedFloor;
        public ReaderDto PublicReader { get; } = publicReader;
        public ReaderDto RestrictedReader { get; } = restrictedReader;
        public TestActor Manager { get; set; } = null!;
        public TestActor Security { get; set; } = null!;
        public TestActor AccessControl { get; set; } = null!;
    }

    [SkippableFact]
    public async Task DuplicateEmployeeNumberIsConflict()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => CreateEmployeeAsync(fixture, employee.EmployeeNumber)));
    }

    [SkippableFact]
    public async Task AdminEmployeeSaveCreatesLinkedAccountAndPersistsRolesAndOrganisation()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        string designation = Unique("Test Designation ");

        AdminUserDto saved = await new AdminRepository(_factory).SaveEmployeeAsync(
            Actor(fixture.AdminUserId),
            employee.EmployeeId,
            new SaveAdminUserRequest
            {
                Roles = ["SecurityTeam"],
                ManagerEmployeeId = fixture.Manager.EmployeeId,
                DepartmentId = fixture.Department.DepartmentId,
                Designation = designation,
                LocationId = fixture.RestrictedFloor.LocationId,
                IsActive = true,
            });

        Assert.Equal(employee.EmployeeId, saved.EmployeeId);
        Assert.True(saved.UserId > 0);
        Assert.Contains("Employee", saved.Roles);
        Assert.Contains("SecurityTeam", saved.Roles);
        Assert.Equal(fixture.Department.DepartmentId, saved.DepartmentId);
        Assert.Equal(fixture.Manager.EmployeeId, saved.ManagerEmployeeId);
        Assert.Equal(designation, saved.Designation);
        Assert.Equal(fixture.RestrictedFloor.LocationId, saved.LocationId);
        Assert.True(saved.IsActive);

        Assert.Equal(saved.UserId, await ScalarAsync<int?>(
            "SELECT UserId FROM dbo.Employees WHERE EmployeeId = @employeeId",
            new { employeeId = employee.EmployeeId }));
    }

    [SkippableFact]
    public async Task DuplicateCardUidIsConflict()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (_, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);
        EmployeeDetailDto other = await CreateEmployeeAsync(fixture);

        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => new CardRepository(_factory).CreateAsync(
            Actor(fixture.AdminUserId), new CreateCardRequest { EmployeeId = other.EmployeeId, CardUid = uid.ToLowerInvariant(), CardType = "Permanent" })));
    }

    [SkippableFact]
    public async Task LostCardIsBlockedImmediatelyAndSwipeIsDeniedWithViolation()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (CardDto card, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);

        CardDto lost = await new CardRepository(_factory).ReportLostAsync(Actor(fixture.AdminUserId), card.CardId, "Lost in the cab");
        Assert.Equal("Blocked", lost.Status);

        RfidIngestResultDto swipe = await SwipeAsync(fixture, fixture.PublicReader.ReaderId, uid);
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("CardBlocked", swipe.DenialReason);
        Assert.NotNull(swipe.ViolationId);
    }

    [SkippableFact]
    public async Task TeamApprovalQueueReturnsPagedRequestsForDirectReports()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        TestActor requester = await CreateRequesterAsync(fixture);
        AccessRequestDetailDto request = await CreateAccessRequestAsync(fixture, requester);
        PagedResult<TeamRequestItemDto> result = await new AccessRepository(_factory)
            .GetTeamApprovalsAsync(Actor(fixture.Manager.UserId), new TeamRequestQuery { Page = 1, PageSize = 20 });
        Assert.Equal(1, result.Page);
        Assert.Equal(20, result.PageSize);
        Assert.All(result.Items, item => Assert.Contains(item.RequestKind, new[] { "Card", "Access" }));
        Assert.Contains(result.Items, item => item.RequestKind == "Access" && item.RequestId == request.AccessRequestId);
    }

    [SkippableFact]
    public async Task EmployeeProfileAndPhotoAreStoredAndReturnedBySelfServiceProcedures()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        TestActor requester = await CreateRequesterAsync(fixture);
        var repository = new IdentityRepository(_factory);
        ActorContext actor = Actor(requester.UserId);
        MyProfileDto profile = await repository.GetMyProfileAsync(actor);
        Assert.Equal(requester.EmployeeId, profile.EmployeeId);

        PhotoInfoDto info = await repository.PutMyPhotoAsync(actor, new PhotoUploadRequest
        {
            PhotoContentType = "image/jpeg",
            PhotoBase64 = Convert.ToBase64String(new byte[] { 0xFF, 0xD8, 0xFF }),
        });
        Assert.True(info.HasPhoto);
        PhotoDto photo = await repository.GetMyPhotoAsync(actor);
        Assert.Equal("image/jpeg", photo.ContentType);
        Assert.Equal(3, photo.SizeBytes);
    }

    [SkippableFact]
    public async Task LookupsReadExactlyTheResultSetsReturnedByTheLookupProcedure()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        LookupsDto lookups = await new IdentityRepository(_factory).GetLookupsAsync(Actor(fixture.AdminUserId));

        Assert.Contains(lookups.Departments, item => item.Id == fixture.Department.DepartmentId);
        Assert.Contains(lookups.Locations, item => item.Id == fixture.Building.LocationId);
    }

    [SkippableFact]
    public async Task AdminCanSaveWingLocationUnderFloor()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        LocationDto wing = await new AdminRepository(_factory).SaveLocationAsync(Actor(fixture.AdminUserId), null, new SaveLocationRequest
        {
            ParentLocationId = fixture.PublicFloor.LocationId,
            LocationCode = Unique("TSTW"),
            LocationName = "Integration Test Wing",
            LocationType = "Wing",
            IsActive = true,
            TimeZone = "UTC",
        });

        Assert.Equal("Wing", wing.LocationType);
        Assert.Equal(fixture.PublicFloor.LocationId, wing.ParentLocationId);
    }

    [SkippableFact]
    public async Task EmployeeSyncUpsertsBatchAndResolvesManagerFromSameBatch()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        var repository = new EmployeeRepository(_factory);
        string managerNumber = Unique("SYNCMGR");
        string employeeNumber = Unique("SYNCEMP");
        var request = new EmployeeSyncRequest
        {
            Employees =
            [
                new EmployeeSyncItem
                {
                    EmployeeNumber = managerNumber, FirstName = "Sync", LastName = "Manager",
                    WorkEmail = $"{managerNumber.ToLowerInvariant()}@example.test", DepartmentCode = fixture.Department.DepartmentCode, LocationCode = fixture.Campus.LocationCode,
                    EmployeeType = "Permanent", EmploymentStatus = "Active", JoinDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-90)),
                },
                new EmployeeSyncItem
                {
                    EmployeeNumber = employeeNumber, FirstName = "Sync", LastName = "Employee",
                    WorkEmail = $"{employeeNumber.ToLowerInvariant()}@example.test", DepartmentCode = fixture.Department.DepartmentCode, LocationCode = fixture.Campus.LocationCode,
                    ManagerEmployeeNumber = managerNumber, EmployeeType = "Permanent", EmploymentStatus = "Active",
                    JoinDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30)),
                },
            ],
        };
        EmployeeSyncResultDto inserted = await repository.SyncAsync(Actor(fixture.AdminUserId), request);
        Assert.Equal(2, inserted.Inserted);
        Assert.Equal(0, inserted.Deactivated);
        EmployeeSyncResultDto updated = await repository.SyncAsync(Actor(fixture.AdminUserId), request);
        Assert.Equal(0, updated.Inserted);
        Assert.Equal(2, updated.Updated);
    }

    [SkippableFact]
    public async Task DashboardHomeReturnsRoleDrivenSectionsAndPersonalRequests()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        HomeDashboardDto result = await new InsightsRepository(_factory).GetHomeAsync(Actor(fixture.AdminUserId));
        Assert.NotNull(result.MyRequests);
        Assert.NotNull(result.PendingManager);
    }

    [SkippableFact]
    public async Task BlockedCardSwipeIsDeniedAndCreatesViolation()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (CardDto card, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);
        await new CardRepository(_factory).ReportLostAsync(Actor(fixture.AdminUserId), card.CardId, "Fixture blocked card");
        RfidIngestResultDto swipe = await SwipeAsync(fixture, fixture.PublicReader.ReaderId, uid);
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("CardBlocked", swipe.DenialReason);
        Assert.NotNull(swipe.ViolationId);
    }

    [SkippableFact]
    public async Task ExpiredPermissionSwipeIsDenied()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (_, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);
        DateTime now = DateTime.UtcNow;
        await InsertPermissionAsync(fixture, employee.EmployeeId, fixture.RestrictedFloor.LocationId, "Expired", now.AddDays(-10), now.AddDays(-1));
        RfidIngestResultDto swipe = await SwipeAsync(fixture, fixture.RestrictedReader.ReaderId, uid);
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("PermissionExpired", swipe.DenialReason);
    }

    [SkippableFact]
    public async Task DuplicateRfidEventIsIdempotent()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (_, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);
        string eventId = Unique("DUP");
        RfidIngestResultDto first = await SwipeAsync(fixture, fixture.PublicReader.ReaderId, uid, eventId);
        RfidIngestResultDto second = await SwipeAsync(fixture, fixture.PublicReader.ReaderId, uid, eventId);

        Assert.Equal("Granted", first.Decision);
        Assert.False(first.IsDuplicate);
        Assert.True(second.IsDuplicate);
        Assert.Equal(first.AccessLogId, second.AccessLogId);
        Assert.Equal(1, await ScalarAsync<int>("SELECT COUNT(*) FROM dbo.AccessLogs WHERE ExternalEventId = @eventId", new { eventId }));
    }

    [SkippableFact]
    public async Task UnknownCardIsDeniedAndQueuedForReview()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        RfidIngestResultDto swipe = await SwipeAsync(fixture, fixture.PublicReader.ReaderId, Unique("FFFF"));
        Assert.Equal("Denied", swipe.Decision);
        Assert.Equal("UnknownCard", swipe.DenialReason);
        Assert.Equal("Review", swipe.ProcessingStatus);
    }

    [SkippableFact]
    public async Task ApprovalWorkflowEnforcesStagesReasonsDuplicatesAndProvisioningOrder()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        TestActor requester = await CreateRequesterAsync(fixture);
        var access = new AccessRepository(_factory);
        AccessRequestDetailDto request = await CreateAccessRequestAsync(fixture, requester);
        Assert.Equal("PendingApproval", request.Status);
        Assert.Equal("Manager", request.CurrentStage);
        long id = request.AccessRequestId;

        ApprovalDecisionRequest Approve(byte[] version) => new() { Decision = "Approve", Comments = "OK", Version = version };

        Assert.Equal(ErrorType.Forbidden, await ErrorOf(() => access.DecideAsync(Actor(fixture.Security.UserId), id, Approve(request.Version!))));
        Assert.Equal(ErrorType.Validation, await ErrorOf(() => access.DecideAsync(Actor(fixture.Manager.UserId), id,
            new ApprovalDecisionRequest { Decision = "Reject", Comments = null, Version = request.Version })));
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.ProvisionAsync(Actor(fixture.AccessControl.UserId), id)));

        AccessRequestDetailDto afterManager = await access.DecideAsync(Actor(fixture.Manager.UserId), id, Approve(request.Version!));
        Assert.Equal("Security", afterManager.CurrentStage);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.DecideAsync(Actor(fixture.Manager.UserId), id, Approve(request.Version!))));

        AccessRequestDetailDto afterSecurity = await access.DecideAsync(Actor(fixture.Security.UserId), id, Approve(afterManager.Version!));
        AccessRequestDetailDto approved = await access.DecideAsync(Actor(fixture.AccessControl.UserId), id, Approve(afterSecurity.Version!));
        Assert.Equal("Approved", approved.Status);

        AccessPermissionDto permission = await access.ProvisionAsync(Actor(fixture.AccessControl.UserId), id);
        Assert.Equal("Active", permission.Status);
        Assert.Equal("Provisioned", (await access.GetRequestAsync(Actor(requester.UserId), id)).Status);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.ProvisionAsync(Actor(fixture.AccessControl.UserId), id)));
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => CreateAccessRequestAsync(fixture, requester)));
    }

    [SkippableFact]
    public async Task BuildingRequestDoesNotBlockInnerLocationButBlocksSameBuilding()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        TestActor requester = await CreateRequesterAsync(fixture);
        var access = new AccessRepository(_factory);
        var building = new CreateAccessRequestRequest
        {
            EmployeeId = requester.EmployeeId,
            AccessType = "Building",
            BuildingLocationId = fixture.Building.LocationId,
            LocationId = fixture.Building.LocationId,
            DurationCode = "OneMonth",
            Justification = "Integration test: building access",
        };
        await access.CreateRequestAsync(Actor(requester.UserId), building);

        Assert.Equal("PendingApproval", (await CreateAccessRequestAsync(fixture, requester)).Status);
        Assert.Equal(ErrorType.Conflict, await ErrorOf(() => access.CreateRequestAsync(Actor(requester.UserId), building)));
    }

    [SkippableFact]
    public async Task InvalidDateRangeIsValidationError()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        TestActor requester = await CreateRequesterAsync(fixture);
        Assert.Equal(ErrorType.Validation, await ErrorOf(() => new AccessRepository(_factory).CreateRequestAsync(Actor(requester.UserId), new CreateAccessRequestRequest
        {
            EmployeeId = requester.EmployeeId,
            AccessType = "WingFloor",
            BuildingLocationId = fixture.Building.LocationId,
            LocationId = fixture.RestrictedFloor.LocationId,
            DurationCode = "Custom",
            Justification = "Integration test: invalid window",
            ValidFromUtc = DateTime.UtcNow.AddDays(10),
            ValidToUtc = DateTime.UtcNow.AddDays(2),
        })));

        Assert.Equal(ErrorType.Validation, await ErrorOf(() => new SecurityRepository(_factory).SearchAccessLogsAsync(
            Actor(fixture.AdminUserId), new AccessLogQuery { From = DateTime.UtcNow, To = DateTime.UtcNow.AddDays(-1) })));
    }

    [SkippableFact]
    public async Task DeactivatingEmployeeDeactivatesCardsAndRevokesAccess()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        EmployeeDetailDto employee = await CreateEmployeeAsync(fixture);
        (CardDto card, string uid) = await CreateActiveCardAsync(fixture, employee.EmployeeId);
        await InsertPermissionAsync(fixture, employee.EmployeeId, fixture.RestrictedFloor.LocationId, "Active", DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(30));
        var employees = new EmployeeRepository(_factory);

        EmployeeDetailDto exited = await employees.DeactivateAsync(Actor(fixture.AdminUserId), employee.EmployeeId, new DeactivateEmployeeRequest
        {
            EmploymentStatus = "Exited",
            EndDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Reason = "Resigned",
        });

        Assert.Equal("Exited", exited.EmploymentStatus);
        Assert.All(await employees.GetCardsAsync(Actor(fixture.AdminUserId), employee.EmployeeId), c => Assert.Equal("Deactivated", c.Status));
        Assert.Equal(0, await ScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.AccessPermissions WHERE EmployeeId = @id AND Status = N'Active'", new { id = employee.EmployeeId }));
        Assert.Equal("Denied", (await SwipeAsync(fixture, fixture.PublicReader.ReaderId, uid)).Decision);
        Assert.NotEqual(0, card.CardId);
    }

    [SkippableTheory]
    [InlineData("UPDATE TOP (1) dbo.AuditLogs SET Summary = N'tampered'")]
    [InlineData("DELETE TOP (1) FROM dbo.AuditLogs")]
    public async Task AuditLogIsAppendOnly(string sql)
    {
        await EnsureFixtureAsync();
        await using var connection = new SqlConnection(TestDatabase.ConnectionString);
        SqlException ex = await Assert.ThrowsAsync<SqlException>(() => connection.ExecuteAsync(sql));
        Assert.Equal(50403, ex.Number);
    }

    [SkippableFact]
    public async Task SqlInjectionInSearchIsTreatedAsDataAndPageSizeIsCapped()
    {
        TestFixture fixture = await EnsureFixtureAsync();
        var employees = new EmployeeRepository(_factory);

        PagedResult<EmployeeListItemDto> injected = await employees.SearchAsync(Actor(fixture.AdminUserId),
            new EmployeeQuery { Search = "'; DROP TABLE dbo.Employees; --", Page = 1, PageSize = 20 });
        Assert.Equal(0, injected.TotalCount);

        PagedResult<EmployeeListItemDto> all = await employees.SearchAsync(Actor(fixture.AdminUserId), new EmployeeQuery { Page = 1, PageSize = 5000 });
        Assert.Equal(100, all.PageSize);
        Assert.True(all.TotalCount > 0);
        Assert.True(all.Items.Count <= 100);
    }
}
