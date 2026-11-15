using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace EIWAMS.Tests.Integration;

/// <summary>
/// Creates a fresh test database (catalog name must end in "_Test") once per test run and deploys
/// SQL scripts 01-12 (schema, procedures, seed and demo data). Connection string comes from the
/// EIWAMS_TEST_CONNECTION environment variable, falling back to the local default instance.
/// </summary>
public static partial class TestDatabase
{
    public const string ConnectionEnvironmentVariable = "EIWAMS_TEST_CONNECTION";

    private const string DefaultConnection = "Server=localhost;Database=EIWAMS_Test;Integrated Security=True;Encrypt=True;TrustServerCertificate=True";

    private static readonly Lazy<Task<string?>> Deployment = new(DeployAsync);

    public static string ConnectionString { get; } =
        Environment.GetEnvironmentVariable(ConnectionEnvironmentVariable) is { Length: > 0 } fromEnv ? fromEnv : DefaultConnection;

    /// <summary>Returns null when the database is ready, otherwise the reason it is unavailable.</summary>
    public static Task<string?> EnsureDeployedAsync() => Deployment.Value;

    private static async Task<string?> DeployAsync()
    {
        var builder = new SqlConnectionStringBuilder(ConnectionString);
        string database = builder.InitialCatalog;
        if (!database.EndsWith("_Test", StringComparison.OrdinalIgnoreCase))
        {
            return $"Refusing to run integration tests against '{database}': the catalog name must end with '_Test'.";
        }

        var master = new SqlConnectionStringBuilder(ConnectionString) { InitialCatalog = "master", ConnectTimeout = 5 };
        try
        {
            await using (var connection = new SqlConnection(master.ConnectionString))
            {
                await connection.OpenAsync();
                string quoted = "[" + database.Replace("]", "]]") + "]";
                await ExecuteAsync(connection, $"""
                    IF DB_ID(N'{database.Replace("'", "''")}') IS NOT NULL
                    BEGIN
                        ALTER DATABASE {quoted} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                        DROP DATABASE {quoted};
                    END
                    CREATE DATABASE {quoted};
                    """);
            }
        }
        catch (SqlException ex)
        {
            return $"SQL Server is not available for integration tests ({ex.Message}).";
        }

        SqlConnection.ClearAllPools();
        string scriptFolder = Path.Combine(AppContext.BaseDirectory, "SQL");
        string[] scripts = Directory.GetFiles(scriptFolder, "*.sql")
            .Where(f => int.TryParse(Path.GetFileName(f)[..2], out int n) && n <= 12)
            .Order(StringComparer.Ordinal)
            .ToArray();

        await using var db = new SqlConnection(ConnectionString);
        await db.OpenAsync();
        foreach (string script in scripts)
        {
            foreach (string batch in GoSeparator().Split(await File.ReadAllTextAsync(script)).Where(b => !string.IsNullOrWhiteSpace(b)))
            {
                await ExecuteAsync(db, batch);
            }
        }

        return null;
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql)
    {
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = 300 };
        await command.ExecuteNonQueryAsync();
    }

    [GeneratedRegex(@"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex GoSeparator();
}
