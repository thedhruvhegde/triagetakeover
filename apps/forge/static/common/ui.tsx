/**
 * Small app-level helpers shared by board, panel and intake: the root frame, the async-call
 * state hook and a native text field / select styled with tokens (no extra Atlaskit packages,
 * to stay inside the per-resource bundle budget).
 *
 * SPIKE-C1: everything here (and in ui-shared) styles with React `style` attributes, which needs
 * the manifest's `permissions.content.styles: unsafe-inline` (declared). Fallback per §17: move
 * these styles into a bundled CSS file.
 */
import { colors, font, space, type CallResult, type ClientError } from "@tt/ui-shared";
import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function AppFrame({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <main aria-label={label} style={{ font: font.body, color: colors.text, background: colors.surface, padding: space.m, minHeight: "100%", boxSizing: "border-box" }}>
      {children}
    </main>
  );
}

export type Loadable<T> =
  | { readonly state: "loading" }
  | { readonly state: "error"; readonly error: ClientError }
  | { readonly state: "ready"; readonly data: T; readonly warnings: readonly string[] };

/**
 * Runs `load` on mount and whenever `reload()` is called. Keeps the last data while reloading
 * (no flicker), and ignores results that arrive after unmount or a newer reload.
 */
export function useLoadable<T>(load: () => Promise<CallResult<T>>): { readonly value: Loadable<T>; readonly reload: () => void; readonly reloading: boolean } {
  const [value, setValue] = useState<Loadable<T>>({ state: "loading" });
  const [reloading, setReloading] = useState(false);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useCallback(() => {
    const mine = ++seq.current;
    setReloading(true);
    void loadRef.current().then((r) => {
      if (mine !== seq.current) return;
      setReloading(false);
      setValue(r.ok ? { state: "ready", data: r.data, warnings: r.warnings } : { state: "error", error: r.error });
    });
  }, []);
  useEffect(() => {
    run();
    return () => {
      seq.current++;
    };
  }, [run]);
  return { value, reload: run, reloading };
}

const fieldStyle = {
  font: font.body,
  color: colors.text,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 3,
  padding: `${space.xs} ${space.s}`,
  minHeight: 32,
  boxSizing: "border-box" as const,
};

export function TextField({ label, id, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { readonly label: string; readonly id: string; readonly hint?: string; readonly error?: string | null }) {
  const describedBy = [hint !== undefined ? `${id}-hint` : null, error !== undefined && error !== null ? `${id}-err` : null].filter((x) => x !== null).join(" ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 160 }}>
      <label htmlFor={id} style={{ font: font.small, fontWeight: 600, color: colors.subtle }}>
        {label}
        {rest.required === true && <span aria-hidden="true"> *</span>}
      </label>
      <input id={id} {...rest} aria-invalid={error !== undefined && error !== null ? true : undefined} aria-describedby={describedBy === "" ? undefined : describedBy} style={{ ...fieldStyle, ...(rest.style ?? {}) }} />
      {hint !== undefined && (
        <span id={`${id}-hint`} style={{ font: font.small, color: colors.subtlest }}>
          {hint}
        </span>
      )}
      {error !== undefined && error !== null && (
        <span id={`${id}-err`} style={{ font: font.small, color: colors.dangerText }}>
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({ label, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { readonly label: string; readonly id: string; readonly children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label htmlFor={id} style={{ font: font.small, fontWeight: 600, color: colors.subtle }}>
        {label}
      </label>
      <select id={id} {...rest} style={{ ...fieldStyle, ...(rest.style ?? {}) }}>
        {children}
      </select>
    </div>
  );
}

/** A horizontal, wrapping row with token spacing. */
export function Row({ children, gap = space.s, align = "center" }: { readonly children: ReactNode; readonly gap?: string; readonly align?: "center" | "flex-start" | "flex-end" | "baseline" }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap, alignItems: align }}>{children}</div>;
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <span style={{ color: colors.subtle, font: font.small }}>{children}</span>;
}

/** Visually grouped card. */
export function Card({ children, testId, tone = "default" }: { readonly children: ReactNode; readonly testId?: string; readonly tone?: "default" | "sunken" }) {
  return (
    <div data-testid={testId} style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: space.m, background: tone === "sunken" ? colors.sunken : colors.surfaceRaised, margin: `${space.s} 0` }}>
      {children}
    </div>
  );
}
