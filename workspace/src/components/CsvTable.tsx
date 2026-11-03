import { useMemo } from "react";
import { parseCsv } from "../csv";

type CsvTableProps = { text: string; compact?: boolean };

export function CsvTable({ text, compact = false }: CsvTableProps) {
  const parsed = useMemo(() => {
    try {
      return { rows: parseCsv(text), error: undefined };
    } catch (error) {
      return {
        rows: [],
        error:
          error instanceof Error
            ? error.message
            : "This CSV could not be parsed.",
      };
    }
  }, [text]);

  if (parsed.error)
    return (
      <div className="csv-preview">
        <p className="csv-caption" role="status">
          CSV preview unavailable. {parsed.error} Original text is shown below.
        </p>
        <pre>{text}</pre>
      </div>
    );
  if (!parsed.rows.length)
    return <p className="csv-caption">No CSV rows to preview.</p>;

  const [header, ...data] = parsed.rows;
  const columnCount = parsed.rows.reduce(
    (count, row) => Math.max(count, row.length),
    0,
  );
  const visibleColumns = Math.min(columnCount, 12);
  const rowLimit = compact ? 8 : 50;
  const visibleRows = data.slice(0, rowLimit);
  const columns = Array.from({ length: visibleColumns }, (_, index) => index);
  const rowDescription =
    data.length > rowLimit
      ? `Showing ${rowLimit} of ${data.length} data rows.`
      : `${data.length} data ${data.length === 1 ? "row" : "rows"}.`;
  const columnDescription =
    columnCount > visibleColumns
      ? ` Showing the first ${visibleColumns} of ${columnCount} columns.`
      : "";
  const uneven = data.some((row) => row.length !== header.length);

  return (
    <div className="csv-preview">
      <div
        className="csv-scroll"
        role="region"
        aria-label="CSV table preview"
        tabIndex={0}
      >
        <table className="csv-table">
          <caption className="csv-caption">
            {rowDescription}
            {columnDescription}
            {uneven
              ? " Rows have different column counts; missing cells are blank."
              : ""}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column}>
                  {header[column]?.trim()
                    ? header[column]
                    : `Column ${column + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column}>{row[column] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
