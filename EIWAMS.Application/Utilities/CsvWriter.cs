using System.Globalization;
using System.Text;

namespace EIWAMS.Application.Utilities;

public static class CsvWriter
{
    private static readonly char[] FormulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];

    /// <summary>Writes rows as RFC 4180 CSV with a UTF-8 BOM. Cells that could be interpreted as spreadsheet formulas are neutralised.</summary>
    public static byte[] Write(IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<object?>> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(',', headers.Select(Escape)));
        foreach (IReadOnlyList<object?> row in rows)
        {
            sb.AppendLine(string.Join(',', row.Select(v => Escape(Format(v)))));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static string Format(object? value) => value switch
    {
        null => string.Empty,
        DateTime dt => dt.TimeOfDay == TimeSpan.Zero && dt.Kind != DateTimeKind.Utc
            ? dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : DateTime.SpecifyKind(dt, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
        DateOnly d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        bool b => b ? "Yes" : "No",
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty,
    };

    private static string Escape(string value)
    {
        if (value.Length > 0 && FormulaPrefixes.Contains(value[0]) && !double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + value.Replace("\"", "\"\"") + "\"" : value;
    }
}
