namespace EIWAMS.Domain.Workflow;

/// <summary>Access-request workflow definition (SDD 12). The stored procedures enforce it; these helpers keep the API
/// and UI-facing logic consistent with the same rules.</summary>
public static class AccessRequestWorkflow
{
    public const string Draft = "Draft";
    public const string Submitted = "Submitted";
    public const string PendingApproval = "PendingApproval";
    public const string Returned = "Returned";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Cancelled = "Cancelled";
    public const string Provisioned = "Provisioned";
    public const string Expired = "Expired";

    public static readonly IReadOnlyList<string> Stages = ["Manager", "Security", "AccessControl"];

    private static readonly Dictionary<string, string[]> Transitions = new(StringComparer.OrdinalIgnoreCase)
    {
        [Draft] = [Submitted, PendingApproval, Cancelled],
        [Returned] = [Submitted, PendingApproval, Cancelled],
        [Submitted] = [PendingApproval, Cancelled],
        [PendingApproval] = [PendingApproval, Approved, Returned, Rejected, Cancelled],
        [Approved] = [Provisioned, Cancelled, Expired],
        [Provisioned] = [Expired],
        [Rejected] = [],
        [Cancelled] = [],
        [Expired] = [],
    };

    public static bool CanTransition(string from, string to)
        => Transitions.TryGetValue(from, out string[]? targets) && targets.Contains(to, StringComparer.OrdinalIgnoreCase);

    public static bool IsEditable(string status)
        => string.Equals(status, Draft, StringComparison.OrdinalIgnoreCase) || string.Equals(status, Returned, StringComparison.OrdinalIgnoreCase);

    public static bool IsTerminal(string status) => Transitions.TryGetValue(status, out string[]? t) && t.Length == 0;

    /// <summary>Returns the next approval stage, or null when <paramref name="stage"/> is the last one.</summary>
    public static string? NextStage(string stage)
    {
        int index = Stages.ToList().FindIndex(s => string.Equals(s, stage, StringComparison.OrdinalIgnoreCase));
        if (index < 0)
        {
            throw new ArgumentException($"Unknown approval stage '{stage}'.", nameof(stage));
        }

        return index + 1 < Stages.Count ? Stages[index + 1] : null;
    }

    /// <summary>The status an approval decision moves a PendingApproval request to.</summary>
    public static string StatusAfterDecision(string stage, string decision) => decision switch
    {
        "Approve" => NextStage(stage) is null ? Approved : PendingApproval,
        "Return" => Returned,
        "Reject" => Rejected,
        _ => throw new ArgumentException($"Unknown decision '{decision}'.", nameof(decision)),
    };

    public static bool RequiresComments(string decision)
        => decision is "Return" or "Reject";
}
