using System.Data;
using Dapper;
using EIWAMS.Application.Constants;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace EIWAMS.Infrastructure.DataAccessLayer;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

public sealed class SqlDbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    static SqlDbConnectionFactory() => DapperTypeHandlers.Register();

    public SqlDbConnectionFactory(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"Connection string '{ConfigurationConstants.SqlConnectionString}' (or '{ConfigurationConstants.DefaultConnectionString}') is not configured.");
        }

        _connectionString = connectionString;
    }

    public static string ResolveConnectionString(IConfiguration configuration)
        => configuration[ConfigurationConstants.SqlConnectionString]
           ?? configuration[ConfigurationConstants.DefaultConnectionString]
           ?? string.Empty;

    public IDbConnection CreateConnection() => new SqlConnection(_connectionString);
}

public static class DapperTypeHandlers
{
    private static int _registered;

    public static void Register()
    {
        if (Interlocked.Exchange(ref _registered, 1) == 1)
        {
            return;
        }

        SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
    }

    private sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
    {
        public override DateOnly Parse(object value) => value switch
        {
            DateTime dt => DateOnly.FromDateTime(dt),
            DateOnly d => d,
            _ => DateOnly.Parse(value.ToString()!, System.Globalization.CultureInfo.InvariantCulture),
        };

        public override void SetValue(IDbDataParameter parameter, DateOnly value)
        {
            parameter.DbType = DbType.Date;
            parameter.Value = value.ToDateTime(TimeOnly.MinValue);
        }
    }
}
