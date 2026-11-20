/**
 * Board entry: wires the real `@forge/bridge` into {@link BoardApp}.
 */
import "@atlaskit/css-reset";
import "@tt/ui-shared/style";
import { NavigationProvider } from "@tt/ui-shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableTheme, forgeClient, forgeNavigator, openIntakeModal, readTarget } from "../../common/forge.js";
import { BoardApp } from "./App.js";

async function start(): Promise<void> {
  await enableTheme();
  const target = await readTarget();
  const root = document.getElementById("root");
  if (root === null) return;
  createRoot(root).render(
    <StrictMode>
      <NavigationProvider navigator={forgeNavigator}>
        <BoardApp deps={{ client: forgeClient(), projectKey: target.projectKey, openIntake: (projectKey) => openIntakeModal({ mode: "create", projectKey }) }} />
      </NavigationProvider>
    </StrictMode>,
  );
}

void start();
