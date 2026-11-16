using EIWAMS.API.Helpers;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Access;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Domain.Services.Interfaces;
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
