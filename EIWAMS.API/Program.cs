using Azure.Monitor.OpenTelemetry.Exporter;
using EIWAMS.API.Helpers;
using EIWAMS.API.Middleware;
using EIWAMS.Application.Abstractions;
using EIWAMS.Application.Validators;
using EIWAMS.Domain.Services.Implementations;
using EIWAMS.Domain.Services.Interfaces;
using EIWAMS.Infrastructure.Auth;
using EIWAMS.Infrastructure.DataAccessLayer;
using EIWAMS.Infrastructure.Repositories.Implementations;
using EIWAMS.Infrastructure.Repositories.Interfaces;
using FluentValidation;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Order matters: exception handling wraps authentication, which runs before permission checks.
builder.UseMiddleware<GlobalExceptionMiddleware>();
builder.UseMiddleware<RequestContextMiddleware>();
builder.UseMiddleware<PermissionAuthorizationMiddleware>();

if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING")))
{
    builder.Services.AddOpenTelemetry()
        .UseFunctionsWorkerDefaults()
        .UseAzureMonitorExporter();
}

builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o => UtcDateTimeConverter.Apply(o.JsonSerializerOptions));
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o => UtcDateTimeConverter.Apply(o.SerializerOptions));

// Fail fast on missing configuration: SqlConnectionString and Auth:Mode (plus Entra settings in EntraId mode).
string connectionString = SqlDbConnectionFactory.ResolveConnectionString(builder.Configuration);
builder.Services.AddSingleton<IDbConnectionFactory>(new SqlDbConnectionFactory(connectionString));

AuthOptions authOptions = AuthOptions.FromConfiguration(builder.Configuration);
builder.Services.AddSingleton(authOptions);
if (authOptions.IsEntra)
{
    builder.Services.AddSingleton<IGroupMembershipValidator, GroupMembershipValidator>();
    builder.Services.AddSingleton<ITokenValidator>(sp => new EntraTokenValidator(
        authOptions,
        EntraTokenValidator.CreateMetadataManager(authOptions),
        sp.GetRequiredService<ILogger<EntraTokenValidator>>(),
        sp.GetRequiredService<IGroupMembershipValidator>()));
}

builder.Services.AddSingleton<RateLimiter>();
builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateEmployeeRequestValidator>();

builder.Services.AddScoped<IIdentityRepository, IdentityRepository>();
builder.Services.AddScoped<IEmployeeRepository, EmployeeRepository>();
builder.Services.AddScoped<ICardRepository, CardRepository>();
builder.Services.AddScoped<IAccessRepository, AccessRepository>();
builder.Services.AddScoped<ISecurityRepository, SecurityRepository>();
builder.Services.AddScoped<IVisitorRepository, VisitorRepository>();
builder.Services.AddScoped<IInsightsRepository, InsightsRepository>();
builder.Services.AddScoped<IAdminRepository, AdminRepository>();

builder.Services.AddScoped<IIdentityService, IdentityService>();
builder.Services.AddScoped<IEmployeeService, EmployeeService>();
builder.Services.AddScoped<ICardService, CardService>();
builder.Services.AddScoped<IAccessService, AccessService>();
builder.Services.AddScoped<ISecurityService, SecurityService>();
builder.Services.AddScoped<IVisitorService, VisitorService>();
builder.Services.AddScoped<IInsightsService, InsightsService>();
builder.Services.AddScoped<IAdminService, AdminService>();

builder.Build().Run();
