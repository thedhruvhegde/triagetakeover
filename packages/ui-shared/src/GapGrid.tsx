/**
 * GapGrid: the 2D coverage view, conditions (and ODD tags) x takeover types, each cell showing
 * events against scenario tests (PRD US-17 AC4). Gap cells are marked with text and an icon-like
 * prefix, not only by colour.
 */
import type { TakeoverType } from "@tt/engine";
import { colors, font, space, state, tableStyle, tdStyle, thStyle, visuallyHidden } from "./theme.js";
import type { GapGridLike } from "./types.js";

export interface GapGridProps {
  readonly grid: GapGridLike;
  readonly caption?: string;
  /** Called with the selected cell (click or Enter / Space). */
  readonly onSelect?: (cell: { readonly dimension: "cond" | "odd"; readonly value: string; readonly type: TakeoverType }) => void;
  readonly selected?: { readonly value: string; readonly type: TakeoverType } | null;
}

export function gapCellLabel(type: string, value: string, events: number, tests: number): string {
  const ev = `${events} ${events === 1 ? "event" : "events"}`;
  const ts = `${tests} scenario ${tests === 1 ? "test" : "tests"}`;
  return `${type} x ${value}: ${ev}, ${ts}${events > 0 && tests === 0 ? " (gap)" : ""}`;
}

export function GapGrid({ grid, caption = "Coverage gaps: events vs scenario tests per condition and takeover type", onSelect, selected = null }: GapGridProps) {
  if (grid.rows.length === 0 || grid.columns.length === 0) {
    return (
      <p data-testid="tt-coverage-grid" style={{ font: font.body, color: colors.subtle }}>
        No events yet, so there is nothing to compare against scenario tests.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-testid="tt-coverage-grid" style={{ ...tableStyle, width: "auto" }}>
        <caption style={{ textAlign: "left", font: font.small, color: colors.subtle, paddingBottom: space.xs }}>
          {caption}. Each cell: events / tests.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>
              Condition
            </th>
            {grid.columns.map((c) => (
              <th scope="col" key={c} style={{ ...thStyle, textAlign: "center" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={`${r.dimension}:${r.value}`}>
              <th scope="row" style={{ ...tdStyle, textAlign: "left", fontWeight: 400 }}>
                <span style={{ color: colors.subtlest, font: font.small }}>{r.dimension === "cond" ? "cond" : "odd"}:</span> {r.value}
              </th>
              {grid.columns.map((type) => {
                const cell = r.cells.find((c) => c.type === type);
                const events = cell?.events ?? 0;
                const tests = cell?.tests ?? 0;
                const gap = cell?.gap ?? false;
                const label = gapCellLabel(type, r.value, events, tests);
                const isSelected = selected !== null && selected.value === r.value && selected.type === type;
                const style = {
                  ...tdStyle,
                  textAlign: "center" as const,
                  minWidth: 72,
                  background: gap ? state.gap : events > 0 ? state.coveredTint : "transparent",
                  color: gap ? state.onState : colors.text,
                  fontWeight: gap ? 600 : 400,
                  outline: isSelected ? `2px solid ${colors.focus}` : undefined,
                  cursor: onSelect !== undefined && events > 0 ? "pointer" : undefined,
                };
                const content = (
                  <>
                    <span aria-hidden="true">
                      {gap ? "! " : ""}
                      {events} / {tests}
                    </span>
                    <span style={visuallyHidden}>{label}</span>
                  </>
                );
                return (
                  <td key={type} style={style} title={label} data-testid={`tt-gap-cell-${r.dimension}-${r.value}-${type}`} data-gap={gap ? "true" : "false"}>
                    {onSelect !== undefined && events > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelect({ dimension: r.dimension, value: r.value, type })}
                        aria-pressed={isSelected}
                        style={{ background: "transparent", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "block", width: "100%" }}
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
