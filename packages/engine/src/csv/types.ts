/**
 * Shared CSV / mapping types.
 */
import type { CsvDelimiter } from "../schema/index.js";
import type { DecimalSeparator } from "./detect.js";

/** A non-fatal problem (duplicate time, NaN cells, ...). Codes start with `W_`. */
export interface EngineWarning {
  readonly code: `W_${string}`;
  readonly message: string;
  /** 1-based physical line number in the file. */
  readonly row?: number;
  readonly column?: string;
}

/** A parsed CSV, column-major. */
export interface CsvTable {
  readonly delimiter: CsvDelimiter;
  readonly decimal: DecimalSeparator;
  /** Trimmed header names, in file order. */
  readonly headers: readonly string[];
  /** Raw cell text per column (missing trailing cells are `""`). */
  readonly cells: readonly (readonly string[])[];
  /** Numeric value per column; non-numeric cells are NaN. */
  readonly values: readonly (readonly number[])[];
  /** Count of NaN cells per column. */
  readonly nanCounts: readonly number[];
  /** Number of data rows. */
  readonly rowCount: number;
  /** 1-based physical line number of each data row. */
  readonly lines: readonly number[];
  /** Number of leading `#` comment lines skipped. */
  readonly commentLines: number;
}
