/**
 * The only module that imports `@forge/bridge`. Tests and the jsdom dev harness never load it:
 * they hand the apps fakes of the same small interfaces.
 */
import { Modal, invoke, requestJira, router, view } from "@forge/bridge";
import { createUiClient, type Navigator } from "@tt/ui-shared";
import type { UiApi } from "../../src/contract/ui-api.js";
import type { TtClient } from "./api.js";
import { readViewTarget, type IntakeModalContext, type ViewTarget } from "./context.js";

export function forgeClient(): TtClient {
  return createUiClient<UiApi>((method, payload) => invoke(method, payload as Parameters<typeof invoke>[1]));
}

export const forgeNavigator: Navigator = {
  open: async (url) => {
    await router.open(url);
  },
  navigate: async (url) => {
    await router.navigate(url);
  },
};

/** Applies the host's light/dark theme to the design tokens. Never fatal. */
export async function enableTheme(): Promise<void> {
  try {
    await view.theme.enable();
  } catch {
    // Older hosts: the light fallback values in ui-shared/theme.ts apply.
  }
}

export async function readTarget(): Promise<ViewTarget> {
  try {
    return readViewTarget(await view.getContext());
  } catch {
    return { inModal: false };
  }
}

/**
 * Opens the intake resource in a bridge Modal (SPIKE-C2: `Modal` opening a DIFFERENT Custom UI
 * resource is documented, sizes up to xlarge). Resolves when the modal closes.
 * Fallback if it fails: the caller says so and points to the issue action "Add telemetry".
 */
export function openIntakeModal(ctx: IntakeModalContext): Promise<"closed" | "unavailable"> {
  return new Promise((resolve) => {
    try {
      const modal = new Modal({
        resource: "intake",
        size: "xlarge",
        title: ctx.mode === "create" ? "File a takeover" : "Add telemetry",
        context: ctx,
        closeOnEscape: true,
        onClose: () => resolve("closed"),
      });
      modal.open().catch(() => resolve("unavailable"));
    } catch {
      resolve("unavailable");
    }
  });
}

/** Jira REST as the current user (`requestJira`, product fetch through the bridge). */
export const forgeRequestJira = (path: string, init?: RequestInit): Promise<Response> => requestJira(path, init as Parameters<typeof requestJira>[1]);

export async function closeView(payload?: unknown): Promise<void> {
  try {
    await view.close(payload);
  } catch {
    // Not in a modal (e.g. opened as an issue action page): nothing to close.
  }
}
