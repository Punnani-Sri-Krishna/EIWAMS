using EIWAMS.API.Helpers;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Common;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Domain.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace EIWAMS.API.Functions;

/// <summary>Employee master data, transfers, deactivation and history.</summary>
public sealed class EmployeeFunctions(IServiceProvider services, IEmployeeService service) : FunctionBase(services)
{
    [Function(nameof(SearchEmployees))]
    public async Task<IActionResult> SearchEmployees([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/employees")] HttpRequest req)
        => Ok(await service.SearchAsync(BindQuery<EmployeeQuery>(req)));

    [Function(nameof(CreateEmployee))]
    public async Task<IActionResult> CreateEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/employees")] HttpRequest req)
        => Created(await service.CreateAsync(await ReadBodyAsync<CreateEmployeeRequest>(req)));

    [Function(nameof(GetEmployee))]
    public async Task<IActionResult> GetEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/employees/{id:int}")] HttpRequest req, int id)
        => Ok(await service.GetAsync(id));

    [Function(nameof(UpdateEmployee))]
    public async Task<IActionResult> UpdateEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "v1/employees/{id:int}")] HttpRequest req, int id)
        => Ok(await service.UpdateAsync(id, await ReadBodyAsync<UpdateEmployeeRequest>(req)), ApiMessages.Updated);

    [Function(nameof(TransferEmployee))]
    public async Task<IActionResult> TransferEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/employees/{id:int}/transfer")] HttpRequest req, int id)
        => Ok(await service.TransferAsync(id, await ReadBodyAsync<TransferEmployeeRequest>(req)), ApiMessages.Updated);

    [Function(nameof(DeactivateEmployee))]
    public async Task<IActionResult> DeactivateEmployee([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/employees/{id:int}/deactivate")] HttpRequest req, int id)
        => Ok(await service.DeactivateAsync(id, await ReadBodyAsync<DeactivateEmployeeRequest>(req)), ApiMessages.Updated);

    [Function(nameof(GetEmployeeCards))]
    public async Task<IActionResult> GetEmployeeCards([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/employees/{id:int}/cards")] HttpRequest req, int id)
        => Ok(await service.GetCardsAsync(id));

    [Function(nameof(GetEmployeeHistory))]
    public async Task<IActionResult> GetEmployeeHistory([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/employees/{id:int}/history")] HttpRequest req, int id)
        => Ok(await service.GetHistoryAsync(id));
}

/// <summary>RFID card lifecycle and card requests.</summary>
public sealed class CardFunctions(IServiceProvider services, ICardService service) : FunctionBase(services)
{
    [Function(nameof(SearchCards))]
    public async Task<IActionResult> SearchCards([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/cards")] HttpRequest req)
        => Ok(await service.SearchAsync(BindQuery<CardQuery>(req)));

    [Function(nameof(CreateCard))]
    public async Task<IActionResult> CreateCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards")] HttpRequest req)
        => Created(await service.CreateAsync(await ReadBodyAsync<CreateCardRequest>(req)));

    [Function(nameof(ActivateCard))]
    public async Task<IActionResult> ActivateCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards/{id:long}/activate")] HttpRequest req, long id)
        => Ok(await service.ActivateAsync(id, await ReadBodyAsync<VersionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(BlockCard))]
    public async Task<IActionResult> BlockCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards/{id:long}/block")] HttpRequest req, long id)
        => Ok(await service.BlockAsync(id, await ReadBodyAsync<ReasonVersionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(ReportLostCard))]
    public async Task<IActionResult> ReportLostCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards/{id:long}/report-lost")] HttpRequest req, long id)
        => Ok(await service.ReportLostAsync(id, await ReadBodyAsync<ReasonRequest>(req)), ApiMessages.Updated);

    [Function(nameof(ReplaceCard))]
    public async Task<IActionResult> ReplaceCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards/{id:long}/replace")] HttpRequest req, long id)
        => Ok(await service.ReplaceAsync(id, await ReadBodyAsync<ReplaceCardRequest>(req)), ApiMessages.Updated);

    [Function(nameof(DeactivateCard))]
    public async Task<IActionResult> DeactivateCard([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/cards/{id:long}/deactivate")] HttpRequest req, long id)
        => Ok(await service.DeactivateAsync(id, await ReadBodyAsync<ReasonVersionRequest>(req)), ApiMessages.Updated);

    [Function(nameof(SearchCardRequests))]
    public async Task<IActionResult> SearchCardRequests([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/card-requests")] HttpRequest req)
        => Ok(await service.SearchRequestsAsync(BindQuery<CardRequestQuery>(req)));

    [Function(nameof(CreateCardRequest))]
    public async Task<IActionResult> CreateCardRequest([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/card-requests")] HttpRequest req)
        => Created(await service.CreateRequestAsync(await ReadBodyAsync<CreateCardRequestRequest>(req)));

    [Function(nameof(DecideCardRequest))]
    public async Task<IActionResult> DecideCardRequest([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/card-requests/{id:long}/decision")] HttpRequest req, long id)
        => Ok(await service.DecideRequestAsync(id, await ReadBodyAsync<CardRequestDecisionRequest>(req)), ApiMessages.Updated);
}
