namespace EIWAMS.Application.Common;

public enum ErrorType
{
    Validation = 400,

    Unauthorized = 401,

    Forbidden = 403,

    NotFound = 404,

    Conflict = 409,

    BusinessRule = 422,

    TooManyRequests = 429,

    Unexpected = 500,
}

public sealed class AppException : Exception
{
    public AppException(ErrorType errorType, string message, IReadOnlyList<string>? errors = null, Exception? innerException = null)
        : base(message, innerException)
    {
        ErrorType = errorType;
        Errors = errors ?? [];
    }

    public ErrorType ErrorType { get; }

    public IReadOnlyList<string> Errors { get; }

    public static AppException Validation(string message, IReadOnlyList<string>? errors = null) => new(ErrorType.Validation, message, errors);

    public static AppException NotFound(string message) => new(ErrorType.NotFound, message);

    public static AppException Forbidden(string message) => new(ErrorType.Forbidden, message);

    public static AppException Unauthorized(string message) => new(ErrorType.Unauthorized, message);

    public static AppException Conflict(string message) => new(ErrorType.Conflict, message);

    public static AppException BusinessRule(string message) => new(ErrorType.BusinessRule, message);

    public static AppException TooManyRequests(string message) => new(ErrorType.TooManyRequests, message);
}

public sealed record ActorContext(
    int UserId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    Guid CorrelationId,
    string? IpAddress)
{
    public bool HasPermission(string permission) => Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
}

public sealed class ApiResponse<T>
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public T? Data { get; set; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Errors { get; set; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? CorrelationId { get; set; }

    public static ApiResponse<T> Ok(string message, T? data) => new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> Fail(string message, IReadOnlyList<string>? errors, string? correlationId) =>
        new()
        {
            Success = false,
            Message = message,
            Errors = errors is { Count: > 0 } ? errors : null,
            CorrelationId = correlationId,
        };
}

public sealed class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; set; } = [];

    public int TotalCount { get; set; }

    public int Page { get; set; }

    public int PageSize { get; set; }
}
