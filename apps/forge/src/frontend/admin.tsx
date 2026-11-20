/**
 * UI Kit entry for the `tt-admin` admin page (manifest resource `admin`).
 * SPIKE-M1: `render: native` UI Kit entry shape (ForgeReconciler.render) per @forge/react 12.
 */
import ForgeReconciler, { useProductContext } from "@forge/react";
import { DEFAULT_SEED } from "@tt/seedgen";
import { StrictMode } from "react";
import { callResolver } from "./api";
import { AdminView } from "./admin-view";

export function AdminApp() {
  const ctx = useProductContext();
  if (ctx === undefined) return null; // context still loading
  // "Simulate TWG error" is a staging tool (§11): hidden in production installs.
  const env = (ctx as { environmentType?: unknown }).environmentType;
  return <AdminView call={callResolver} defaultSeed={DEFAULT_SEED} showStagingTools={env !== "PRODUCTION"} />;
}

ForgeReconciler.render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
