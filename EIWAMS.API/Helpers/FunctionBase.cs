using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace EIWAMS.API.Helpers;

/// <summary>Serialises DateTime values as UTC ISO 8601 (SQL datetime2 columns are UTC but come back unspecified).</summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        string? raw = reader.GetString();
        if (!DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out DateTime value))
        {
            throw new JsonException("Invalid date/time value.");
        }

        return value.Kind switch
        {
            DateTimeKind.Local => value.ToUniversalTime(),
            DateTimeKind.Unspecified => DateTime.SpecifyKind(value, DateTimeKind.Utc),
            _ => value,
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        DateTime utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        writer.WriteStringValue(utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
    }

    public static void Apply(JsonSerializerOptions options)
    {
        if (!options.Converters.OfType<UtcDateTimeConverter>().Any())
        {
            options.Converters.Add(new UtcDateTimeConverter());
        }
    }
}

/// <summary>Shared helpers for HTTP functions: query binding, body validation and response envelopes.</summary>
public abstract class FunctionBase
{
    private const string DateFormat = "yyyy-MM-dd";

    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    private readonly IServiceProvider _services;

    protected FunctionBase(IServiceProvider services)
    {
        _services = services;
    }

    public static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        UtcDateTimeConverter.Apply(options);
        return options;
    }

    protected static IActionResult Ok<T>(T? data, string message = ApiMessages.Success) => new OkObjectResult(ApiResponse<T>.Ok(message, data));

    protected static IActionResult Created<T>(T? data)
        => new ObjectResult(ApiResponse<T>.Ok(ApiMessages.Created, data)) { StatusCode = StatusCodes.Status201Created };

    protected static IActionResult Csv(string fileName, byte[] content)
        => new CsvFileResult(content) { FileDownloadName = fileName };

    /// <summary>Binds query string values to <typeparamref name="T"/> (case-insensitive). Invalid values return 400.</summary>
    public static T BindQuery<T>(HttpRequest req)
        where T : new()
    {
        var result = new T();
        foreach (PropertyInfo property in typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.CanWrite))
        {
            string? raw = QueryValue(req, property.Name);
            if (raw is null)
            {
                continue;
            }

            if (!TryConvert(raw, property.PropertyType, out object? value))
            {
                throw AppException.Validation(string.Format(CultureInfo.InvariantCulture, ApiMessages.InvalidQueryParameter, ToCamel(property.Name)));
            }

            property.SetValue(result, value);
        }

        if (typeof(T).GetProperty("From")?.GetValue(result) is DateTime from
            && typeof(T).GetProperty("To")?.GetValue(result) is DateTime to
            && from > to)
        {
            throw AppException.Validation(ApiMessages.InvalidDateRange);
        }

        return result;
    }

    protected static string? QueryValue(HttpRequest req, string name)
    {
        string raw = req.Query.FirstOrDefault(q => string.Equals(q.Key, name, StringComparison.OrdinalIgnoreCase)).Value.ToString();
        return string.IsNullOrWhiteSpace(raw) ? null : raw.Trim();
    }

    /// <summary>Reads the JSON body and validates it with the registered FluentValidation validator.</summary>
    protected async Task<T> ReadBodyAsync<T>(HttpRequest req)
        where T : class
    {
        T? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<T>(req.Body, JsonOptions, req.HttpContext.RequestAborted);
        }
        catch (JsonException)
        {
            throw AppException.Validation(ApiMessages.InvalidRequestBody);
        }

        if (body is null)
        {
            throw AppException.Validation(ApiMessages.InvalidRequestBody);
        }

        await ValidateAsync(body);
        return body;
    }

    /// <summary>Reads an optional JSON body; an empty body yields a new (validated) instance.</summary>
    protected async Task<T> ReadOptionalBodyAsync<T>(HttpRequest req)
        where T : class, new()
    {
        if (req.ContentLength is null or 0 && !req.Headers.TransferEncoding.Any())
        {
            var empty = new T();
            await ValidateAsync(empty);
            return empty;
        }

        return await ReadBodyAsync<T>(req);
    }

    private async Task ValidateAsync<T>(T body)
    {
        IValidator<T>? validator = _services.GetService<IValidator<T>>();
        if (validator is null)
        {
            return;
        }

        ValidationResult validation = await validator.ValidateAsync(body);
        if (!validation.IsValid)
        {
            throw AppException.Validation(ApiMessages.ValidationFailed, validation.Errors.Select(e => e.ErrorMessage).Distinct().ToList());
        }
    }

    private static bool TryConvert(string raw, Type type, out object? value)
    {
        Type target = Nullable.GetUnderlyingType(type) ?? type;
        value = null;
        if (target == typeof(string))
        {
            value = raw;
            return true;
        }

        if (target == typeof(int) && int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int i))
        {
            value = i;
            return true;
        }

        if (target == typeof(long) && long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out long l))
        {
            value = l;
            return true;
        }

        if (target == typeof(bool))
        {
            if (bool.TryParse(raw, out bool b))
            {
                value = b;
                return true;
            }

            if (raw is "1" or "0")
            {
                value = raw == "1";
                return true;
            }

            return false;
        }

        if (target == typeof(DateTime))
        {
            if (DateTime.TryParseExact(raw, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime d)
                || DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out d))
            {
                value = DateTime.SpecifyKind(d, DateTimeKind.Utc);
                return true;
            }

            return false;
        }

        if (target == typeof(DateOnly) && DateOnly.TryParseExact(raw, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateOnly date))
        {
            value = date;
            return true;
        }

        return false;
    }

    private static string ToCamel(string name) => char.ToLowerInvariant(name[0]) + name[1..];

    /// <summary>CSV download that lets a cross-origin SPA read the file name.</summary>
    private sealed class CsvFileResult(byte[] content) : FileContentResult(content, HttpConstants.CsvContentType)
    {
        public override Task ExecuteResultAsync(ActionContext context)
        {
            context.HttpContext.Response.Headers[HttpConstants.AccessControlExposeHeadersHeader] = HttpConstants.ContentDispositionHeader;
            return base.ExecuteResultAsync(context);
        }
    }
}
