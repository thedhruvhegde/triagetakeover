/**
 * Browser dev harness (`pnpm --filter @tt/static-<app> dev`, then open /dev.html): renders an app
 * with a mocked bridge and TEST fixtures, outside Jira. Never part of a production build
 * (Vite builds `index.html` only).
 */
import "@atlaskit/css-reset";
import "@tt/ui-shared/style";
import { NavigationProvider, Notice, type Navigator } from "@tt/ui-shared";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const devNavigator: Navigator = {
  open: async (url) => console.info("[dev] router.open", url),
  navigate: async (url) => console.info("[dev] router.navigate", url),
};

export function mountDev(children: ReactNode): void {
  const root = document.getElementById("root");
  if (root === null) return;
  createRoot(root).render(
    <StrictMode>
      <Notice appearance="discovery" title="DEV HARNESS">
        <p style={{ margin: 0 }}>Mocked bridge and TEST fixtures (not demo data, not a Jira site).</p>
      </Notice>
      <NavigationProvider navigator={devNavigator}>{children}</NavigationProvider>
    </StrictMode>,
  );
}
