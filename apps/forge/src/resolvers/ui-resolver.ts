/**
 * `ui-resolver` function (manifest `function: ui-resolver`): registers every contract method
 * with `@forge/resolver`. Each definition is a one-liner into {@link dispatchUi}, which
 * validates, builds the service context with the real adapters and maps errors.
 */
import Resolver from "@forge/resolver";
import { UI_METHODS } from "../contract/ui-api";
import { createForgeContext, type ServiceContextFactory } from "../context";
import { dispatchUi } from "./ui-handlers";

/** Builds the resolver definitions for a context factory (production: the Forge adapters). */
export function buildUiResolver(factory: ServiceContextFactory): ReturnType<Resolver["getDefinitions"]> {
  const resolver = new Resolver();
  for (const method of UI_METHODS) {
    resolver.define(method, async (req) => dispatchUi(method, req.payload, req.context, factory));
  }
  return resolver.getDefinitions();
}

export const uiResolver = buildUiResolver(createForgeContext());
