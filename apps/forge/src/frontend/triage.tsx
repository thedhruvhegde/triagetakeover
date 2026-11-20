/**
 * UI Kit entry for the `tt-triage-now` issue action (manifest resource `triage`).
 * SPIKE-M1: `render: native` UI Kit entry shape (ForgeReconciler.render) per @forge/react 12.
 */
import ForgeReconciler, { useProductContext } from "@forge/react";
import { view } from "@forge/bridge";
import { StrictMode } from "react";
import { callResolver } from "./api";
import { TriageView } from "./triage-view";

function issueKeyOf(ctx: unknown): string | undefined {
  const ext = typeof ctx === "object" && ctx !== null ? (ctx as { extension?: { issue?: { key?: unknown } } }).extension : undefined;
  const key = ext?.issue?.key;
  return typeof key === "string" && /^[A-Z][A-Z0-9_]{1,9}-\d+$/.test(key) ? key : undefined;
}

export function TriageApp() {
  const ctx = useProductContext();
  if (ctx === undefined) return null; // context still loading
  const issueKey = issueKeyOf(ctx);
  return <TriageView call={callResolver} {...(issueKey !== undefined ? { issueKey } : {})} onClose={() => void view.close()} />;
}

ForgeReconciler.render(
  <StrictMode>
    <TriageApp />
  </StrictMode>,
);
