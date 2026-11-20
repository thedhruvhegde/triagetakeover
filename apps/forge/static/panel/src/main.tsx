/**
 * Panel entry: wires the real `@forge/bridge` into {@link PanelApp}.
 */
import "@atlaskit/css-reset";
import "@tt/ui-shared/style";
import { NavigationProvider } from "@tt/ui-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableTheme, forgeClient, forgeNavigator, openIntakeModal, readTarget } from "../../common/forge.js";
import { PanelApp } from "./App.js";

async function start(): Promise<void> {
  await enableTheme();
  const target = await readTarget();
  const root = document.getElementById("root");
  if (root === null) return;
  createRoot(root).render(
    <StrictMode>
      <NavigationProvider navigator={forgeNavigator}>
        <PanelApp
          deps={{
            client: forgeClient(),
            issueKey: target.issueKey,
            ...(target.projectKey !== undefined ? { projectKey: target.projectKey } : {}),
            openAddTelemetry: (issueKey, projectKey) => openIntakeModal({ mode: "attach", issueKey, ...(projectKey !== undefined ? { projectKey } : {}) }),
          }}
        />
      </NavigationProvider>
    </StrictMode>,
  );
}

void start();
