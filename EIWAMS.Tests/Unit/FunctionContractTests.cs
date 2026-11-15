using System.Reflection;
using EIWAMS.API.Middleware;
using EIWAMS.Application.Constants;
using Microsoft.Azure.Functions.Worker;

namespace EIWAMS.Tests.Unit;

public class FunctionContractTests
{
    private static readonly IReadOnlyList<(string Name, string Route, string[] Methods)> Functions =
        typeof(PermissionAuthorizationMiddleware).Assembly.GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
            .Select(m => (Method: m, Function: m.GetCustomAttribute<FunctionAttribute>()))
            .Where(x => x.Function is not null)
            .Select(x =>
            {
                HttpTriggerAttribute trigger = x.Method.GetParameters()
                    .Select(p => p.GetCustomAttribute<HttpTriggerAttribute>())
                    .Single(a => a is not null)!;
                return (x.Function!.Name, trigger.Route ?? string.Empty, trigger.Methods ?? []);
            })
            .ToList();

    [Fact]
    public void EveryFunctionIsMappedToPermissionsOrExplicitlyExempt()
    {
        var unmapped = Functions
            .Where(f => !PermissionAuthorizationMiddleware.RequiredPermissions.ContainsKey(f.Name)
                        && !HttpConstants.NoPermissionFunctions.Contains(f.Name))
            .Select(f => f.Name)
            .ToList();

        Assert.Empty(unmapped);
        Assert.Equal(87, Functions.Count);
    }

    [Fact]
    public void PermissionMapHasNoStaleEntriesAndUsesKnownPermissionCodes()
    {
        var names = Functions.Select(f => f.Name).ToHashSet();
        Assert.DoesNotContain(PermissionAuthorizationMiddleware.RequiredPermissions.Keys, k => !names.Contains(k));
        Assert.DoesNotContain(HttpConstants.NoPermissionFunctions, k => !names.Contains(k));

        var known = typeof(Permissions).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.IsLiteral)
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToHashSet();
        var unknown = PermissionAuthorizationMiddleware.RequiredPermissions.Values.SelectMany(v => v).Where(p => !known.Contains(p)).Distinct();
        Assert.Empty(unknown);
    }

    [Fact]
    public void UnmappedFunctionIsDeniedByThrowing()
        => Assert.Throws<InvalidOperationException>(() => PermissionAuthorizationMiddleware.GetRequiredPermissions("NotARealFunction"));

    [Fact]
    public void RoutesAreVersionedAndUniquePerMethod()
    {
        Assert.All(Functions, f => Assert.True(f.Route.StartsWith("v1/", StringComparison.Ordinal) || f.Route == "auth/config", f.Route));

        var duplicates = Functions
            .SelectMany(f => f.Methods.Select(m => $"{m.ToUpperInvariant()} {f.Route}"))
            .GroupBy(x => x)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key);
        Assert.Empty(duplicates);
    }

    [Fact]
    public void OnlyAuthConfigAndDevUsersAreAnonymous()
        => Assert.Equal(["GetAuthConfig", "GetDevUsers"], HttpConstants.AnonymousFunctions.Order().ToArray());
}
