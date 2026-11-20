# static/common

Source shared by the three Custom UI apps (board, panel, intake). A workspace package only so its imports resolve (it has its own node_modules), but never built on its own:
each app imports these files by relative path and Vite bundles them into that app.

- `api.ts`: the typed `UiClient<UiApi>` alias (types from `src/contract/ui-api.ts`).
- `forge.ts`: the only place that touches `@forge/bridge` (invoke, router, Modal, view, requestJira).
- `context.ts`: defensive readers for the Forge view context (project key, issue key, modal context).
