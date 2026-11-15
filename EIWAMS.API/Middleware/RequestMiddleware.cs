using System.Net;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Infrastructure.Auth;
using EIWAMS.Infrastructure.Repositories.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EIWAMS.API.Middleware;

/// <summary>Converts exceptions into the standard error envelope. <see cref="AppException"/> maps to its status; anything else is 500.</summary>
public sealed class GlobalExceptionMiddleware(ILogger<GlobalExceptionMiddleware> logger) : IFunctionsWorkerMiddleware
{
    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            AppException? appException = Unwrap(ex);
            HttpContext? http = context.GetHttpContext();
            string correlationId = context.InstanceServices.GetService<ICurrentUserAccessor>()?.CorrelationId.ToString() ?? context.InvocationId;

            if (appException is not null && appException.ErrorType != ErrorType.Unexpected)
            {
                logger.LogWarning(
                    "Function {FunctionName} returned {StatusCode}: {Message}. CorrelationId: {CorrelationId}.",
                    context.FunctionDefinition.Name, (int)appException.ErrorType, appException.Message, correlationId);
            }
            else
            {
                logger.LogError(ex, "Unhandled exception in function {FunctionName}. CorrelationId: {CorrelationId}.", context.FunctionDefinition.Name, correlationId);
            }

            if (http is null || http.Response.HasStarted)
            {
                throw;
            }

            int status = appException is null ? StatusCodes.Status500InternalServerError : (int)appException.ErrorType;
            string message = appException is null || appException.ErrorType == ErrorType.Unexpected ? ApiMessages.Unexpected : appException.Message;
            http.Response.StatusCode = status;
            http.Response.Headers[HttpConstants.CorrelationIdHeader] = correlationId;
            await http.Response.WriteAsJsonAsync(ApiResponse<object>.Fail(message, appException?.Errors, correlationId));
        }
    }

    private static AppException? Unwrap(Exception ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is AppException app)
            {
                return app;
            }
        }

        return null;
    }
}

/// <summary>
/// Resolves the caller (DevHeader <c>X-User-Id</c> or Entra bearer token), correlation id and client IP into the scoped
/// <see cref="ICurrentUserAccessor"/>. Rejects unauthenticated calls except for anonymous functions.
/// </summary>
public sealed class RequestContextMiddleware(ILogger<RequestContextMiddleware> logger, AuthOptions authOptions) : IFunctionsWorkerMiddleware
{
    private const string BearerPrefix = "Bearer ";

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        HttpContext? http = context.GetHttpContext();
        if (http is null)
        {
            await next(context);
            return;
        }

        Guid correlationId = Guid.TryParse(http.Request.Headers[HttpConstants.CorrelationIdHeader], out Guid parsed) ? parsed : Guid.NewGuid();
        http.Response.Headers[HttpConstants.CorrelationIdHeader] = correlationId.ToString();
        http.Response.Headers.Append(HttpConstants.AccessControlExposeHeadersHeader, HttpConstants.CorrelationIdHeader);
        string? ip = ResolveIp(http);

        var accessor = context.InstanceServices.GetRequiredService<ICurrentUserAccessor>();
        accessor.Set(null, correlationId, ip);
        bool anonymous = HttpConstants.AnonymousFunctions.Contains(context.FunctionDefinition.Name);

        CurrentUserDto? user = authOptions.IsEntra
            ? await AuthenticateEntraAsync(context, http, anonymous)
            : await AuthenticateDevHeaderAsync(context, http, anonymous);

        accessor.Set(user, correlationId, ip);
        using (logger.BeginScope(new Dictionary<string, object?> { ["CorrelationId"] = correlationId, ["UserId"] = user?.UserId }))
        {
            await next(context);
        }
    }

    private async Task<CurrentUserDto?> AuthenticateDevHeaderAsync(FunctionContext context, HttpContext http, bool anonymous)
    {
        string? header = http.Request.Headers[HttpConstants.UserIdHeader];
        if (string.IsNullOrWhiteSpace(header))
        {
            return anonymous ? null : throw AppException.Unauthorized(ApiMessages.Unauthenticated);
        }

        if (!int.TryParse(header, out int userId) || userId <= 0)
        {
            return anonymous ? null : throw AppException.Unauthorized(ApiMessages.InvalidUserHeader);
        }

        CurrentUserDto? user = await context.InstanceServices.GetRequiredService<IIdentityRepository>().GetUserContextAsync(userId);
        if (user is null || !user.IsActive)
        {
            logger.LogWarning("Rejected request for inactive or unknown user {UserId}.", userId);
            return anonymous ? null : throw AppException.Unauthorized(ApiMessages.UnknownUser);
        }

        return user;
    }

    private async Task<CurrentUserDto?> AuthenticateEntraAsync(FunctionContext context, HttpContext http, bool anonymous)
    {
        if (http.Request.Headers.ContainsKey(HttpConstants.UserIdHeader))
        {
            throw AppException.Unauthorized(ApiMessages.DevHeaderNotAllowed);
        }

        string? authorization = http.Request.Headers.Authorization;
        if (string.IsNullOrWhiteSpace(authorization) || !authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return anonymous ? null : throw AppException.Unauthorized(ApiMessages.Unauthenticated);
        }

        try
        {
            TokenIdentity identity = await context.InstanceServices.GetRequiredService<ITokenValidator>()
                .ValidateAsync(authorization[BearerPrefix.Length..].Trim(), context.CancellationToken);
            var repository = context.InstanceServices.GetRequiredService<IIdentityRepository>();
            EntraUserDto? mapped = await repository.ResolveEntraUserAsync(identity);
            if (mapped is null || !mapped.IsActive)
            {
                logger.LogWarning("Entra identity {ObjectId} is not provisioned or is inactive in EIWAMS.", identity.ObjectId);
                throw AppException.Forbidden(ApiMessages.UnknownUser);
            }

            CurrentUserDto? user = await repository.GetUserContextAsync(mapped.UserId);
            return user is { IsActive: true } ? user : throw AppException.Forbidden(ApiMessages.UnknownUser);
        }
        catch (AppException) when (anonymous)
        {
            return null;
        }
    }

    private static string? ResolveIp(HttpContext http)
    {
        string? forwarded = http.Request.Headers[HttpConstants.ForwardedForHeader];
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            string first = forwarded.Split(',')[0].Trim();
            return IPEndPoint.TryParse(first, out IPEndPoint? endpoint) ? endpoint.Address.ToString() : first;
        }

        return http.Connection.RemoteIpAddress?.ToString();
    }
}
