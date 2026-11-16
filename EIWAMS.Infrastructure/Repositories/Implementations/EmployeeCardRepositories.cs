using Dapper;
using System.Text.Json;
using System.Text.Json.Serialization;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Cards;
using EIWAMS.Application.Models.DTOs.Employees;
using EIWAMS.Application.Models.DTOs.Identity;
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

    public async Task<PhotoDto> GetPhotoAsync(ActorContext actor, int employeeId)
    {
        EmployeePhotoRow row = await QuerySingleAsync<EmployeePhotoRow>(StoredProcedures.EmployeeGetPhoto, Read(actor, new { EmployeeId = employeeId }));
        return new PhotoDto
        {
            ContentType = row.ContentType,
            PhotoBase64 = Convert.ToBase64String(row.Photo),
            SizeBytes = row.SizeBytes,
            UploadedAtUtc = row.UploadedAtUtc,
        };
    }

    public Task<EmployeeSyncResultDto> SyncAsync(ActorContext actor, EmployeeSyncRequest request)
        => QuerySingleAsync<EmployeeSyncResultDto>(StoredProcedures.EmployeeSync, Write(actor, new
        {
            EmployeesJson = JsonSerializer.Serialize(request.Employees, new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                Converters = { new JsonStringEnumConverter() },
            }),
        }));

    private sealed class EmployeePhotoRow
    {
        public string ContentType { get; set; } = string.Empty;
        public byte[] Photo { get; set; } = [];
        public int SizeBytes { get; set; }
        public DateTime UploadedAtUtc { get; set; }
    }
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
            query.Mine,
        }), query.Page, query.PageSize);

    public Task<PagedResult<CardRequestDto>> QueueRequestsAsync(ActorContext actor, CardRequestQueueQuery query)
        => QueryPagedAsync<CardRequestDto>(StoredProcedures.CardRequestQueue, Read(actor, new
        {
            query.Stage,
            query.Search,
        }), query.Page, query.PageSize);

    public Task<CardRequestDetailDto> GetRequestAsync(ActorContext actor, long cardRequestId)
        => QueryCardRequestDetailAsync(StoredProcedures.CardRequestGet, Read(actor, new { CardRequestId = cardRequestId }));

    public Task<CardRequestDetailDto> CreateRequestAsync(ActorContext actor, CreateCardRequestRequest r)
    {
        byte[]? photo = DecodePhoto(r.PhotoBase64);
        return QueryCardRequestDetailAsync(StoredProcedures.CardRequestCreate, Write(actor, new
        {
            r.EmployeeId,
            r.RequestType,
            r.Reason,
            r.MobileNumber,
            r.Address,
            r.BloodGroup,
            r.EmergencyContactName,
            r.EmergencyContactNumber,
            PhotoContentType = photo is null ? null : r.PhotoContentType,
            Photo = photo,
        }));
    }

    public Task<CardRequestDetailDto> DecideRequestAsync(ActorContext actor, long cardRequestId, CardRequestDecisionRequest r)
        => QueryCardRequestDetailAsync(StoredProcedures.CardRequestDecide, Write(actor, new
        {
            CardRequestId = cardRequestId,
            r.Action,
            r.Comments,
            r.Version,
        }));

    private Task<CardRequestDetailDto> QueryCardRequestDetailAsync(string procedure, object parameters)
        => QueryMultipleAsync(procedure, parameters, async grid =>
        {
            CardRequestDetailDto? detail = await grid.ReadFirstOrDefaultAsync<CardRequestDetailDto>();
            if (detail is null)
                throw AppException.NotFound(ApiMessages.NotFound);
            detail.History = (await grid.ReadAsync<CardRequestHistoryDto>()).AsList();
            detail.AvailableActions = (await grid.ReadAsync<string>()).AsList();
            return detail;
        });

    private static byte[]? DecodePhoto(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        string base64 = value.Trim();
        int comma = base64.IndexOf(',');
        if (base64.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
            base64 = base64[(comma + 1)..];
        return Convert.FromBase64String(base64);
    }
}
