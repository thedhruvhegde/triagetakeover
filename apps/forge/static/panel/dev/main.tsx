import { mountDev } from "../../common/dev-harness.js";
import { fakeClient } from "../../common/testing.js";
import { PanelApp } from "../src/App.js";
import { actionResult, eventView } from "../test/fixtures.js";

const client = fakeClient({
  getPanel: () => eventView(),
  acceptMatch: () => actionResult(),
  splitEvent: () => actionResult({ action: "split", summary: "Created cluster TEST-60", proposedMembers: ["TEST-61"] }),
  undoLast: () => actionResult({ action: "undo", summary: "Removed link TEST-7 → TEST-5" }),
});

mountDev(<PanelApp deps={{ client, issueKey: "TEST-7", projectKey: "TEST", openAddTelemetry: async () => "unavailable" }} />);
