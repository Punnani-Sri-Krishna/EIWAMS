using EIWAMS.API.Helpers;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Identity;
using EIWAMS.Domain.Services.Interfaces;
using EIWAMS.Infrastructure.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace EIWAMS.API.Functions;

/// <summary>Authentication configuration, current user, menu, lookups and notifications.</summary>
public sealed class IdentityFunctions(IServiceProvider services, IIdentityService service, AuthOptions authOptions) : FunctionBase(services)
{
    [Function(nameof(GetAuthConfig))]
    public IActionResult GetAuthConfig([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "auth/config")] HttpRequest req)
        => Ok(authOptions.ToPublicConfig());

    [Function(nameof(GetDevUsers))]
    public async Task<IActionResult> GetDevUsers([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/dev/users")] HttpRequest req)
    {
        if (authOptions.Mode != AuthMode.DevHeader)
        {
            throw AppException.NotFound(ApiMessages.NotFound);
        }

        return Ok(await service.GetDevUsersAsync());
    }

    [Function(nameof(GetMe))]
    public IActionResult GetMe([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/me")] HttpRequest req)
        => Ok(service.GetMe());

    [Function(nameof(GetMyMenu))]
    public async Task<IActionResult> GetMyMenu([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/me/menu")] HttpRequest req)
        => Ok(await service.GetMenuAsync());

    [Function(nameof(GetLookups))]
    public async Task<IActionResult> GetLookups([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/lookups")] HttpRequest req)
        => Ok(await service.GetLookupsAsync());

    [Function(nameof(GetNotifications))]
    public async Task<IActionResult> GetNotifications([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/notifications")] HttpRequest req)
        => Ok(await service.GetNotificationsAsync(BindQuery<NotificationQuery>(req)));

    [Function(nameof(GetUnreadNotificationCount))]
    public async Task<IActionResult> GetUnreadNotificationCount([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "v1/notifications/unread-count")] HttpRequest req)
        => Ok(await service.GetUnreadCountAsync());

    [Function(nameof(MarkNotificationRead))]
    public async Task<IActionResult> MarkNotificationRead(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/notifications/{id:long}/read")] HttpRequest req, long id)
        => Ok(await service.MarkReadAsync(id), ApiMessages.Updated);

    [Function(nameof(MarkAllNotificationsRead))]
    public async Task<IActionResult> MarkAllNotificationsRead([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/notifications/read-all")] HttpRequest req)
        => Ok(await service.MarkAllReadAsync(), ApiMessages.Updated);
}
