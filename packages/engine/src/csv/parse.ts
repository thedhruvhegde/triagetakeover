/**
 * CSV parsing into a column-major table (ARCHITECTURE §5.1 "Parsing").
 */
import {
  CSV_COMMENT_PREFIX,
  CSV_MAX_BYTES,
  CSV_MAX_COLUMNS,
  CSV_MAX_ROWS,
  err,
  ok,
  utf8ByteLength,
  type EngineError,
  type Result,
} from "../schema/index.js";
import { detectDecimal, detectDelimiter, parseNumberCell } from "./detect.js";
import { tokenizeCsv, type CsvRecord } from "./tokenize.js";
import type { CsvTable } from "./types.js";
import { decodeUtf8 } from "./utf8.js";

/** Strips a BOM and the leading `#` comment lines; returns the rest and the counts. */
export function stripPreamble(text: string): { readonly body: string; readonly commentLines: number; readonly firstLine: number } {
  let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let commentLines = 0;
  let firstLine = 1;
  for (;;) {
    const m = /^([^\r\n]*)(\r\n|\n|\r|$)/.exec(s);
    const lineText = m?.[1] ?? "";
    const isComment = lineText.startsWith(CSV_COMMENT_PREFIX);
    if (!isComment && lineText.trim() !== "") break;
    if (s === "") break;
    if (isComment) commentLines++;
    s = s.slice((m?.[0] ?? "").length);
    firstLine++;
  }
  return { body: s, commentLines, firstLine };
}

const csvError = (code: `E_${string}`, message: string, row?: number): EngineError =>
  row === undefined ? { code, message } : { code, message, row };

/** Checks the size limit for either input form. */
function checkSize(input: string | Uint8Array): EngineError | null {
  const bytes = typeof input === "string" ? utf8ByteLength(input) : input.length;
  return bytes > CSV_MAX_BYTES ? csvError("E_CSV_TOO_LARGE", `CSV is ${bytes} bytes; the limit is ${CSV_MAX_BYTES}`) : null;
}

/** Validates header and data shape; returns errors (empty when fine). */
function checkShape(records: readonly CsvRecord[]): EngineError[] {
  const header = records[0];
  if (header === undefined) return [csvError("E_CSV_EMPTY", "CSV has no header row")];
  const errs: EngineError[] = [];
  if (header.fields.length > CSV_MAX_COLUMNS) {
    errs.push(csvError("E_CSV_TOO_MANY_COLUMNS", `${header.fields.length} columns; the limit is ${CSV_MAX_COLUMNS}`, header.line));
  }
  if (records.length - 1 > CSV_MAX_ROWS) {
    errs.push(csvError("E_CSV_TOO_MANY_ROWS", `${records.length - 1} data rows; the limit is ${CSV_MAX_ROWS}`));
  }
  for (const r of records.slice(1)) {
    if (r.fields.length > header.fields.length) {
      errs.push(csvError("E_CSV_RAGGED", `row has ${r.fields.length} fields; the header has ${header.fields.length}`, r.line));
      if (errs.length >= 20) break;
    }
  }
  return errs;
}

/**
 * Parses CSV text or UTF-8 bytes. Strips a BOM, skips leading `#` comment lines and
 * blank lines, detects the delimiter and decimal separator, and converts every cell to
 * a number (NaN when non-numeric, counted per column). Rows with fewer fields than the
 * header are padded with empty (NaN) cells; rows with more are an error.
 * Errors carry the 1-based physical line in `row`.
 */
export function parseCsv(input: string | Uint8Array): Result<CsvTable> {
  const sizeErr = checkSize(input);
  if (sizeErr !== null) return err([sizeErr]);
  const text = typeof input === "string" ? input : decodeUtf8(input);
  const { body, commentLines, firstLine } = stripPreamble(text);
  const delimiter = detectDelimiter(body);
  const tok = tokenizeCsv(body, delimiter, CSV_MAX_ROWS + 2, firstLine);
  if (tok.unterminatedQuoteLine !== null) {
    return err([csvError("E_CSV_QUOTE", "unterminated quoted field", tok.unterminatedQuoteLine)]);
  }
  const shapeErrs = checkShape(tok.records);
  if (shapeErrs.length > 0) return err(shapeErrs);
  return ok(buildTable(tok.records, delimiter, detectDecimal(tok.records, delimiter), commentLines));
}

/** Converts validated records into the column-major table. */
function buildTable(
  records: readonly CsvRecord[],
  delimiter: CsvTable["delimiter"],
  decimal: CsvTable["decimal"],
  commentLines: number,
): CsvTable {
  const [header, ...rows] = records as [CsvRecord, ...CsvRecord[]];
  const headers = header.fields.map((h) => h.trim());
  const cells = headers.map(() => [] as string[]);
  const values = headers.map(() => [] as number[]);
  const nanCounts = headers.map(() => 0);
  for (const r of rows) {
    for (let c = 0; c < headers.length; c++) {
      const cell = r.fields[c] ?? "";
      const v = parseNumberCell(cell, decimal);
      (cells[c] as string[]).push(cell);
      (values[c] as number[]).push(v);
      if (Number.isNaN(v)) nanCounts[c] = (nanCounts[c] as number) + 1;
    }
  }
  return { delimiter, decimal, headers, cells, values, nanCounts, rowCount: rows.length, lines: rows.map((r) => r.line), commentLines };
}
