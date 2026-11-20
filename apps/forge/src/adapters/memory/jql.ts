/**
 * A small JQL subset for the in-memory Jira fake. It covers every query the specs use:
 *
 *   project = TTDEMO AND labels = tt-takeover AND ttOccurred >= "2026-11-14" ORDER BY ttOccurred DESC
 *   ttV = 1 AND project in (TTDEMO, ADAS)
 *   labels = tt-scenario            issuetype = Test            labels = tt-synthetic
 *   ttType = lane-loss AND ttVariant = cam-B AND ttBuild in ("4.11.3", "4.12.0")
 *
 * Grammar (keywords case-insensitive):
 *   query   := [or] [ORDER BY item ("," item)*]
 *   or      := and (OR and)*
 *   and     := unary (AND unary)*
 *   unary   := NOT unary | "(" or ")" | clause
 *   clause  := field op value | field [NOT] IN "(" value ("," value)* ")" | field IS [NOT] (EMPTY | NULL)
 *   op      := = | != | > | >= | < | <= | ~ | !~
 *   value   := bare word | "double" or 'single' quoted string
 *   item    := field [ASC | DESC]
 *
 * Semantics follow Jira where it matters for the app:
 * - `!=` and `NOT IN` do not match issues where the field is empty (as in Jira).
 * - `~` is a case-insensitive substring match (Jira uses word stemming; good enough for tests).
 * - Unknown fields are a 400 (`bad-request`), like Jira's "Field 'x' does not exist".
 * - Date values: `yyyy-MM-dd`, `yyyy/MM/dd`, optional ` HH:mm`, full ISO-8601, or relative
 *   `-7d` / `-12h` / `-30m` / `-2w` (relative to the fake clock). Plain dates are read as UTC
 *   (real Jira uses the user's time zone).
 * - No ORDER BY: ascending issue id (deterministic; real Jira's default order is unspecified).
 *   Empty values sort last in both directions.
 */
import { err, ok, type Result } from "@tt/engine";

// ---------------------------------------------------------------- field model

export type JqlFieldType = "text" | "text-ci" | "number" | "date";

export interface JqlFieldDef<I> {
  readonly type: JqlFieldType;
  /** All values of the field on the issue (empty array = EMPTY). Dates in epoch ms. */
  readonly get: (issue: I) => readonly (string | number)[];
  /** Whether `>`/`<` are allowed (always for number/date). */
  readonly ordered?: boolean;
  /** Sort key for ORDER BY when it differs from the value (e.g. issue keys sort by number). */
  readonly sortKey?: (issue: I) => readonly (string | number)[];
}

export type JqlFields<I> = Readonly<Record<string, JqlFieldDef<I>>>;

export interface CompiledJql<I> {
  readonly matches: (issue: I) => boolean;
  readonly compare: (a: I, b: I) => number;
}

export interface JqlCompileOptions<I> {
  /** Field definitions keyed by lower-case field name. */
  readonly fields: JqlFields<I>;
  /** Tie-breaker / default order (ascending). */
  readonly defaultOrder: (a: I, b: I) => number;
  /** "Now" for relative dates, epoch ms. */
  readonly nowMs: number;
}

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { readonly t: "word"; readonly v: string }
  | { readonly t: "str"; readonly v: string }
  | { readonly t: "op"; readonly v: string }
  | { readonly t: "punct"; readonly v: "(" | ")" | "," };

function tokenize(src: string): Result<Tok[], string> {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: "punct", v: c });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j];
        j++;
      }
      if (j >= src.length) return err(`unterminated string at ${i}`);
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "!=" || two === ">=" || two === "<=" || two === "!~") {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (c === "=" || c === ">" || c === "<" || c === "~") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    const m = /^[A-Za-z0-9_.\-:+/@*]+/.exec(src.slice(i));
    if (m === null) return err(`unexpected character '${c}' at ${i}`);
    out.push({ t: "word", v: m[0] });
    i += m[0].length;
  }
  return ok(out);
}

