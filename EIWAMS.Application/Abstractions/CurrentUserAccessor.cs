using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Identity;

namespace EIWAMS.Application.Abstractions;

public interface ICurrentUserAccessor
{
    CurrentUserDto? User { get; }

    Guid CorrelationId { get; }

    string? IpAddress { get; }

    void Set(CurrentUserDto? user, Guid correlationId, string? ipAddress);

    ActorContext GetActor();
}

public sealed class CurrentUserAccessor : ICurrentUserAccessor
{
    public CurrentUserDto? User { get; private set; }

    public Guid CorrelationId { get; private set; } = Guid.NewGuid();

    public string? IpAddress { get; private set; }

    public void Set(CurrentUserDto? user, Guid correlationId, string? ipAddress)
    {
        User = user;
        CorrelationId = correlationId;
        IpAddress = ipAddress;
    }

    public ActorContext GetActor()
    {
        if (User is null)
        {
            throw AppException.Unauthorized(ApiMessages.Unauthenticated);
        }

        return new ActorContext(User.UserId, User.Roles, User.Permissions, CorrelationId, IpAddress);
    }
}
