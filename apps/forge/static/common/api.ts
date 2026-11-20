/**
 * The typed resolver client every Custom UI app uses. Types only from the contract (no server
 * code is bundled: `import type` is erased).
 */
import type { UiApi } from "../../src/contract/ui-api.js";
import type { CallResult, UiClient } from "@tt/ui-shared";

export type TtClient = UiClient<UiApi>;
export type TtResult<M extends keyof UiApi> = CallResult<UiApi[M]["res"]>;
export type * from "../../src/contract/ui-api.js";