// ---------------------------------------------------------------- parser

type Op = "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "!~";

type Node =
  | { readonly k: "and" | "or"; readonly items: readonly Node[] }
  | { readonly k: "not"; readonly item: Node }
  | { readonly k: "cmp"; readonly field: string; readonly op: Op; readonly value: string }
  | { readonly k: "in"; readonly field: string; readonly negate: boolean; readonly values: readonly string[] }
  | { readonly k: "empty"; readonly field: string; readonly negate: boolean };

interface OrderItem {
  readonly field: string;
  readonly desc: boolean;
}

interface Ast {
  readonly where: Node | null;
  readonly order: readonly OrderItem[];
}

class Parser {
  private i = 0;
  constructor(private readonly toks: readonly Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isKw(kw: string, offset = 0): boolean {
    const t = this.toks[this.i + offset];
    return t !== undefined && t.t === "word" && t.v.toUpperCase() === kw;
  }
  private isPunct(p: string): boolean {
    const t = this.peek();
    return t !== undefined && t.t === "punct" && t.v === p;
  }
  private fail(msg: string): never {
    throw new JqlSyntaxError(msg);
  }

  parse(): Ast {
    let where: Node | null = null;
    if (this.peek() !== undefined && !(this.isKw("ORDER") && this.isKw("BY", 1))) where = this.or();
    const order: OrderItem[] = [];
    if (this.isKw("ORDER")) {
      this.i++;
      if (!this.isKw("BY")) this.fail("expected BY after ORDER");
      this.i++;
      for (;;) {
        const f = this.fieldName();
        let desc = false;
        if (this.isKw("ASC")) this.i++;
        else if (this.isKw("DESC")) {
          desc = true;
          this.i++;
        }
        order.push({ field: f, desc });
        if (this.isPunct(",")) {
          this.i++;
          continue;
        }
        break;
      }
    }
    if (this.peek() !== undefined) this.fail(`unexpected token '${tokText(this.peek())}'`);
    return { where, order };
  }

  private or(): Node {
    const items = [this.and()];
    while (this.isKw("OR")) {
      this.i++;
      items.push(this.and());
    }
    return items.length === 1 ? (items[0] as Node) : { k: "or", items };
  }

  private and(): Node {
    const items = [this.unary()];
    while (this.isKw("AND")) {
      this.i++;
      items.push(this.unary());
    }
    return items.length === 1 ? (items[0] as Node) : { k: "and", items };
  }

  private unary(): Node {
    if (this.isKw("NOT")) {
      this.i++;
      return { k: "not", item: this.unary() };
    }
    if (this.isPunct("(")) {
      this.i++;
      const n = this.or();
      if (!this.isPunct(")")) this.fail("expected )");
      this.i++;
      return n;
    }
    return this.clause();
  }

  private fieldName(): string {
    const t = this.peek();
    if (t === undefined || (t.t !== "word" && t.t !== "str")) this.fail("expected a field name");
    this.i++;
    return t.v.toLowerCase();
  }

  private value(): string {
    const t = this.peek();
    if (t === undefined || (t.t !== "word" && t.t !== "str")) this.fail("expected a value");
    this.i++;
    return t.v;
  }

  private list(): string[] {
    if (!this.isPunct("(")) this.fail("expected ( after IN");
    this.i++;
    const vs = [this.value()];
    while (this.isPunct(",")) {
      this.i++;
      vs.push(this.value());
    }
    if (!this.isPunct(")")) this.fail("expected ) to close the IN list");
    this.i++;
    return vs;
  }

  private clause(): Node {
    const field = this.fieldName();
    if (this.isKw("IN")) {
      this.i++;
      return { k: "in", field, negate: false, values: this.list() };
    }
    if (this.isKw("NOT") && this.isKw("IN", 1)) {
      this.i += 2;
      return { k: "in", field, negate: true, values: this.list() };
    }
    if (this.isKw("IS")) {
      this.i++;
      let negate = false;
      if (this.isKw("NOT")) {
        negate = true;
        this.i++;
      }
      if (!this.isKw("EMPTY") && !this.isKw("NULL")) this.fail("expected EMPTY or NULL after IS");
      this.i++;
      return { k: "empty", field, negate };
    }
    const t = this.peek();
    if (t === undefined || t.t !== "op") this.fail(`expected an operator after '${field}'`);
    this.i++;
    return { k: "cmp", field, op: t.v as Op, value: this.value() };
  }
}

class JqlSyntaxError extends Error {}

function tokText(t: Tok | undefined): string {
  return t === undefined ? "<end>" : t.v;
}

// ---------------------------------------------------------------- values

const DATE_RE = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?(Z|[+-]\d{2}:\d{2})?$/;
const REL_RE = /^([+-]?)(\d+)([wdhm])$/;

/** Parses a JQL / ISO-8601 date value to epoch ms (UTC unless an offset is given). */
export function parseJqlDate(text: string, nowMs: number): number | null {
  const rel = REL_RE.exec(text);
  if (rel !== null) {
    const n = Number(rel[2]);
    const unit = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000 }[rel[3] as "w" | "d" | "h" | "m"];
    return nowMs + (rel[1] === "-" ? -1 : 1) * n * unit;
  }
  const m = DATE_RE.exec(text);
  if (m === null) return null;
  const n = (x: string | undefined): number => (x === undefined ? 0 : Number(x));
  const y = n(m[1]);
  const mo = n(m[2]);
  const d = n(m[3]);
  const h = n(m[4]);
  const mi = n(m[5]);
  const s = n(m[6]);
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0"));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  let t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const tz = m[8];
  if (tz !== undefined && tz !== "Z") {
    const sign = tz.startsWith("-") ? -1 : 1;
    const [oh, om] = tz.slice(1).split(":").map(Number);
    t -= sign * ((oh as number) * 60 + (om as number)) * 60_000;
  }
  return t;
}

