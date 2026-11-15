using System.Security.Claims;
using System.Text.RegularExpressions;
using EIWAMS.Application.Common;
using EIWAMS.Application.Constants;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace EIWAMS.Infrastructure.Auth;

public sealed record TokenIdentity(Guid TenantId, Guid ObjectId, string? Email, string? DisplayName);

public interface ITokenValidator
{
    Task<TokenIdentity> ValidateAsync(string token, CancellationToken cancellationToken = default);
}

public interface IGroupMembershipValidator
{
    bool IsMember(ClaimsIdentity identity);
}

public sealed class GroupMembershipValidator : IGroupMembershipValidator
{
    private const string GroupsClaim = "groups";
    private const string LegacyGroupsClaim = "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups";
    private readonly Guid? _requiredGroupId;

    public GroupMembershipValidator(AuthOptions options)
    {
        if (!options.HasRequiredGroup)
        {
            return;
        }

        if (!Guid.TryParse(options.RequiredGroupId, out Guid groupId))
        {
            throw new InvalidOperationException("The required Entra group object id is invalid.");
        }

        _requiredGroupId = groupId;
    }

    public bool IsMember(ClaimsIdentity identity)
        => _requiredGroupId is null || identity.Claims
            .Where(claim => claim.Type is GroupsClaim or LegacyGroupsClaim)
            .Any(claim => Guid.TryParse(claim.Value, out Guid groupId) && groupId == _requiredGroupId);
}

public sealed class EntraTokenValidator : ITokenValidator
{
    private const int MaxTokenLength = 16 * 1024;
    private static readonly Regex EmailLike = new(@"^[^@\s]+@[^@\s]+$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private readonly AuthOptions _options;
    private readonly IConfigurationManager<OpenIdConnectConfiguration> _metadata;
    private readonly ILogger<EntraTokenValidator> _logger;
    private readonly IGroupMembershipValidator _groupMembershipValidator;
    private readonly JsonWebTokenHandler _handler = new();

    public EntraTokenValidator(
        AuthOptions options,
        IConfigurationManager<OpenIdConnectConfiguration> metadata,
        ILogger<EntraTokenValidator> logger,
        IGroupMembershipValidator? groupMembershipValidator = null)
    {
        _options = options;
        _metadata = metadata;
        _logger = logger;
        _groupMembershipValidator = groupMembershipValidator ?? new GroupMembershipValidator(options);
    }

    public static ConfigurationManager<OpenIdConnectConfiguration> CreateMetadataManager(AuthOptions options)
        => new(options.MetadataAddress, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever { RequireHttps = true })
        {
            AutomaticRefreshInterval = TimeSpan.FromHours(12),
            RefreshInterval = TimeSpan.FromMinutes(5),
        };

    public async Task<TokenIdentity> ValidateAsync(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > MaxTokenLength || !LooksLikeTokenForThisTenant(token))
        {
            throw AppException.Unauthorized(ApiMessages.InvalidToken);
        }

        TokenValidationResult result = await ValidateWithKeysAsync(token, cancellationToken);
        if (!result.IsValid && result.Exception is SecurityTokenSignatureKeyNotFoundException or SecurityTokenInvalidSignatureException)
        {
            // Signing keys may have rotated: refresh the metadata once and retry.
            _metadata.RequestRefresh();
            result = await ValidateWithKeysAsync(token, cancellationToken);
        }

        if (!result.IsValid)
        {
            _logger.LogWarning("Bearer token rejected: {Reason}", result.Exception?.GetType().Name ?? "unknown");
            throw AppException.Unauthorized(ApiMessages.InvalidToken);
        }

        if (!_groupMembershipValidator.IsMember(result.ClaimsIdentity))
        {
            _logger.LogWarning("Rejected a validated Entra identity that is not in the configured EIWAMS access group.");
            throw AppException.Forbidden(ApiMessages.Forbidden);
        }

        return ExtractIdentity(result.ClaimsIdentity);
    }

    // Cheap structural pre-check so malformed or foreign tokens are rejected without touching the metadata endpoint.
    private bool LooksLikeTokenForThisTenant(string token)
    {
        try
        {
            var jwt = new JsonWebToken(token);
            return _options.ValidIssuers.Contains(jwt.Issuer, StringComparer.Ordinal);
        }
        catch (Exception)
        {
            return false;
        }
    }

    private async Task<TokenValidationResult> ValidateWithKeysAsync(string token, CancellationToken cancellationToken)
    {
        OpenIdConnectConfiguration configuration;
        try
        {
            configuration = await _metadata.GetConfigurationAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Could not load Entra OpenID metadata from {Address}.", _options.MetadataAddress);
            throw new AppException(ErrorType.Unexpected, ApiMessages.AuthServiceUnavailable);
        }

        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = _options.ValidIssuers,
            ValidateAudience = true,
            ValidAudiences = _options.ValidAudiences,
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = configuration.SigningKeys,
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
        };

        return await _handler.ValidateTokenAsync(token, parameters);
    }

    private TokenIdentity ExtractIdentity(ClaimsIdentity identity)
    {
        string? Claim(string type) => identity.FindFirst(type)?.Value;

        if (!Guid.TryParse(Claim("tid"), out Guid tenantId) || !string.Equals(tenantId.ToString(), _options.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            throw AppException.Unauthorized(ApiMessages.InvalidToken);
        }

        if (!Guid.TryParse(Claim("oid"), out Guid objectId) || objectId == Guid.Empty)
        {
            throw AppException.Unauthorized(ApiMessages.InvalidToken);
        }

        if (!string.IsNullOrWhiteSpace(_options.RequiredScope) && !HasScopeOrRole(identity, _options.RequiredScope!))
        {
            throw AppException.Forbidden(ApiMessages.Forbidden);
        }

        string? email = new[] { Claim("email"), Claim("preferred_username"), Claim("upn") }
            .FirstOrDefault(e => !string.IsNullOrWhiteSpace(e) && EmailLike.IsMatch(e!))?.Trim();
        return new TokenIdentity(tenantId, objectId, email, Claim("name"));
    }

    private static bool HasScopeOrRole(ClaimsIdentity identity, string required)
    {
        string[] scopes = (identity.FindFirst("scp")?.Value ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return scopes.Contains(required, StringComparer.OrdinalIgnoreCase)
            || identity.FindAll("roles").Any(c => string.Equals(c.Value, required, StringComparison.OrdinalIgnoreCase));
    }
}
