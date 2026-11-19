/**
 * Minimal CSV writer (used by tests and sample files). Numbers are written with
 * JavaScript's shortest round-trip formatting, so `parseCsv(formatCsv(x))` keeps values.
 */
import type { CsvDelimiter } from "../schema/index.js";

/** Quotes a field when it contains the delimiter, a quote or a line break. */
export function quoteCsvField(field: string, delimiter: CsvDelimiter): string {
  if (field.includes(delimiter) || /["\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

/** Writes a header line and rows. NaN is written as an empty cell. */
export function formatCsv(
  headers: readonly string[],
  rows: readonly (readonly (number | string)[])[],
  delimiter: CsvDelimiter = ",",
): string {
  const cell = (v: number | string): string => quoteCsvField(typeof v === "number" ? (Number.isNaN(v) ? "" : String(v)) : v, delimiter);
  const lines = [headers.map(cell).join(delimiter), ...rows.map((r) => r.map(cell).join(delimiter))];
  return lines.join("\n") + "\n";
}
