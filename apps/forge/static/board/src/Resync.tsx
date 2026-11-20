/**
 * "Re-sync now" (PRD US-02 AC4): enqueues the index rebuild and shows its progress by polling
 * `getResyncStatus` until it is done or failed. There is no background trigger (cut 2026-11-19).
 */
import Button from "@atlaskit/button/new";
import { colors, font, formatInstant, space } from "@tt/ui-shared";
import { useEffect, useRef, useState } from "react";
import type { ResyncStatus, TtClient } from "../../common/api.js";

export function isActive(s: ResyncStatus | null): boolean {
  return s !== null && (s.state === "pending" || s.state === "running");
}

export function resyncText(s: ResyncStatus): string {
  const counts = Object.entries(s.counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  switch (s.state) {
    case "idle":
      return "Index not rebuilt recently.";
    case "pending":
      return `Re-sync queued${s.requestedAt !== undefined ? ` at ${formatInstant(s.requestedAt)}` : ""}.`;
    case "running":
      return `Re-sync running${s.phase !== undefined ? `: ${s.phase}` : ""}${counts !== "" ? ` (${counts})` : ""}.`;
    case "done":
      return `Re-sync finished${s.finishedAt !== undefined ? ` at ${formatInstant(s.finishedAt)}` : ""}${counts !== "" ? ` (${counts})` : ""}.`;
    case "failed":
      return `Re-sync failed${s.message !== undefined ? `: ${s.message}` : "."}`;
  }
}

export interface ResyncControlProps {
  readonly client: TtClient;
  readonly projectKey: string;
  readonly initial: ResyncStatus | null;
  readonly pollMs: number;
  readonly onDone: () => void;
  readonly onMessage: (text: string, tone: "success" | "error" | "info") => void;
}

export function ResyncControl({ client, projectKey, initial, pollMs, onDone, onMessage }: ResyncControlProps) {
  const [status, setStatus] = useState<ResyncStatus | null>(initial);
  const [requesting, setRequesting] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Adopt the board's status when it changes (e.g. after a reload), unless we are polling.
  useEffect(() => {
    setStatus((cur) => (isActive(cur) ? cur : initial));
  }, [initial]);

  const active = isActive(status);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void client.call("getResyncStatus", { projectKey }).then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          onMessageRef.current(r.error.message, "error");
          setStatus(null);
          return;
        }
        setStatus(r.data);
        if (r.data.state === "done") {
          onMessageRef.current(resyncText(r.data), "success");
          onDoneRef.current();
        } else if (r.data.state === "failed") onMessageRef.current(resyncText(r.data), "error");
      });
    }, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, status, client, projectKey, pollMs]);

  const request = async (): Promise<void> => {
    setRequesting(true);
    const r = await client.call("requestResync", { projectKey });
    setRequesting(false);
    if (!r.ok) {
      onMessageRef.current(r.error.message, "error");
      return;
    }
    setStatus(r.data);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.s, flexWrap: "wrap" }}>
      <Button onClick={() => void request()} isDisabled={requesting || active} testId="tt-resync">
        {active ? "Re-syncing…" : "Re-sync now"}
      </Button>
      <span role="status" aria-live="polite" data-testid="tt-resync-status" data-state={status?.state ?? "unknown"} style={{ font: font.small, color: colors.subtle, maxWidth: 320 }}>
        {status !== null && (active || status.state === "failed") ? resyncText(status) : ""}
      </span>
    </span>
  );
}
