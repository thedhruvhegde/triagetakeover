import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  decodeUtf8,
  detectDelimiter,
  encodeUtf8,
  formatCsv,
  parseCsv,
  parseNumberCell,
  quoteCsvField,
  stripPreamble,
  tokenizeCsv,
} from "../src/csv/index.js";
import { CSV_DELIMITERS, CSV_MAX_BYTES, type CsvDelimiter } from "../src/schema/index.js";

const mustParse = (s: string | Uint8Array) => {
  const r = parseCsv(s);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const mustFail = (s: string | Uint8Array) => {
  const r = parseCsv(s);
  if (r.ok) throw new Error("expected failure");
  return r.error;
};

describe("csv: tokenizer", () => {
  it("handles quotes, escaped quotes, embedded delimiters and line breaks", () => {
    const { records, unterminatedQuoteLine } = tokenizeCsv('a,"b,c","d ""e""\nf"\r\n1,2,3\r4,5,6', ",");
    expect(unterminatedQuoteLine).toBeNull();
    expect(records.map((r) => r.fields)).toEqual([
      ["a", "b,c", 'd "e"\nf'],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(records.map((r) => r.line)).toEqual([1, 3, 4]);
  });

  it("drops blank lines and keeps empty fields", () => {
    const { records } = tokenizeCsv("a,,b\n\n,\n", ",");
    expect(records.map((r) => r.fields)).toEqual([["a", "", "b"], ["", ""]]);
  });

  it("reports an unterminated quote with its line", () => {
    expect(tokenizeCsv('a,b\n1,"x\n2', ",").unterminatedQuoteLine).toBe(2);
  });

  it("respects maxRecords", () => {
    expect(tokenizeCsv("1\n2\n3\n4", ",", 2).records).toHaveLength(2);
  });
});

describe("csv: detection", () => {
  it.each(CSV_DELIMITERS.map((d) => [d]))("detects %j", (d) => {
    const text = [["t", "speed", "brake"], ["0", "1", "2"], ["0.1", "1", "2"]].map((r) => r.join(d)).join("\n");
    expect(detectDelimiter(text)).toBe(d);
  });

  it("prefers the most consistent field count", () => {
    // Commas appear inside values only on some lines; ';' is consistent.
    expect(detectDelimiter("a;b;c\n1,5;2;3\n4;5,2;6\n7;8;9")).toBe(";");
  });

  it("decimal comma only with ';'", () => {
    const t = mustParse("t;speed\n0,0;12,5\n0,1;13\n");
    expect(t.delimiter).toBe(";");
    expect(t.decimal).toBe(",");
    expect(t.values).toEqual([[0, 0.1], [12.5, 13]]);
    const c = mustParse('t,speed\n0,"12,5"\n');
    expect(c.decimal).toBe(".");
    expect(c.values[1]).toEqual([NaN]);
  });

  it("parses numeric cells strictly", () => {
    expect(parseNumberCell(" 1.5e3 ", ".")).toBe(1500);
    expect(parseNumberCell("-.5", ".")).toBe(-0.5);
    for (const bad of ["", "NaN", "Infinity", "0x10", "1,5", "ON", "1.2.3"]) expect(parseNumberCell(bad, ".")).toBeNaN();
    expect(parseNumberCell("-1,25", ",")).toBe(-1.25);
    expect(parseNumberCell("1.25", ",")).toBeNaN();
  });
});

describe("csv: parse", () => {
  it("strips BOM and leading # comment lines, keeps physical line numbers", () => {
    const text = "﻿# SYNTHETIC DATA - seed 1\n# another\nt,speed\n0,1\n0.1,2\n";
    const t = mustParse(text);
    expect(t.commentLines).toBe(2);
    expect(t.headers).toEqual(["t", "speed"]);
    expect(t.lines).toEqual([4, 5]);
    expect(stripPreamble("﻿t\n1").body).toBe("t\n1");
  });

  it("does not skip # lines after the header", () => {
    const t = mustParse("t,x\n# not a comment\n1,2\n");
    expect(t.rowCount).toBe(2);
    expect(t.nanCounts).toEqual([1, 1]);
  });

  it("counts non-numeric cells per column and pads short rows", () => {
    const t = mustParse("t,ad_mode,x\n0,ON,1\n1,OFF\n");
    expect(t.nanCounts).toEqual([0, 2, 1]);
    expect(t.cells[1]).toEqual(["ON", "OFF"]);
    expect(t.values[2]).toEqual([1, NaN]);
  });

  it("accepts UTF-8 bytes", () => {
    const t = mustParse(encodeUtf8("t,µ\n1,2\n"));
    expect(t.headers).toEqual(["t", "µ"]);
  });

  it("rejects rows with too many fields, naming the row", () => {
    const e = mustFail("t,x\n1,2\n3,4,5\n");
    expect(e[0]).toMatchObject({ code: "E_CSV_RAGGED", row: 3 });
  });

  it("rejects unterminated quotes, empty files, too many columns and oversized input", () => {
    expect(mustFail('t\n"1\n')[0]?.code).toBe("E_CSV_QUOTE");
    expect(mustFail("# only a comment\n")[0]?.code).toBe("E_CSV_EMPTY");
    const wide = Array.from({ length: 65 }, (_, i) => `c${i}`).join(",");
    expect(mustFail(`${wide}\n`)[0]?.code).toBe("E_CSV_TOO_MANY_COLUMNS");
    expect(mustFail(new Uint8Array(CSV_MAX_BYTES + 1))[0]?.code).toBe("E_CSV_TOO_LARGE");
  });
});

describe("csv: utf8", () => {
  it("round-trips strings", () => {
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), (s) => decodeUtf8(encodeUtf8(s)) === s));
  });
  it("replaces invalid sequences", () => {
    expect(decodeUtf8(Uint8Array.from([0x61, 0xff, 0xc3]))).toBe("a��");
  });
});

