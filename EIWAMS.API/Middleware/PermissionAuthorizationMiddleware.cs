using System.Collections.Concurrent;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Identity;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.DependencyInjection;
using P = EIWAMS.Application.Constants.Permissions;

namespace EIWAMS.API.Middleware;

/// <summary>
/// Deny-by-default authorisation: every HTTP function is either mapped to one or more permission codes (any-of) or listed in
/// <see cref="HttpConstants.NoPermissionFunctions"/>; an unmapped function fails closed. Stored procedures re-check scope.
/// </summary>
public sealed class PermissionAuthorizationMiddleware(RateLimiter rateLimiter) : IFunctionsWorkerMiddleware
{
    public static readonly IReadOnlyDictionary<string, string[]> RequiredPermissions = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        // Employees
        ["SearchEmployees"] = [P.EmployeesView, P.EmployeesViewAll],
        ["CreateEmployee"] = [P.EmployeesManage],
        ["GetEmployee"] = [P.EmployeesView, P.EmployeesViewAll],
        ["UpdateEmployee"] = [P.EmployeesManage],
        ["TransferEmployee"] = [P.EmployeesTransfer],
        ["DeactivateEmployee"] = [P.EmployeesDeactivate],
        ["GetEmployeeCards"] = [P.CardsView, P.CardsViewAll],
        ["GetEmployeeHistory"] = [P.EmployeesView, P.EmployeesViewAll],

        // Cards
        ["SearchCards"] = [P.CardsView, P.CardsViewAll],
        ["CreateCard"] = [P.CardsIssue],
        ["ActivateCard"] = [P.CardsIssue],
        ["BlockCard"] = [P.CardsBlock],
        ["ReportLostCard"] = [P.CardsRequest, P.CardsBlock],
        ["ReplaceCard"] = [P.CardsIssue],
        ["DeactivateCard"] = [P.CardsBlock],
        ["SearchCardRequests"] = [P.CardsView, P.CardsViewAll],
        ["CreateCardRequest"] = [P.CardsRequest],
        ["DecideCardRequest"] = [P.CardsVerify],

        // Access requests, approvals, permissions
        ["SearchAccessRequests"] = [P.AccessRequestsView, P.AccessRequestsViewAll],
        ["CreateAccessRequest"] = [P.AccessRequestsCreate],
        ["GetAccessRequest"] = [P.AccessRequestsView, P.AccessRequestsViewAll, P.ApprovalsDecide],
        ["UpdateAccessRequest"] = [P.AccessRequestsCreate],
        ["SubmitAccessRequest"] = [P.AccessRequestsCreate],
        ["CancelAccessRequest"] = [P.AccessRequestsCreate],
        ["GetPendingApprovals"] = [P.ApprovalsDecide],
        ["DecideApproval"] = [P.ApprovalsDecide],
        ["SearchPermissions"] = [P.PermissionsView],
        ["ProvisionPermission"] = [P.PermissionsProvision],
        ["RevokePermission"] = [P.PermissionsRevoke],

        // RFID and security
        ["IngestRfidEvent"] = [P.RfidIngest],
        ["SearchRfidEvents"] = [P.RfidView],
        ["SearchViolations"] = [P.ViolationsView],
        ["ReviewViolation"] = [P.ViolationsReview],
        ["SearchIncidents"] = [P.IncidentsView],
        ["CreateIncident"] = [P.IncidentsManage],
        ["GetIncident"] = [P.IncidentsView],
        ["UpdateIncident"] = [P.IncidentsManage],
        ["SearchBlacklist"] = [P.BlacklistView],
        ["CreateBlacklistEntry"] = [P.BlacklistManage],
        ["LiftBlacklistEntry"] = [P.BlacklistManage],

        // Visitors
        ["SearchVisitors"] = [P.VisitorsView],
        ["CreateVisitor"] = [P.VisitorsManage],
        ["SearchVisitorPasses"] = [P.VisitorsView],
        ["CreateVisitorPass"] = [P.VisitorsManage],
        ["ApproveVisitorPass"] = [P.VisitorsApprove],
        ["CheckInVisitorPass"] = [P.VisitorsManage],
        ["CheckOutVisitorPass"] = [P.VisitorsManage],
        ["RevokeVisitorPass"] = [P.VisitorsManage],

