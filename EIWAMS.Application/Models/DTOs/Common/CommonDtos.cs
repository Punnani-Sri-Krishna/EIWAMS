namespace EIWAMS.Application.Models.DTOs.Common;

public class PagedQuery
{
    public int Page { get; set; } = 1;

    public int PageSize { get; set; } = 20;

    public string? Search { get; set; }

    public string? SortBy { get; set; }

    public string? SortDir { get; set; }
}

public sealed class VersionRequest
{
    public byte[]? Version { get; set; }
}

public sealed class ReasonRequest
{
    public string? Reason { get; set; }
}

public sealed class ReasonVersionRequest
{
    public string? Reason { get; set; }

    public byte[]? Version { get; set; }
}

public sealed class CommentsRequest
{
    public string? Comments { get; set; }
}

public sealed class EmptyRequest
{
}

public sealed class CountDto
{
    public int Count { get; set; }
}

public sealed class LabelCountDto
{
    public string Label { get; set; } = string.Empty;

    public int Count { get; set; }
}
