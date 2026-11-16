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

    [Function(nameof(GetDashboardMyWork))]
    public async Task<IActionResult> GetDashboardMyWork([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/my-work")] HttpRequest req)
        => Ok(await service.GetMyWorkAsync());

    [Function(nameof(GetDashboardActivity))]
    public async Task<IActionResult> GetDashboardActivity([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dashboard/activity")] HttpRequest req)
        => Ok(await service.GetActivityAsync(BindQuery<TopQuery>(req).Top));

    [Function(nameof(SearchAuditLogs))]
    public async Task<IActionResult> SearchAuditLogs([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/audit-logs")] HttpRequest req)
        => Ok(await service.SearchAuditAsync(BindQuery<AuditQuery>(req)));

    [Function(nameof(GetAuditTimeline))]
    public async Task<IActionResult> GetAuditTimeline([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/audit-logs/timeline")] HttpRequest req)
        => Ok(await service.GetTimelineAsync(BindQuery<AuditTimelineQuery>(req)));
}

/// <summary>Employee-linked user assignments and supporting reference data.</summary>
public sealed class AdminFunctions(IServiceProvider services, IAdminService service) : FunctionBase(services)
{
    [Function(nameof(GetAdminUsers))]
    public async Task<IActionResult> GetAdminUsers([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/admin/users")] HttpRequest req)
        => Ok(await service.SearchUsersAsync(BindQuery<AdminUserQuery>(req)));

    [Function(nameof(UpdateAdminEmployee))]
    public async Task<IActionResult> UpdateAdminEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/admin/employees/{employeeId:int}")] HttpRequest req, int employeeId)
        => Ok(await service.UpdateEmployeeAsync(employeeId, await ReadBodyAsync<SaveAdminUserRequest>(req)), ApiMessages.Updated);

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

}
