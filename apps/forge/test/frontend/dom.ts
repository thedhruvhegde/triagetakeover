/**
 * Minimal typed access to DOM nodes returned by Testing Library. The app's tsconfig has no
 * `dom` lib (server code must not see browser globals), so tests read nodes through these.
 */
interface NodeLike {
  getAttribute(name: string): string | null;
  readonly textContent: string | null;
  readonly value?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
}

const node = (el: unknown): NodeLike => el as NodeLike;
export const attr = (el: unknown, name: string): string | null => node(el).getAttribute(name);
export const text = (el: unknown): string => node(el).textContent ?? "";
export const isDisabled = (el: unknown): boolean => node(el).disabled === true;
