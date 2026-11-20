/**
 * DOM stand-ins for the `@forge/react` UI Kit components, so the screens can be rendered with
 * react-dom + Testing Library. Used as `vi.mock("@forge/react", () => import("./ui-kit-mock.js"))`.
 * Only the props the screens use are modelled; the real components are host-rendered by Forge.
 */
import type { ReactNode } from "react";
import { vi } from "vitest";

type P = { readonly children?: ReactNode } & Readonly<Record<string, unknown>>;
type Opt = { readonly label: string; readonly value: string };

const s = (u: unknown): string | undefined => (typeof u === "string" ? u : undefined);
const valueOf = (t: unknown): string => String((t as { value?: unknown }).value ?? "");
const checkedOf = (t: unknown): boolean => (t as { checked?: unknown }).checked === true;
const fn = (u: unknown): ((...args: unknown[]) => void) | undefined => (typeof u === "function" ? (u as (...args: unknown[]) => void) : undefined);

export const Stack = ({ children }: P) => <div>{children}</div>;
export const Inline = ({ children }: P) => <div>{children}</div>;
export const Box = ({ children }: P) => <div>{children}</div>;
export const Heading = ({ children }: P) => <h2>{children}</h2>;
export const Text = ({ children, as }: P) => (as === "strong" ? <strong>{children}</strong> : <p>{children}</p>);
export const Link = ({ children, href }: P) => <a href={s(href)}>{children}</a>;
export const Lozenge = ({ children, appearance }: P) => <span data-lozenge={s(appearance) ?? "default"}>{children}</span>;
export const Spinner = ({ label }: P) => <span data-spinner="">{s(label)}</span>;
export const Label = ({ children, labelFor }: P) => <label htmlFor={s(labelFor)}>{children}</label>;
export const ProgressBar = ({ value, isIndeterminate, ariaLabel }: P) => (
  <progress aria-label={s(ariaLabel)} data-indeterminate={isIndeterminate === true ? "yes" : "no"} {...(typeof value === "number" ? { value } : {})} />
);

export const Button = ({ children, onClick, isDisabled, appearance }: P) => (
  <button type="button" data-appearance={s(appearance) ?? "default"} disabled={isDisabled === true} onClick={() => fn(onClick)?.()}>
    {children}
  </button>
);

export const SectionMessage = ({ children, title, appearance }: P) => (
  <section aria-label={s(title) ?? s(appearance) ?? "message"} data-appearance={s(appearance) ?? "information"}>
    {s(title) !== undefined && <h3>{s(title)}</h3>}
    {children}
  </section>
);

export const Textfield = ({ id, value, onChange }: P) => <input id={s(id)} value={s(value) ?? ""} onChange={(e) => fn(onChange)?.({ target: { value: valueOf(e.target) } })} />;

export const Toggle = ({ id, label, isChecked, onChange }: P) => (
  <label>
    <input id={s(id)} type="checkbox" checked={isChecked === true} onChange={(e) => fn(onChange)?.({ target: { checked: checkedOf(e.target) } })} />
    {s(label)}
  </label>
);

export const Select = ({ id, options, value, onChange }: P) => {
  const opts = (Array.isArray(options) ? options : []) as Opt[];
  const current = typeof value === "object" && value !== null ? valueOf(value) : "";
  return (
    <select id={s(id)} value={current} onChange={(e) => fn(onChange)?.(opts.find((o) => o.value === valueOf(e.target)) ?? null)}>
      {!opts.some((o) => o.value === current) && <option value={current}>{current}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

type Cell = { readonly key: string; readonly content: ReactNode };
export const DynamicTable = ({ caption, head, rows }: P) => {
  const h = (head as { cells: readonly Cell[] } | undefined)?.cells ?? [];
  const r = (rows as readonly { key: string; cells: readonly Cell[] }[] | undefined) ?? [];
  return (
    <table>
      <caption>{s(caption)}</caption>
      <thead>
        <tr>
          {h.map((c) => (
            <th key={c.key}>{c.content}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.map((row) => (
          <tr key={row.key}>
            {row.cells.map((c) => (
              <td key={c.key}>{c.content}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const productContext: { value: unknown } = { value: { extension: { issue: { key: "TTDEMO-12" } }, environmentType: "PRODUCTION" } };
export const useProductContext = () => productContext.value;

const ForgeReconciler = { render: vi.fn() };
export default ForgeReconciler;
