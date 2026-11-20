/**
 * Plain text ⇄ Atlassian Document Format (ADF), the body format of Jira Cloud REST v3
 * descriptions and comments. The JiraPort speaks plain text; this adapter converts.
 *
 * - Each line becomes a paragraph. `[~accountid:<id>]` (the services' mention notation,
 *   services/route.ts) becomes an ADF `mention` node, so Jira notifies the person.
 * - Reading flattens block nodes to lines, keeps mentions in the same notation, and drops
 *   marks. Unknown nodes contribute their text content.
 */

export interface AdfNode {
  readonly type: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly AdfNode[];
}

export interface AdfDoc {
  readonly type: "doc";
  readonly version: 1;
  readonly content: readonly AdfNode[];
}

const MENTION = /\[~accountid:([A-Za-z0-9:_-]{1,128})\]/g;

function inline(line: string): AdfNode[] {
  const out: AdfNode[] = [];
  let last = 0;
  for (const m of line.matchAll(MENTION)) {
    const at = m.index;
    if (at > last) out.push({ type: "text", text: line.slice(last, at) });
    out.push({ type: "mention", attrs: { id: m[1] as string } });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

/** Plain text → ADF doc (one paragraph per line; empty lines become empty paragraphs). */
export function textToAdf(text: string): AdfDoc {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", version: 1, content: lines.map((l) => ({ type: "paragraph", content: inline(l) })) };
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "rule", "panel", "tableRow", "mediaSingle", "mediaGroup"]);

/** ADF (or anything) → plain text. Non-ADF strings pass through. */
export function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  const lines: string[] = [];
  let cur = "";
  const flush = (): void => {
    lines.push(cur);
    cur = "";
  };
  const walk = (n: unknown): void => {
    if (typeof n !== "object" || n === null) return;
    const r = n as Record<string, unknown>;
    const type = typeof r["type"] === "string" ? r["type"] : "";
    if (type === "text" && typeof r["text"] === "string") {
      cur += r["text"];
      return;
    }
    if (type === "hardBreak") {
      flush();
      return;
    }
    if (type === "mention") {
      const attrs = (typeof r["attrs"] === "object" && r["attrs"] !== null ? r["attrs"] : {}) as Record<string, unknown>;
      cur += typeof attrs["id"] === "string" ? `[~accountid:${attrs["id"]}]` : typeof attrs["text"] === "string" ? attrs["text"] : "";
      return;
    }
    if (Array.isArray(r["content"])) for (const c of r["content"]) walk(c);
    if (BLOCKS.has(type) && (cur !== "" || type === "paragraph")) flush();
  };
  walk(node);
  if (cur !== "") flush();
  return lines.join("\n").replace(/\n+$/, "");
}
