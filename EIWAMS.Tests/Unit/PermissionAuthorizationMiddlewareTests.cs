using EIWAMS.API.Middleware;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Models.DTOs.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace EIWAMS.Tests.Unit;

public class PermissionAuthorizationMiddlewareTests
{
    private static FunctionContext Context(string functionName, CurrentUserDto? user)
    {
        var accessor = new CurrentUserAccessor();
        accessor.Set(user, Guid.NewGuid(), "127.0.0.1");

        var definition = Substitute.For<FunctionDefinition>();
        definition.Name.Returns(functionName);

        var context = Substitute.For<FunctionContext>();
        context.FunctionDefinition.Returns(definition);
        context.Items.Returns(new Dictionary<object, object> { ["HttpRequestContext"] = new DefaultHttpContext() });
        context.InstanceServices.Returns(new ServiceCollection().AddSingleton<ICurrentUserAccessor>(accessor).BuildServiceProvider());
        return context;
    }

    private static CurrentUserDto User(params string[] permissions) => new() { UserId = 7, DisplayName = "Esha", Permissions = permissions };

    private static async Task<bool> RunAsync(PermissionAuthorizationMiddleware middleware, FunctionContext context)
    {
        bool called = false;
        await middleware.Invoke(context, _ =>
        {
            called = true;
            return Task.CompletedTask;
        });
        return called;
    }

    [Fact]
    public async Task MissingPermissionIsForbiddenAndHandlerNotCalled()
    {
        var middleware = new PermissionAuthorizationMiddleware(new RateLimiter());
        AppException ex = await Assert.ThrowsAsync<AppException>(() => RunAsync(middleware, Context("SearchAuditLogs", User("AccessRequests.Create"))));
        Assert.Equal(ErrorType.Forbidden, ex.ErrorType);
    }

    [Fact]
    public async Task UnauthenticatedCallerIsRejectedForProtectedFunction()
    {
        var middleware = new PermissionAuthorizationMiddleware(new RateLimiter());
        AppException ex = await Assert.ThrowsAsync<AppException>(() => RunAsync(middleware, Context("GetMe", null)));
        Assert.Equal(ErrorType.Unauthorized, ex.ErrorType);
    }

    [Fact]
    public async Task AnonymousAndPermittedFunctionsReachHandler()
    {
        var middleware = new PermissionAuthorizationMiddleware(new RateLimiter());
        Assert.True(await RunAsync(middleware, Context("GetAuthConfig", null)));
        Assert.True(await RunAsync(middleware, Context("CreateAccessRequest", User("AccessRequests.Create"))));
    }

    [Fact]
    public async Task LostCardReportsAreRateLimitedPerUser()
    {
        var middleware = new PermissionAuthorizationMiddleware(new RateLimiter());
        int limit = PermissionAuthorizationMiddleware.RateLimits["ReportLostCard"];
        for (int i = 0; i < limit; i++)
        {
            Assert.True(await RunAsync(middleware, Context("ReportLostCard", User("Cards.Request"))));
        }

        AppException ex = await Assert.ThrowsAsync<AppException>(() => RunAsync(middleware, Context("ReportLostCard", User("Cards.Request"))));
        Assert.Equal(ErrorType.TooManyRequests, ex.ErrorType);
    }
}