type Cmp = (a: string | number) => boolean;

function compileValue<I>(def: JqlFieldDef<I>, field: string, raw: string, nowMs: number): Result<string | number, string> {
  if (def.type === "number") {
    const n = Number(raw);
    return raw.trim() !== "" && Number.isFinite(n) ? ok(n) : err(`'${raw}' is not a valid number for field '${field}'`);
  }
  if (def.type === "date") {
    const t = parseJqlDate(raw, nowMs);
    return t === null ? err(`'${raw}' is not a valid date for field '${field}'`) : ok(t);
  }
  return ok(def.type === "text-ci" ? raw.toLowerCase() : raw);
}

function norm<I>(def: JqlFieldDef<I>, v: string | number): string | number {
  return def.type === "text-ci" && typeof v === "string" ? v.toLowerCase() : v;
}

function compileNode<I>(node: Node, opts: JqlCompileOptions<I>): Result<(issue: I) => boolean, string> {
  switch (node.k) {
    case "and":
    case "or": {
      const parts: ((issue: I) => boolean)[] = [];
      for (const item of node.items) {
        const c = compileNode(item, opts);
        if (!c.ok) return c;
        parts.push(c.value);
      }
      return ok(node.k === "and" ? (x) => parts.every((p) => p(x)) : (x) => parts.some((p) => p(x)));
    }
    case "not": {
      const c = compileNode(node.item, opts);
      return c.ok ? ok((x) => !c.value(x)) : c;
    }
    case "empty": {
      const def = opts.fields[node.field];
      if (def === undefined) return err(`Field '${node.field}' does not exist or you do not have permission to view it.`);
      return ok((x) => (def.get(x).length === 0) !== node.negate);
    }
    case "in": {
      const def = opts.fields[node.field];
      if (def === undefined) return err(`Field '${node.field}' does not exist or you do not have permission to view it.`);
      const vals: (string | number)[] = [];
      for (const raw of node.values) {
        const v = compileValue(def, node.field, raw, opts.nowMs);
        if (!v.ok) return v;
        vals.push(v.value);
      }
      return ok((x) => {
        const have = def.get(x).map((v) => norm(def, v));
        if (have.length === 0) return false;
        const hit = have.some((h) => vals.includes(h));
        return node.negate ? !hit : hit;
      });
    }
    case "cmp": {
      const def = opts.fields[node.field];
      if (def === undefined) return err(`Field '${node.field}' does not exist or you do not have permission to view it.`);
      const ordered = def.type === "number" || def.type === "date" || def.ordered === true;
      if ((node.op === ">" || node.op === ">=" || node.op === "<" || node.op === "<=") && !ordered) {
        return err(`The operator '${node.op}' is not supported by the '${node.field}' field.`);
      }
      if ((node.op === "~" || node.op === "!~") && def.type !== "text" && def.type !== "text-ci") {
        return err(`The operator '${node.op}' is not supported by the '${node.field}' field.`);
      }
      const v = compileValue(def, node.field, node.value, opts.nowMs);
      if (!v.ok) return v;
      const target = v.value;
      let test: Cmp;
      switch (node.op) {
        case "=":
          test = (a) => a === target;
          break;
        case "!=":
          test = (a) => a === target;
          break;
        case ">":
          test = (a) => a > target;
          break;
        case ">=":
          test = (a) => a >= target;
          break;
        case "<":
          test = (a) => a < target;
          break;
        case "<=":
          test = (a) => a <= target;
          break;
        case "~":
        case "!~":
          test = (a) => String(a).toLowerCase().includes(String(target).toLowerCase());
          break;
      }
      const negated = node.op === "!=" || node.op === "!~";
      return ok((x) => {
        const have = def.get(x).map((h) => norm(def, h));
        if (have.length === 0) return false;
        const hit = have.some(test);
        return negated ? !hit : hit;
      });
    }
  }
}

