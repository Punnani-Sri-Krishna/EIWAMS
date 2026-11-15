using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Infrastructure.DataAccessLayer;
using EIWAMS.Infrastructure.Repositories.Interfaces;

namespace EIWAMS.Infrastructure.Repositories.Implementations;

public sealed class EmployeeRepository(IDbConnectionFactory factory) : RepositoryBase(factory), IEmployeeRepository
{
    public Task<PagedResult<EmployeeListItemDto>> SearchAsync(ActorContext actor, EmployeeQuery query)
        => QueryPagedAsync<EmployeeListItemDto>(StoredProcedures.EmployeeSearch, Read(actor, new
        {
            query.Search,
            query.EmploymentStatus,
            query.DepartmentId,
            query.LocationId,
            query.EmployeeType,
            query.SortBy,
            query.SortDir,
        }), query.Page, query.PageSize);

    public Task<EmployeeDetailDto> GetAsync(ActorContext actor, int employeeId)
        => QuerySingleAsync<EmployeeDetailDto>(StoredProcedures.EmployeeGet, Read(actor, new { EmployeeId = employeeId }));

    public Task<EmployeeDetailDto> CreateAsync(ActorContext actor, CreateEmployeeRequest r)
        => QuerySingleAsync<EmployeeDetailDto>(StoredProcedures.EmployeeCreate, Write(actor, new
        {
            EmployeeNumber = r.EmployeeNumber!.Trim(),
            FirstName = r.FirstName!.Trim(),
            LastName = r.LastName!.Trim(),
            WorkEmail = r.WorkEmail!.Trim(),
            r.EmployeeType,
            r.DepartmentId,
            r.ManagerEmployeeId,
            r.LocationId,
            r.JoinDate,
            r.EndDate,
            r.UserId,
        }));

    public Task<EmployeeDetailDto> UpdateAsync(ActorContext actor, int employeeId, UpdateEmployeeRequest r)
        => QuerySingleAsync<EmployeeDetailDto>(StoredProcedures.EmployeeUpdate, Write(actor, new
        {
            EmployeeId = employeeId,
            FirstName = r.FirstName!.Trim(),
            LastName = r.LastName!.Trim(),
            WorkEmail = r.WorkEmail!.Trim(),
            r.EmployeeType,
            r.DepartmentId,
            r.ManagerEmployeeId,
            r.LocationId,
            r.JoinDate,
            r.EndDate,
            r.UserId,
            r.Version,
        }));

    public Task<EmployeeDetailDto> TransferAsync(ActorContext actor, int employeeId, TransferEmployeeRequest r)
        => QuerySingleAsync<EmployeeDetailDto>(StoredProcedures.EmployeeTransfer, Write(actor, new
        {
            EmployeeId = employeeId,
            r.DepartmentId,
            r.ManagerEmployeeId,
            r.LocationId,
            r.EffectiveDate,
            r.Reason,
        }));

    public Task<EmployeeDetailDto> DeactivateAsync(ActorContext actor, int employeeId, DeactivateEmployeeRequest r)
        => QuerySingleAsync<EmployeeDetailDto>(StoredProcedures.EmployeeDeactivate, Write(actor, new
        {
            EmployeeId = employeeId,
            r.EmploymentStatus,
            r.EndDate,
            r.Reason,
        }));

    public Task<IReadOnlyList<CardDto>> GetCardsAsync(ActorContext actor, int employeeId)
        => QueryAsync<CardDto>(StoredProcedures.EmployeeGetCards, Read(actor, new { EmployeeId = employeeId }));

    public Task<IReadOnlyList<EmployeeHistoryDto>> GetHistoryAsync(ActorContext actor, int employeeId)
        => QueryAsync<EmployeeHistoryDto>(StoredProcedures.EmployeeGetHistory, Read(actor, new { EmployeeId = employeeId }));
}

public sealed class CardRepository(IDbConnectionFactory factory) : RepositoryBase(factory), ICardRepository
{
    public Task<PagedResult<CardDto>> SearchAsync(ActorContext actor, CardQuery query)
        => QueryPagedAsync<CardDto>(StoredProcedures.CardSearch, Read(actor, new
        {
            query.Search,
            query.Status,
            query.CardType,
            query.EmployeeId,
            query.SortBy,
            query.SortDir,
        }), query.Page, query.PageSize);

    public Task<CardDto> CreateAsync(ActorContext actor, CreateCardRequest r)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardCreate, Write(actor, new
        {
            r.EmployeeId,
            CardUid = r.CardUid!.Trim().ToUpperInvariant(),
            r.CardType,
            r.ExpiresAtUtc,
            r.CardRequestId,
        }));

    public Task<CardDto> ActivateAsync(ActorContext actor, long cardId, byte[] version)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardActivate, Write(actor, new { CardId = cardId, Version = version }));

    public Task<CardDto> BlockAsync(ActorContext actor, long cardId, string reason, byte[] version)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardBlock, Write(actor, new { CardId = cardId, Reason = reason, Version = version }));

    public Task<CardDto> ReportLostAsync(ActorContext actor, long cardId, string reason)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardReportLost, Write(actor, new { CardId = cardId, Reason = reason }));

    public Task<CardDto> ReplaceAsync(ActorContext actor, long cardId, ReplaceCardRequest r)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardReplace, Write(actor, new
        {
            CardId = cardId,
            NewCardUid = r.NewCardUid!.Trim().ToUpperInvariant(),
            r.Reason,
            r.Version,
        }));

    public Task<CardDto> DeactivateAsync(ActorContext actor, long cardId, string reason, byte[] version)
        => QuerySingleAsync<CardDto>(StoredProcedures.CardDeactivate, Write(actor, new { CardId = cardId, Reason = reason, Version = version }));

    public Task<PagedResult<CardRequestDto>> SearchRequestsAsync(ActorContext actor, CardRequestQuery query)
        => QueryPagedAsync<CardRequestDto>(StoredProcedures.CardRequestSearch, Read(actor, new
        {
            query.Status,
            query.RequestType,
            query.EmployeeId,
            query.Search,
        }), query.Page, query.PageSize);

    public Task<CardRequestDto> CreateRequestAsync(ActorContext actor, CreateCardRequestRequest r)
        => QuerySingleAsync<CardRequestDto>(StoredProcedures.CardRequestCreate, Write(actor, new
        {
            r.EmployeeId,
            r.RequestType,
            r.OldCardId,
            r.Reason,
            r.RequestedValidToUtc,
        }));

    public Task<CardRequestDto> DecideRequestAsync(ActorContext actor, long cardRequestId, CardRequestDecisionRequest r)
        => QuerySingleAsync<CardRequestDto>(StoredProcedures.CardRequestDecide, Write(actor, new
        {
            CardRequestId = cardRequestId,
            r.Decision,
            r.Comments,
        }));
}
