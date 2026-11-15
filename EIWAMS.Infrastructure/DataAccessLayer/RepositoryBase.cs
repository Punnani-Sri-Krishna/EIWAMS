using System.Data;
using Dapper;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using Microsoft.Data.SqlClient;

namespace EIWAMS.Infrastructure.DataAccessLayer;

/// <summary>Stored-procedure-only data access helpers. Maps SQL THROW 504xx codes to <see cref="AppException"/>.</summary>
public abstract class RepositoryBase
{
    private const int CommandTimeoutSeconds = 60;
    private readonly IDbConnectionFactory _connectionFactory;

    protected RepositoryBase(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    /// <summary>Parameters for read procedures: the actor plus the given arguments.</summary>
    protected static DynamicParameters Read(ActorContext actor, object? args = null)
    {
        var p = new DynamicParameters(args);
        p.Add("ActorUserId", actor.UserId);
        return p;
    }

    /// <summary>Parameters for mutating procedures: actor, correlation id and client IP for the audit trail.</summary>
    protected static DynamicParameters Write(ActorContext actor, object? args = null)
    {
        DynamicParameters p = Read(actor, args);
        p.Add("CorrelationId", actor.CorrelationId);
        p.Add("IpAddress", actor.IpAddress is { Length: > 45 } ip ? ip[..45] : actor.IpAddress, DbType.AnsiString, size: 45);
        return p;
    }

    public static (int Page, int PageSize) NormalizePaging(int page, int pageSize)
        => (page < 1 ? 1 : page, pageSize < 1 ? HttpConstants.DefaultPageSize : Math.Min(pageSize, HttpConstants.MaxPageSize));

    protected Task<IReadOnlyList<T>> QueryAsync<T>(string procedure, object? parameters)
        => RunAsync<IReadOnlyList<T>>(async c => (await c.QueryAsync<T>(Command(procedure, parameters))).AsList());

    protected Task<T?> QuerySingleOrDefaultAsync<T>(string procedure, object? parameters)
        => RunAsync(c => c.QueryFirstOrDefaultAsync<T>(Command(procedure, parameters)));

    protected async Task<T> QuerySingleAsync<T>(string procedure, object? parameters)
        => await QuerySingleOrDefaultAsync<T>(procedure, parameters) ?? throw AppException.NotFound(ApiMessages.NotFound);

    protected Task<PagedResult<T>> QueryPagedAsync<T>(string procedure, DynamicParameters parameters, int page, int pageSize)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        parameters.Add("Page", page);
        parameters.Add("PageSize", pageSize);
        return RunAsync(async c =>
        {
            using SqlMapper.GridReader grid = await c.QueryMultipleAsync(Command(procedure, parameters));
            int total = await grid.ReadSingleAsync<int>();
            List<T> items = (await grid.ReadAsync<T>()).AsList();
            return new PagedResult<T> { Items = items, TotalCount = total, Page = page, PageSize = pageSize };
        });
    }

    protected Task<TResult> QueryMultipleAsync<TResult>(string procedure, object? parameters, Func<SqlMapper.GridReader, Task<TResult>> map)
        => RunAsync(async c =>
        {
            using SqlMapper.GridReader grid = await c.QueryMultipleAsync(Command(procedure, parameters));
            return await map(grid);
        });

    protected Task<TResult> ExecuteReaderAsync<TResult>(string procedure, object? parameters, Func<IDataReader, Task<TResult>> map)
        => RunAsync(async c =>
        {
            using IDataReader reader = await c.ExecuteReaderAsync(Command(procedure, parameters));
            return await map(reader);
        });

    private static CommandDefinition Command(string procedure, object? parameters)
        => new(procedure, parameters, commandType: CommandType.StoredProcedure, commandTimeout: CommandTimeoutSeconds);

    private async Task<T> RunAsync<T>(Func<IDbConnection, Task<T>> action)
    {
        try
        {
            using IDbConnection connection = _connectionFactory.CreateConnection();
            return await action(connection);
        }
        catch (SqlException ex)
        {
            throw MapSqlError(ex);
        }
    }

    public static Exception MapSqlError(SqlException ex) => ex.Number switch
    {
        50400 => AppException.Validation(ex.Message),
        50401 => AppException.Unauthorized(ex.Message),
        50403 => AppException.Forbidden(ex.Message),
        50404 => AppException.NotFound(ex.Message),
        50409 => AppException.Conflict(ex.Message),
        50422 => AppException.BusinessRule(ex.Message),
        2601 or 2627 => new AppException(ErrorType.Conflict, ApiMessages.Duplicate, null, ex),
        547 => new AppException(ErrorType.Validation, ApiMessages.ReferenceViolation, null, ex),
        _ => ex,
    };
}