/**
 * Compares two value lists element by element (multi-part sort keys such as
 * `[projectKey, issueNumber]`). Plain fields sort on their first value. Empty sorts last.
 */
function compareValues(a: readonly (string | number)[], b: readonly (string | number)[], desc: boolean, multi: boolean): number {
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : a.length === 0 ? 1 : -1;
  const n = multi ? Math.max(a.length, b.length) : 1;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined || bv === undefined) {
      if (av === bv) continue;
      return av === undefined ? -1 : 1;
    }
    const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
    if (c !== 0) return desc ? -c : c;
  }
  return 0;
}

/** Parses and compiles JQL against a field model. Errors are Jira-like 400 messages. */
export function compileJql<I>(jql: string, opts: JqlCompileOptions<I>): Result<CompiledJql<I>, string> {
  const toks = tokenize(jql);
  if (!toks.ok) return err(`Error in the JQL Query: ${toks.error}`);
  let ast: Ast;
  try {
    ast = new Parser(toks.value).parse();
  } catch (e) {
    if (e instanceof JqlSyntaxError) return err(`Error in the JQL Query: ${e.message}`);
    throw e;
  }
  let matches: (issue: I) => boolean = () => true;
  if (ast.where !== null) {
    const c = compileNode(ast.where, opts);
    if (!c.ok) return c;
    matches = c.value;
  }
  const order: { readonly def: JqlFieldDef<I>; readonly desc: boolean }[] = [];
  for (const item of ast.order) {
    const def = opts.fields[item.field];
    if (def === undefined) return err(`Not able to sort using field '${item.field}'.`);
    order.push({ def, desc: item.desc });
  }
  const compare = (a: I, b: I): number => {
    for (const o of order) {
      const multi = o.def.sortKey !== undefined;
      const key = o.def.sortKey ?? o.def.get;
      const c = compareValues(key(a), key(b), o.desc, multi);
      if (c !== 0) return c;
    }
    return opts.defaultOrder(a, b);
  };
  return ok({ matches, compare });
}
