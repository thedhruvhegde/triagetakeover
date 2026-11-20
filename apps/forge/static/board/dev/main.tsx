import { mountDev } from "../../common/dev-harness.js";
import { fakeClient } from "../../common/testing.js";
import { BoardApp } from "../src/App.js";
import { boardView, idleResync } from "../test/fixtures.js";

let polls = 0;
const client = fakeClient({
  getBoard: () => boardView(),
  markTriaged: () => ({ at: "2026-11-20T09:00:00Z", by: "dev-user" }),
  requestResync: () => ({ ...idleResync, state: "pending" }),
  getResyncStatus: () => (++polls % 3 === 0 ? { ...idleResync, state: "done", counts: { events: 18 } } : { ...idleResync, state: "running", phase: "indexing", counts: { events: polls * 6 } }),
});

mountDev(<BoardApp deps={{ client, projectKey: "TEST", openIntake: async () => "unavailable" }} />);
