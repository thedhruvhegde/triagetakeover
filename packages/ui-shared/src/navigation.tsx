/**
 * Navigation out of the Custom UI iframe. The sandbox has no `allow-popups` (ARCHITECTURE §14),
 * so links never use `window.open` or `target=_blank`: the app provides `@forge/bridge`
 * `router.open` / `router.navigate` through this context.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface Navigator {
  /** Opens a site-relative URL (e.g. `/browse/TTDEMO-12`) in a new tab via the Forge router. */
  readonly open: (url: string) => Promise<void>;
  /** Navigates the host page (same tab). */
  readonly navigate: (url: string) => Promise<void>;
}

const noop = async (): Promise<void> => undefined;
const NavigationContext = createContext<Navigator>({ open: noop, navigate: noop });

export function NavigationProvider({ navigator, children }: { readonly navigator: Navigator; readonly children: ReactNode }) {
  return <NavigationContext.Provider value={navigator}>{children}</NavigationContext.Provider>;
}

export function useNavigator(): Navigator {
  return useContext(NavigationContext);
}
