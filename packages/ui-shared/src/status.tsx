/**
 * Loading, error and live-status helpers shared by the three apps.
 */
import Button from "@atlaskit/button/new";
import Spinner from "@atlaskit/spinner";
import type { ReactNode } from "react";
import type { ClientError } from "./client.js";
import { colors, font, radius, space, state } from "./theme.js";

export function Loading({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="tt-loading" style={{ display: "flex", gap: space.s, alignItems: "center", padding: space.m, font: font.body, color: colors.subtle }}>
      <Spinner size="medium" label={label} />
      <span>{label}</span>
    </div>
  );
}

export type NoticeAppearance = "information" | "warning" | "error" | "success" | "discovery";

const NOTICE_TONE: Readonly<Record<NoticeAppearance, { readonly bg: string; readonly fg: string; readonly icon: string; readonly name: string }>> = {
  information: { bg: state.surface, fg: colors.text, icon: "i", name: "Information" },
  warning: { bg: state.inconclusiveTint, fg: colors.text, icon: "!", name: "Warning" },
  error: { bg: state.regressTint, fg: colors.text, icon: "×", name: "Error" },
  success: { bg: state.coveredTint, fg: colors.text, icon: "✓", name: "Success" },
  discovery: { bg: state.novelTint, fg: colors.text, icon: "★", name: "Note" },
};

/**
 * A section message styled with design tokens. (Atlaskit's SectionMessage pulls in Button's
 * icon-button + Tooltip + top-layer code, about 450 KB of source, so the apps use this instead.)
 * The icon is text with an accessible name, so the meaning is not carried by colour alone.
 */
export function Notice({ appearance = "information", title, children, testId }: { readonly appearance?: NoticeAppearance; readonly title?: string; readonly children?: ReactNode; readonly testId?: string }) {
  const tone = NOTICE_TONE[appearance];
  return (
    <section
      data-testid={testId}
      data-appearance={appearance}
      aria-label={title ?? tone.name}
      style={{ display: "flex", gap: space.s, background: tone.bg, borderRadius: radius.m, padding: `${space.s} ${space.m}`, margin: `${space.s} 0`, font: font.body, color: colors.text }}
    >
      <span aria-hidden="true" style={{ fontWeight: 700, color: tone.fg, minWidth: 16, textAlign: "center" }}>
        {tone.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title !== undefined && <h3 style={{ font: "var(--ds-font-heading-xsmall, normal 653 14px/16px sans-serif)", margin: `0 0 ${space.xs}`, color: colors.text }}>{title}</h3>}
        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>{children}</div>
      </div>
    </section>
  );
}

/** Plain-language API error with an optional retry (retry is offered only when it can help). */
export function ApiErrorMessage({ error, onRetry, title = "Something went wrong" }: { readonly error: ClientError; readonly onRetry?: () => void; readonly title?: string }) {
  const appearance = error.code === "forbidden-or-not-found" || error.code === "not-configured" ? "warning" : "error";
  return (
    <div data-testid="tt-error" data-code={error.code}>
      <Notice appearance={appearance} title={title}>
        <p style={{ margin: 0 }}>{error.message}</p>
        {error.details !== undefined && error.details.length > 0 && (
          <ul>
            {error.details.map((d, i) => (
              <li key={`${i}-${d.path ?? ""}`}>
                {d.path !== undefined && d.path !== "" && <code>{d.path}: </code>}
                {d.message}
              </li>
            ))}
          </ul>
        )}
        {onRetry !== undefined && error.retryable && (
          <p>
            <Button onClick={onRetry} testId="tt-retry">
              Try again
            </Button>
          </p>
        )}
      </Notice>
    </div>
  );
}

/** Backend warnings (envelope `warnings[]`). */
export function Warnings({ warnings }: { readonly warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div data-testid="tt-warnings">
      <Notice appearance="warning" title="Warnings">
        <ul style={{ margin: 0, paddingLeft: space.m }}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </Notice>
    </div>
  );
}

/**
 * A polite live region for the result of an action ("Linked TTDEMO-7 → TTDEMO-3"), so the
 * outcome is announced as well as shown (PRD US-19 AC3).
 */
export function StatusToast({ message, tone = "success", children }: { readonly message: string | null; readonly tone?: "success" | "error" | "info"; readonly children?: ReactNode }) {
  const bg = tone === "success" ? colors.success : tone === "error" ? colors.danger : colors.information;
  const fg = tone === "success" ? colors.successText : tone === "error" ? colors.dangerText : colors.text;
  return (
    <div role="status" aria-live="polite" data-testid="tt-toast" style={{ minHeight: 0 }}>
      {message !== null && (
        <div style={{ background: bg, color: fg, padding: `${space.s} ${space.m}`, borderRadius: radius.m, font: font.body, margin: `${space.s} 0`, display: "flex", gap: space.m, alignItems: "center", flexWrap: "wrap" }}>
          <span>{message}</span>
          {children}
        </div>
      )}
    </div>
  );
}

/** A titled section with a heading level the caller chooses (keeps the outline correct). */
export function Section({ title, level = 2, testId, children, actions }: { readonly title: string; readonly level?: 2 | 3; readonly testId?: string; readonly children: ReactNode; readonly actions?: ReactNode }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section data-testid={testId} style={{ margin: `${space.l} 0 0` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.m, flexWrap: "wrap", marginBottom: space.s }}>
        <H style={{ font: level === 2 ? "var(--ds-font-heading-small, normal 653 16px/20px sans-serif)" : "var(--ds-font-heading-xsmall, normal 653 14px/16px sans-serif)", color: colors.text, margin: 0 }}>{title}</H>
        {actions}
      </div>
      {children}
    </section>
  );
}
