/**
 * Delimiter and decimal-separator detection (ARCHITECTURE §5.1).
 */
import { CSV_DECIMAL_COMMA_DELIMITER, CSV_DELIMITERS, CSV_SNIFF_LINES, type CsvDelimiter } from "../schema/index.js";
import { tokenizeCsv, type CsvRecord } from "./tokenize.js";

/** Decimal separator used by numeric cells. */
export type DecimalSeparator = "." | ",";

interface DelimiterScore {
  readonly delimiter: CsvDelimiter;
  /** Number of sniffed records sharing the most common field count. */
  readonly agreeing: number;
  /** The most common field count. */
  readonly fields: number;
}

/** Most common field count among records (ties go to the larger count) and its frequency. */
function modeFieldCount(records: readonly CsvRecord[]): { fields: number; agreeing: number } {
  const freq = new Map<number, number>();
  for (const r of records) freq.set(r.fields.length, (freq.get(r.fields.length) ?? 0) + 1);
  let best = { fields: 1, agreeing: 0 };
  for (const [fields, agreeing] of freq) {
    if (agreeing > best.agreeing || (agreeing === best.agreeing && fields > best.fields)) best = { fields, agreeing };
  }
  return best;
}

/** Is score `a` strictly better than `b`? Multi-field splits beat single-field ones. */
function better(a: DelimiterScore, b: DelimiterScore): boolean {
  const am = a.fields > 1 ? 1 : 0;
  const bm = b.fields > 1 ? 1 : 0;
  if (am !== bm) return am > bm;
  if (a.agreeing !== b.agreeing) return a.agreeing > b.agreeing;
  return a.fields > b.fields;
}

/**
 * Picks the delimiter from `, ; \t |` whose first {@link CSV_SNIFF_LINES} records have
 * the most consistent field count (then the most fields, then list order). Quoted
 * delimiters are ignored because each candidate is tokenized properly. Defaults to `,`.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  let best: DelimiterScore | null = null;
  for (const delimiter of CSV_DELIMITERS) {
    const { records } = tokenizeCsv(text, delimiter, CSV_SNIFF_LINES);
    const score: DelimiterScore = { delimiter, ...modeFieldCount(records) };
    if (best === null || better(score, best)) best = score;
  }
  return best?.delimiter ?? ",";
}

const DECIMAL_COMMA_CELL = /^\s*[+-]?\d*,\d+(?:[eE][+-]?\d+)?\s*$/;

/**
 * Decimal comma is allowed only with the `;` delimiter. It is chosen when any data cell
 * in the sniffed records (header excluded) looks like `12,5`.
 */
export function detectDecimal(records: readonly CsvRecord[], delimiter: CsvDelimiter): DecimalSeparator {
  if (delimiter !== CSV_DECIMAL_COMMA_DELIMITER) return ".";
  for (const r of records.slice(1, CSV_SNIFF_LINES)) {
    if (r.fields.some((f) => DECIMAL_COMMA_CELL.test(f))) return ",";
  }
  return ".";
}

const NUMBER_DOT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUMBER_COMMA = /^[+-]?(?:\d+,?\d*|,\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parses a numeric cell strictly (surrounding whitespace allowed). Anything else,
 * including empty cells, `NaN` and `Infinity`, gives NaN. With a decimal comma, a
 * dot is not accepted (it could be a thousands separator).
 */
export function parseNumberCell(cell: string, decimal: DecimalSeparator): number {
  const s = cell.trim();
  if (decimal === ".") return NUMBER_DOT.test(s) ? Number(s) : NaN;
  return NUMBER_COMMA.test(s) ? Number(s.replace(",", ".")) : NaN;
}
