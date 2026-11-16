using EIWAMS.API.Helpers;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Admin;
using EIWAMS.Application.Models.DTOs.Insights;
using EIWAMS.Domain.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace EIWAMS.API.Functions;

/// <summary>Dashboard widgets, reports (JSON and CSV) and the audit trail.</summary>
public sealed class InsightsFunctions(IServiceProvider services, IInsightsService service) : FunctionBase(services)
{
    [Function(nameof(Dashboard_Home))]
    public async Task<IActionResult> Dashboard_Home([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/home")] HttpRequest req)
        => Ok(await service.GetHomeAsync());

    [Function(nameof(GetDashboardSummary))]
    public async Task<IActionResult> GetDashboardSummary([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/summary")] HttpRequest req)
        => Ok(await service.GetSummaryAsync());

    [Function(nameof(GetDashboardEventsTrend))]
    public async Task<IActionResult> GetDashboardEventsTrend([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/events-trend")] HttpRequest req)
        => Ok(await service.GetEventsTrendAsync(BindQuery<DaysQuery>(req).Days));

    [Function(nameof(GetDashboardRequestsByStatus))]
    public async Task<IActionResult> GetDashboardRequestsByStatus([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/requests-by-status")] HttpRequest req)
        => Ok(await service.GetRequestsByStatusAsync());

    [Function(nameof(GetDashboardViolationsByType))]
    public async Task<IActionResult> GetDashboardViolationsByType([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/violations-by-type")] HttpRequest req)
        => Ok(await service.GetViolationsByTypeAsync());

    [Function(nameof(GetDashboardCardsByStatus))]
    public async Task<IActionResult> GetDashboardCardsByStatus([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/cards-by-status")] HttpRequest req)
        => Ok(await service.GetCardsByStatusAsync());

    [Function(nameof(GetDashboardOccupancy))]
    public async Task<IActionResult> GetDashboardOccupancy([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/occupancy")] HttpRequest req)
        => Ok(await service.GetOccupancyAsync());

    [Function(nameof(GetDashboardMyWork))]
    public async Task<IActionResult> GetDashboardMyWork([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/my-work")] HttpRequest req)
        => Ok(await service.GetMyWorkAsync());

    [Function(nameof(GetDashboardActivity))]
    public async Task<IActionResult> GetDashboardActivity([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/activity")] HttpRequest req)
        => Ok(await service.GetActivityAsync(BindQuery<TopQuery>(req).Top));

    [Function(nameof(GetReport))]
    public async Task<IActionResult> GetReport([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/reports/{reportName}")] HttpRequest req, string reportName)
        => Ok(await service.RunReportAsync(reportName, BindQuery<ReportQuery>(req)));

    [Function(nameof(ExportReport))]
    public async Task<IActionResult> ExportReport([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/reports/{reportName}/export")] HttpRequest req, string reportName)
    {
        (byte[] content, string fileName) = await service.ExportReportAsync(reportName, BindQuery<ReportQuery>(req));
        return Csv(fileName, content);
    }

    [Function(nameof(SearchAuditLogs))]
    public async Task<IActionResult> SearchAuditLogs([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/audit-logs")] HttpRequest req)
        => Ok(await service.SearchAuditAsync(BindQuery<AuditQuery>(req)));

    [Function(nameof(GetAuditTimeline))]
    public async Task<IActionResult> GetAuditTimeline([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/audit-logs/timeline")] HttpRequest req)
        => Ok(await service.GetTimelineAsync(BindQuery<AuditTimelineQuery>(req)));
}

/// <summary>Users, roles, reference data (departments, locations, readers) and settings.</summary>
public sealed class AdminFunctions(IServiceProvider services, IAdminService service) : FunctionBase(services)
{
    [Function(nameof(GetAdminUsers))]
    public async Task<IActionResult> GetAdminUsers([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/users")] HttpRequest req)
        => Ok(await service.SearchUsersAsync(BindQuery<AdminUserQuery>(req)));

    [Function(nameof(CreateAdminUser))]
    public async Task<IActionResult> CreateAdminUser([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/admin/users")] HttpRequest req)
        => Created(await service.CreateUserAsync(await ReadBodyAsync<SaveAdminUserRequest>(req)));

    [Function(nameof(UpdateAdminUser))]
    public async Task<IActionResult> UpdateAdminUser([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/admin/users/{id:int}")] HttpRequest req, int id)
        => Ok(await service.UpdateUserAsync(id, await ReadBodyAsync<SaveAdminUserRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetRoles))]
    public async Task<IActionResult> GetRoles([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/roles")] HttpRequest req)
        => Ok(await service.GetRolesAsync());

    [Function(nameof(GetRolePermissions))]
    public async Task<IActionResult> GetRolePermissions([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/roles/{id:int}/permissions")] HttpRequest req, int id)
        => Ok(await service.GetRolePermissionsAsync(id));

    [Function(nameof(SetRolePermissions))]
    public async Task<IActionResult> SetRolePermissions([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/admin/roles/{id:int}/permissions")] HttpRequest req, int id)
        => Ok(await service.SetRolePermissionsAsync(id, await ReadBodyAsync<SetRolePermissionsRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetPermissionCatalog))]
    public async Task<IActionResult> GetPermissionCatalog([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/permissions")] HttpRequest req)
        => Ok(await service.GetPermissionCatalogAsync());

    [Function(nameof(GetDepartments))]
    public async Task<IActionResult> GetDepartments([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/departments")] HttpRequest req)
        => Ok(await service.GetDepartmentsAsync());

    [Function(nameof(CreateDepartment))]
    public async Task<IActionResult> CreateDepartment([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/departments")] HttpRequest req)
        => Created(await service.SaveDepartmentAsync(null, await ReadBodyAsync<SaveDepartmentRequest>(req)));

    [Function(nameof(UpdateDepartment))]
    public async Task<IActionResult> UpdateDepartment([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/departments/{id:int}")] HttpRequest req, int id)
        => Ok(await service.SaveDepartmentAsync(id, await ReadBodyAsync<SaveDepartmentRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetLocations))]
    public async Task<IActionResult> GetLocations([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/locations")] HttpRequest req)
        => Ok(await service.GetLocationsAsync());

    [Function(nameof(CreateLocation))]
    public async Task<IActionResult> CreateLocation([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/locations")] HttpRequest req)
        => Created(await service.SaveLocationAsync(null, await ReadBodyAsync<SaveLocationRequest>(req)));

    [Function(nameof(UpdateLocation))]
    public async Task<IActionResult> UpdateLocation([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/locations/{id:int}")] HttpRequest req, int id)
        => Ok(await service.SaveLocationAsync(id, await ReadBodyAsync<SaveLocationRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetReaders))]
    public async Task<IActionResult> GetReaders([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/readers")] HttpRequest req)
        => Ok(await service.GetReadersAsync());

    [Function(nameof(CreateReader))]
    public async Task<IActionResult> CreateReader([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/readers")] HttpRequest req)
        => Created(await service.CreateReaderAsync(await ReadBodyAsync<SaveReaderRequest>(req)));

    [Function(nameof(UpdateReader))]
    public async Task<IActionResult> UpdateReader([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/readers/{readerId}")] HttpRequest req, string readerId)
        => Ok(await service.UpdateReaderAsync(readerId, await ReadBodyAsync<SaveReaderRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetSettings))]
    public async Task<IActionResult> GetSettings([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/settings")] HttpRequest req)
        => Ok(await service.GetSettingsAsync());

    [Function(nameof(UpdateSetting))]
    public async Task<IActionResult> UpdateSetting([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/admin/settings")] HttpRequest req)
        => Ok(await service.UpdateSettingAsync(await ReadBodyAsync<UpdateSettingRequest>(req)), ApiMessages.Updated);
}
