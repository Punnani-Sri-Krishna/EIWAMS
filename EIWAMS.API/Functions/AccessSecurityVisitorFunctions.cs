using EIWAMS.API.Helpers;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Security;
using EIWAMS.Application.Models.DTOs.Visitors;
using EIWAMS.Domain.Services.Interfaces;
using EIWAMS.Domain.Workflow;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace EIWAMS.API.Functions;

/// <summary>Access requests, approvals and access permissions.</summary>
public sealed class AccessFunctions(IServiceProvider services, IAccessService service) : FunctionBase(services)
{
    [Function(nameof(SearchAccessRequests))]
    public async Task<IActionResult> SearchAccessRequests([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/access-requests")] HttpRequest req)
        => Ok(await service.SearchRequestsAsync(BindQuery<AccessRequestQuery>(req)));

    [Function(nameof(CreateAccessRequest))]
    public async Task<IActionResult> CreateAccessRequest([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/access-requests")] HttpRequest req)
        => Created(await service.CreateRequestAsync(await ReadBodyAsync<CreateAccessRequestRequest>(req)));

    [Function(nameof(GetAccessRequest))]
    public async Task<IActionResult> GetAccessRequest([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/access-requests/{id:long}")] HttpRequest req, long id)
        => Ok(await service.GetRequestAsync(id));

    [Function(nameof(UpdateAccessRequest))]
    public async Task<IActionResult> UpdateAccessRequest([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/access-requests/{id:long}")] HttpRequest req, long id)
        => Ok(await service.UpdateRequestAsync(id, await ReadBodyAsync<UpdateAccessRequestRequest>(req)), ApiMessages.Updated);

    [Function(nameof(SubmitAccessRequest))]
    public async Task<IActionResult> SubmitAccessRequest([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/access-requests/{id:long}/submit")] HttpRequest req, long id)
        => Ok(await service.SubmitRequestAsync(id, await ReadBodyAsync<VersionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(CancelAccessRequest))]
    public async Task<IActionResult> CancelAccessRequest([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/access-requests/{id:long}/cancel")] HttpRequest req, long id)
        => Ok(await service.CancelRequestAsync(id, await ReadBodyAsync<ReasonVersionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetPendingApprovals))]
    public async Task<IActionResult> GetPendingApprovals([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/approvals/pending")] HttpRequest req)
        => Ok(await service.GetPendingApprovalsAsync(BindQuery<ApprovalQueueQuery>(req)));

    [Function(nameof(Approvals_Team))]
    public async Task<IActionResult> Approvals_Team([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/approvals/team")] HttpRequest req)
        => Ok(await service.GetTeamApprovalsAsync(BindQuery<TeamRequestQuery>(req)));

    [Function(nameof(DecideApproval))]
    public async Task<IActionResult> DecideApproval(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/approvals/{accessRequestId:long}/decision")] HttpRequest req, long accessRequestId)
        => Ok(await service.DecideAsync(accessRequestId, await ReadBodyAsync<ApprovalDecisionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(SearchPermissions))]
    public async Task<IActionResult> SearchPermissions([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/permissions")] HttpRequest req)
        => Ok(await service.SearchPermissionsAsync(BindQuery<PermissionQuery>(req)));

    [Function(nameof(ProvisionPermission))]
    public async Task<IActionResult> ProvisionPermission([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/permissions/provision")] HttpRequest req)
        => Created(await service.ProvisionAsync(await ReadBodyAsync<ProvisionPermissionRequest>(req)));

    [Function(nameof(RevokePermission))]
    public async Task<IActionResult> RevokePermission([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/permissions/{id:long}/revoke")] HttpRequest req, long id)
        => Ok(await service.RevokeAsync(id, await ReadBodyAsync<ReasonRequest>(req)), ApiMessages.Updated);
}

/// <summary>RFID ingest and monitoring, violations, incidents and the blacklist.</summary>
public sealed class SecurityFunctions(IServiceProvider services, ISecurityService service) : FunctionBase(services)
{
    [Function(nameof(IngestRfidEvent))]
    public async Task<IActionResult> IngestRfidEvent([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/rfid/events")] HttpRequest req)
        => Ok(await service.IngestEventAsync(await ReadBodyAsync<RfidEventRequest>(req)));

    [Function(nameof(SearchRfidEvents))]
    public async Task<IActionResult> SearchRfidEvents([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/rfid/events")] HttpRequest req)
        => Ok(await service.SearchAccessLogsAsync(BindQuery<AccessLogQuery>(req)));

    [Function(nameof(SearchViolations))]
    public async Task<IActionResult> SearchViolations([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/violations")] HttpRequest req)
        => Ok(await service.SearchViolationsAsync(BindQuery<ViolationQuery>(req)));

    [Function(nameof(ReviewViolation))]
    public async Task<IActionResult> ReviewViolation([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/violations/{id:long}/review")] HttpRequest req, long id)
        => Ok(await service.ReviewViolationAsync(id, await ReadBodyAsync<ReviewViolationRequest>(req)), ApiMessages.Updated);

    [Function(nameof(SearchIncidents))]
    public async Task<IActionResult> SearchIncidents([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/incidents")] HttpRequest req)
        => Ok(await service.SearchIncidentsAsync(BindQuery<IncidentQuery>(req)));

    [Function(nameof(CreateIncident))]
    public async Task<IActionResult> CreateIncident([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/incidents")] HttpRequest req)
        => Created(await service.CreateIncidentAsync(await ReadBodyAsync<CreateIncidentRequest>(req)));

    [Function(nameof(GetIncident))]
    public async Task<IActionResult> GetIncident([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/incidents/{id:int}")] HttpRequest req, int id)
        => Ok(await service.GetIncidentAsync(id));

    [Function(nameof(UpdateIncident))]
    public async Task<IActionResult> UpdateIncident([HttpTrigger(AuthorizationLevel.Anonymous, "patch", Route = "v1/incidents/{id:int}")] HttpRequest req, int id)
        => Ok(await service.UpdateIncidentAsync(id, await ReadBodyAsync<UpdateIncidentRequest>(req)), ApiMessages.Updated);

    [Function(nameof(SearchBlacklist))]
    public async Task<IActionResult> SearchBlacklist([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/blacklist")] HttpRequest req)
        => Ok(await service.SearchBlacklistAsync(BindQuery<BlacklistQuery>(req)));

    [Function(nameof(CreateBlacklistEntry))]
    public async Task<IActionResult> CreateBlacklistEntry([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/blacklist")] HttpRequest req)
        => Created(await service.CreateBlacklistAsync(await ReadBodyAsync<CreateBlacklistRequest>(req)));

    [Function(nameof(LiftBlacklistEntry))]
    public async Task<IActionResult> LiftBlacklistEntry([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/blacklist/{id:int}/lift")] HttpRequest req, int id)
        => Ok(await service.LiftBlacklistAsync(id, await ReadBodyAsync<ReasonRequest>(req)), ApiMessages.Updated);
}

/// <summary>Visitors and visitor passes.</summary>
public sealed class VisitorFunctions(IServiceProvider services, IVisitorService service) : FunctionBase(services)
{
    [Function(nameof(SearchVisitors))]
    public async Task<IActionResult> SearchVisitors([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/visitors")] HttpRequest req)
        => Ok(await service.SearchVisitorsAsync(BindQuery<PagedQuery>(req)));

    [Function(nameof(CreateVisitor))]
    public async Task<IActionResult> CreateVisitor([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitors")] HttpRequest req)
        => Created(await service.CreateVisitorAsync(await ReadBodyAsync<CreateVisitorRequest>(req)));

    [Function(nameof(SearchVisitorPasses))]
    public async Task<IActionResult> SearchVisitorPasses([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/visitor-passes")] HttpRequest req)
        => Ok(await service.SearchPassesAsync(BindQuery<VisitorPassQuery>(req)));

    [Function(nameof(CreateVisitorPass))]
    public async Task<IActionResult> CreateVisitorPass([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitor-passes")] HttpRequest req)
        => Created(await service.CreatePassAsync(await ReadBodyAsync<CreateVisitorPassRequest>(req)));

    [Function(nameof(ApproveVisitorPass))]
    public async Task<IActionResult> ApproveVisitorPass([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitor-passes/{id:long}/approve")] HttpRequest req, long id)
        => Ok(await service.TransitionPassAsync(id, VisitorPassWorkflow.Approve, (await ReadOptionalBodyAsync<CommentsRequest>(req)).Comments), ApiMessages.Updated);

    [Function(nameof(CheckInVisitorPass))]
    public async Task<IActionResult> CheckInVisitorPass([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitor-passes/{id:long}/check-in")] HttpRequest req, long id)
        => Ok(await service.TransitionPassAsync(id, VisitorPassWorkflow.CheckIn, null), ApiMessages.Updated);

    [Function(nameof(CheckOutVisitorPass))]
    public async Task<IActionResult> CheckOutVisitorPass([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitor-passes/{id:long}/check-out")] HttpRequest req, long id)
        => Ok(await service.TransitionPassAsync(id, VisitorPassWorkflow.CheckOut, null), ApiMessages.Updated);

    [Function(nameof(RevokeVisitorPass))]
    public async Task<IActionResult> RevokeVisitorPass([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/visitor-passes/{id:long}/revoke")] HttpRequest req, long id)
        => Ok(await service.TransitionPassAsync(id, VisitorPassWorkflow.Revoke, (await ReadBodyAsync<ReasonRequest>(req)).Reason), ApiMessages.Updated);
}