describe("csv: properties", () => {
  const delimiter = fc.constantFrom<CsvDelimiter>(...CSV_DELIMITERS);
  const table = fc.integer({ min: 2, max: 6 }).chain((cols) =>
    fc.record({
      headers: fc.constant(Array.from({ length: cols }, (_, i) => `col${i}`)),
      rows: fc.array(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: cols, maxLength: cols }), {
        minLength: 2,
        maxLength: 20,
      }),
    }),
  );

  it("parse(format(x)) keeps numeric values", () => {
    fc.assert(
      fc.property(table, delimiter, ({ headers, rows }, d) => {
        const t = mustParse(formatCsv(headers, rows, d));
        expect(t.delimiter).toBe(d);
        expect(t.headers).toEqual(headers);
        // -0 becomes "0" in String(); compare with Object.is semantics relaxed to ===.
        headers.forEach((_, c) => {
          rows.forEach((r, i) => expect(t.values[c]?.[i] === r[c]).toBe(true));
        });
      }),
      { numRuns: 300 },
    );
  });

  it("delimiter detection is invariant to quoting", () => {
    fc.assert(
      fc.property(table, delimiter, fc.array(fc.boolean(), { minLength: 64, maxLength: 64 }), ({ headers, rows }, d, mask) => {
        const lines = [headers, ...rows.map((r) => r.map(String))];
        let n = 0;
        const quoted = lines.map((l) => l.map((f) => (mask[n++ % 64] ? `"${f}"` : f)).join(d)).join("\n");
        const plain = lines.map((l) => l.map((f) => quoteCsvField(f, d)).join(d)).join("\n");
        expect(detectDelimiter(quoted)).toBe(detectDelimiter(plain));
        expect(detectDelimiter(quoted)).toBe(d);
      }),
      { numRuns: 300 },
    );
  });
});
