/**
 * Intake entry: wires `@forge/bridge`, the Web Worker (SPIKE-C3) and the canvas thumbnail
 * encoder into {@link IntakeApp}.
 */
import "@atlaskit/css-reset";
import "@tt/ui-shared/style";
import { NavigationProvider } from "@tt/ui-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { closeView, enableTheme, forgeClient, forgeNavigator, forgeRequestJira, readTarget } from "../../common/forge.js";
import { IntakeApp } from "./App.js";
import { canvasThumbEncoder } from "./jira.js";
import { createProcessor, type WorkerLike } from "./processor.js";

/** SPIKE-C3: a same-origin module worker from the bundle; null selects the main thread. */
function createWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

async function start(): Promise<void> {
  await enableTheme();
  const target = await readTarget();
  const root = document.getElementById("root");
  if (root === null) return;
  const processor = createProcessor({ createWorker });
  createRoot(root).render(
    <StrictMode>
      <NavigationProvider navigator={forgeNavigator}>
        <IntakeApp deps={{ client: forgeClient(), target, processor, requestJira: forgeRequestJira, encodeThumb: canvasThumbEncoder, close: closeView }} />
      </NavigationProvider>
    </StrictMode>,
  );
}

void start();