        // Dashboard, reports, audit
        ["GetDashboardSummary"] = [P.DashboardView],
        ["GetDashboardEventsTrend"] = [P.DashboardView],
        ["GetDashboardRequestsByStatus"] = [P.DashboardView],
        ["GetDashboardViolationsByType"] = [P.DashboardView],
        ["GetDashboardCardsByStatus"] = [P.DashboardView],
        ["GetDashboardOccupancy"] = [P.DashboardView],
        ["GetDashboardMyWork"] = [P.DashboardView],
        ["GetDashboardActivity"] = [P.DashboardView],
        ["GetReport"] = [P.ReportsView],
        ["ExportReport"] = [P.ReportsExport],
        ["SearchAuditLogs"] = [P.AuditView],

        // Administration and reference data
        ["GetAdminUsers"] = [P.UsersManage],
        ["CreateAdminUser"] = [P.UsersManage],
        ["UpdateAdminUser"] = [P.UsersManage],
        ["GetRoles"] = [P.RolesManage],
        ["GetRolePermissions"] = [P.RolesManage],
        ["SetRolePermissions"] = [P.RolesManage],
        ["GetPermissionCatalog"] = [P.RolesManage],
        ["GetDepartments"] = [P.EmployeesView, P.EmployeesViewAll, P.ReferenceManage],
        ["CreateDepartment"] = [P.ReferenceManage],
        ["UpdateDepartment"] = [P.ReferenceManage],
        ["CreateLocation"] = [P.ReferenceManage],
        ["UpdateLocation"] = [P.ReferenceManage],
        ["GetReaders"] = [P.RfidView, P.ReferenceManage],
        ["CreateReader"] = [P.ReferenceManage],
        ["UpdateReader"] = [P.ReferenceManage],
        ["GetSettings"] = [P.SettingsManage],
        ["UpdateSetting"] = [P.SettingsManage],
    };

    /// <summary>Functions throttled per user (fixed one-minute window): function name to max calls per window.</summary>
    public static readonly IReadOnlyDictionary<string, int> RateLimits = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["IngestRfidEvent"] = 600,
        ["ReportLostCard"] = 10,
    };

    private static readonly HashSet<string> NoPermissionRequired = new(HttpConstants.NoPermissionFunctions, StringComparer.Ordinal);

    /// <summary>Returns the permissions (any-of) required by a function; empty when only authentication is needed.</summary>
    /// <exception cref="InvalidOperationException">The function is not mapped (fail closed).</exception>
    public static IReadOnlyList<string> GetRequiredPermissions(string functionName)
    {
        if (NoPermissionRequired.Contains(functionName))
        {
            return [];
        }

        return RequiredPermissions.TryGetValue(functionName, out string[]? permissions)
            ? permissions
            : throw new InvalidOperationException($"No permission mapping is configured for HTTP function '{functionName}'.");
    }

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        if (context.GetHttpContext() is null)
        {
            await next(context);
            return;
        }

        string functionName = context.FunctionDefinition.Name;
        IReadOnlyList<string> required = GetRequiredPermissions(functionName);
        if (HttpConstants.AnonymousFunctions.Contains(functionName))
        {
            await next(context);
            return;
        }

        CurrentUserDto user = context.InstanceServices.GetRequiredService<ICurrentUserAccessor>().User
            ?? throw AppException.Unauthorized(ApiMessages.Unauthenticated);

        if (required.Count > 0 && !required.Any(p => user.Permissions.Contains(p, StringComparer.OrdinalIgnoreCase)))
        {
            throw AppException.Forbidden(ApiMessages.Forbidden);
        }

        if (RateLimits.TryGetValue(functionName, out int limit) && !rateLimiter.TryAcquire($"{functionName}:{user.UserId}", limit))
        {
            throw AppException.TooManyRequests(ApiMessages.TooManyRequests);
        }

        await next(context);
    }
}

/// <summary>In-memory fixed-window limiter (per instance). Adequate for abuse protection on a single Function App instance.</summary>
public sealed class RateLimiter(TimeProvider timeProvider)
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private readonly ConcurrentDictionary<string, (DateTimeOffset Start, int Count)> _windows = new(StringComparer.Ordinal);

    public RateLimiter()
        : this(TimeProvider.System)
    {
    }

    public bool TryAcquire(string key, int limit)
    {
        DateTimeOffset now = timeProvider.GetUtcNow();
        var entry = _windows.AddOrUpdate(
            key,
            _ => (now, 1),
            (_, current) => now - current.Start >= Window ? (now, 1) : (current.Start, current.Count + 1));

        if (_windows.Count > 10_000)
        {
            foreach (var stale in _windows.Where(w => now - w.Value.Start >= Window).Select(w => w.Key).ToList())
            {
                _windows.TryRemove(stale, out _);
            }
        }

        return entry.Count <= limit;
    }
}
