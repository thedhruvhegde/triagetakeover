/**
 * Undo records (KVS `undo:<issueKey>`, a short stack, newest last). This key is an addition to
 * the §7.4 key list (recorded deviation): `tt.triage.history` cannot hold the link id or the
 * previous component list that a faithful undo needs.
 */
import { isRecord } from "@tt/engine";
import type { StoragePort } from "../ports/storage";

export const UNDO_STACK_MAX = 10;
export const UNDO_TTL_SECONDS = 30 * 24 * 3600;
export const undoKey = (issueKey: string): string => `undo:${issueKey}`;

export type UndoRecord =
  | { readonly action: "accept" | "split"; readonly by: string; readonly at: string; readonly eventId: string; readonly eventKey: string; readonly clusterId: string; readonly clusterKey: string; readonly linkId: string; readonly createdCluster: boolean; readonly summary: string }
  | { readonly action: "route"; readonly by: string; readonly at: string; readonly clusterId: string; readonly clusterKey: string; readonly prevComponentIds: readonly string[]; readonly fieldId?: string; readonly prevFieldValue?: unknown; readonly summary: string };

export async function readUndoStack(storage: StoragePort, issueKey: string): Promise<UndoRecord[]> {
  const r = await storage.get(undoKey(issueKey));
  if (!r.ok || !isRecord(r.value) || !Array.isArray(r.value["stack"])) return [];
  return (r.value["stack"] as unknown[]).filter((x): x is UndoRecord => isRecord(x) && (x["action"] === "accept" || x["action"] === "split" || x["action"] === "route"));
}

export async function pushUndo(storage: StoragePort, issueKey: string, rec: UndoRecord): Promise<void> {
  const stack = [...(await readUndoStack(storage, issueKey)), rec].slice(-UNDO_STACK_MAX);
  await storage.set(undoKey(issueKey), { v: 1, stack }, { ttlSeconds: UNDO_TTL_SECONDS });
}

export async function popUndo(storage: StoragePort, issueKey: string): Promise<void> {
  const stack = (await readUndoStack(storage, issueKey)).slice(0, -1);
  if (stack.length === 0) await storage.delete(undoKey(issueKey));
  else await storage.set(undoKey(issueKey), { v: 1, stack }, { ttlSeconds: UNDO_TTL_SECONDS });
}

