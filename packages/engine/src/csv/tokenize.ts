/**
 * RFC 4180 subset tokenizer (ARCHITECTURE §5.1): quoted fields, `""` escapes, quoted
 * delimiters and line breaks, and LF / CRLF / CR record terminators.
 */

/** One CSV record with the 1-based physical line on which it starts. */
export interface CsvRecord {
  readonly fields: readonly string[];
  readonly line: number;
}

/** Tokenizer output. `unterminatedQuoteLine` is set when the text ends inside quotes. */
export interface TokenizeResult {
  readonly records: readonly CsvRecord[];
  readonly unterminatedQuoteLine: number | null;
}

/**
 * Splits `text` into records. Records consisting of a single empty field (blank lines)
 * are dropped. Stops after `maxRecords` records when given. `firstLine` is the physical
 * line number of the first character of `text`.
 */
export function tokenizeCsv(text: string, delimiter: string, maxRecords = Infinity, firstLine = 1): TokenizeResult {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = firstLine;
  let recordLine = firstLine;
  let quoteLine = firstLine;
  let i = 0;
  const n = text.length;

  const endRecord = (): void => {
    fields.push(field);
    if (!(fields.length === 1 && fields[0] === "")) records.push({ fields, line: recordLine });
    fields = [];
    field = "";
  };

  while (i < n && records.length < maxRecords) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        if (c === "\n" || (c === "\r" && text[i + 1] !== "\n")) line++;
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      quoteLine = line;
    } else if (c === delimiter) {
      fields.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += c;
    }
    i++;
  }
  if (inQuotes) return { records, unterminatedQuoteLine: quoteLine };
  if (records.length < maxRecords && (field !== "" || fields.length > 0)) endRecord();
  return { records, unterminatedQuoteLine: null };
}
