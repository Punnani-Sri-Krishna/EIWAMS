using System.Globalization;
using EIWAMS.Application.Constants;
using EIWAMS.Application.Models.DTOs.Identity;
using Microsoft.Extensions.Configuration;

namespace EIWAMS.Infrastructure.Auth;

public enum AuthMode
{
    DevHeader = 0,
    EntraId = 1,
}

public sealed class AuthOptions
{
    private const string Instance = "https://login.microsoftonline.com";

    public AuthMode Mode { get; set; } = AuthMode.DevHeader;

    public string TenantId { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public string SpaClientId { get; set; } = string.Empty;

    public string Audience { get; set; } = string.Empty;

    public string? RequiredScope { get; set; }

    public string RequiredGroupId { get; set; } = string.Empty;

    public string? ApiScope { get; set; }

    public bool HasRequiredGroup => !string.IsNullOrWhiteSpace(RequiredGroupId);

    public bool IsEntra => Mode == AuthMode.EntraId;

    public string Authority => $"{Instance}/{TenantId}";

    public string MetadataAddress => $"{Authority}/v2.0/.well-known/openid-configuration";

    public IReadOnlyList<string> ValidIssuers => [$"{Authority}/v2.0", $"https://sts.windows.net/{TenantId}/"];

    public IReadOnlyList<string> ValidAudiences => new[] { Audience, ClientId }
        .Where(a => !string.IsNullOrWhiteSpace(a)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    public static AuthOptions FromConfiguration(IConfiguration configuration)
    {
        string? mode = configuration[ConfigurationConstants.AuthMode];
        var options = new AuthOptions
        {
            TenantId = (configuration[ConfigurationConstants.AuthEntraTenantId] ?? string.Empty).Trim(),
            ClientId = (configuration[ConfigurationConstants.AuthEntraClientId] ?? string.Empty).Trim(),
            SpaClientId = (configuration[ConfigurationConstants.AuthEntraSpaClientId] ?? string.Empty).Trim(),
            Audience = (configuration[ConfigurationConstants.AuthEntraAudience] ?? string.Empty).Trim(),
            RequiredScope = configuration[ConfigurationConstants.AuthEntraRequiredScope]?.Trim(),
            RequiredGroupId = (configuration[ConfigurationConstants.AuthEntraRequiredGroupId] ?? string.Empty).Trim(),
            ApiScope = configuration[ConfigurationConstants.AuthEntraApiScope]?.Trim(),
        };

        if (string.IsNullOrWhiteSpace(mode))
        {
            throw new InvalidOperationException(
                $"'{ConfigurationConstants.AuthMode}' must be set explicitly to '{nameof(AuthMode.DevHeader)}' for local development or '{nameof(AuthMode.EntraId)}' for Entra authentication.");
        }

        if (!Enum.TryParse(mode.Trim(), true, out AuthMode parsed) || !Enum.IsDefined(parsed))
        {
            throw new InvalidOperationException(
                $"Invalid '{ConfigurationConstants.AuthMode}' value '{mode}'. Use '{nameof(AuthMode.DevHeader)}' or '{nameof(AuthMode.EntraId)}'.");
        }

        options.Mode = parsed;

        if (options.IsEntra)
        {
            if (!Guid.TryParse(options.TenantId, out Guid tenant) || tenant == Guid.Empty)
            {
                throw new InvalidOperationException($"'{ConfigurationConstants.AuthEntraTenantId}' must be the tenant GUID when Auth:Mode is EntraId.");
            }

            if (!Guid.TryParse(options.ClientId, out Guid client) || client == Guid.Empty)
            {
                throw new InvalidOperationException($"'{ConfigurationConstants.AuthEntraClientId}' must be the API application (client) GUID when Auth:Mode is EntraId.");
            }

            if (!Guid.TryParse(options.SpaClientId, out Guid spa) || spa == Guid.Empty)
            {
                throw new InvalidOperationException($"'{ConfigurationConstants.AuthEntraSpaClientId}' must be the SPA application (client) GUID when Auth:Mode is EntraId.");
            }

            if (options.HasRequiredGroup)
            {
                if (!Guid.TryParse(options.RequiredGroupId, out Guid groupId) || groupId == Guid.Empty)
                {
                    throw new InvalidOperationException($"'{ConfigurationConstants.AuthEntraRequiredGroupId}' must be a group object GUID or empty (no group check).");
                }

                options.RequiredGroupId = groupId.ToString();
            }

            if (string.IsNullOrWhiteSpace(options.Audience))
            {
                options.Audience = $"api://{options.ClientId}";
            }
        }

        return options;
    }

    public AuthConfigDto ToPublicConfig()
    {
        if (!IsEntra)
        {
            return new AuthConfigDto { Mode = nameof(AuthMode.DevHeader) };
        }

        string scope = string.IsNullOrWhiteSpace(RequiredScope) ? ".default" : RequiredScope!;
        string apiScope = string.IsNullOrWhiteSpace(ApiScope)
            ? string.Create(CultureInfo.InvariantCulture, $"{Audience.TrimEnd('/')}/{scope}")
            : ApiScope!;
        return new AuthConfigDto
        {
            Mode = nameof(AuthMode.EntraId),
            TenantId = TenantId,
            SpaClientId = SpaClientId,
            ApiScope = apiScope,
            Authority = Authority,
        };
    }
}
