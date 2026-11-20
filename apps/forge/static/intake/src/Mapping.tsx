/**
 * Column mapping step (PRD US-05): canonical channel ← CSV column, unit multiplier, invert flag,
 * brake unit; can be saved per project as a reusable preset.
 */
import Button from "@atlaskit/button/new";
import { CANONICAL_CHANNELS, CHANNEL_SPECS, type CanonicalChannel, type MappingPreset } from "@tt/engine";
import { colors, font, space, tableStyle, tdStyle, thStyle } from "@tt/ui-shared";
import { useState } from "react";
import { Row, TextField } from "../../common/ui.js";
import { mappingStatus } from "./mapping-status.js";

/** A copy of `rec` without `key` (no dynamic `delete`). */
function without<T extends object>(rec: T, key: CanonicalChannel): T {
  return Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key)) as T;
}

export function setColumn(preset: MappingPreset, channel: CanonicalChannel, header: string | null): MappingPreset {
  if (header === null) {
    return { ...preset, columns: without(preset.columns, channel), multipliers: without(preset.multipliers, channel), invert: without(preset.invert, channel) };
  }
  return { ...preset, columns: { ...preset.columns, [channel]: header } };
}

export function setMultiplier(preset: MappingPreset, channel: CanonicalChannel, factor: number): MappingPreset {
  return { ...preset, multipliers: factor === 1 ? without(preset.multipliers, channel) : { ...preset.multipliers, [channel]: factor } };
}

export function setInvert(preset: MappingPreset, channel: CanonicalChannel, on: boolean): MappingPreset {
  return { ...preset, invert: on ? { ...preset.invert, [channel]: true } : without(preset.invert, channel) };
}

export interface MappingEditorProps {
  readonly headers: readonly string[];
  readonly preset: MappingPreset;
  readonly onChange: (preset: MappingPreset) => void;
  readonly onApply: () => void;
  /** Saves the preset (`saveMappingPreset`); absent when there is no project to save to. */
  readonly onSave?: (id: string) => Promise<string | null>;
  readonly reason: string | null;
}

const PRESET_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function MappingEditor({ headers, preset, onChange, onApply, onSave, reason }: MappingEditorProps) {
  const [presetId, setPresetId] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const status = mappingStatus(preset);
  const blocking = status.missingRequired.length > 0;
  const save = async (): Promise<void> => {
    if (onSave === undefined) return;
    if (!PRESET_ID.test(presetId)) {
      setSaveMsg("Use 1 to 40 letters, digits, - or _.");
      return;
    }
    const err = await onSave(presetId);
    setSaveMsg(err ?? `Saved preset “${presetId}” for this project.`);
  };
  return (
    <section data-testid="tt-mapping" aria-labelledby="tt-mapping-h" style={{ margin: `${space.m} 0` }}>
      <h2 id="tt-mapping-h" style={{ font: "var(--ds-font-heading-small, normal 653 16px/20px sans-serif)", margin: `0 0 ${space.xs}` }}>
        Map your columns
      </h2>
      {reason !== null && <p style={{ margin: `0 0 ${space.s}`, color: colors.warningText }}>{reason}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <caption style={{ textAlign: "left", font: font.small, color: colors.subtle, paddingBottom: space.xs }}>Canonical channel ← column in your CSV. Unmapped channels only disable the features that need them.</caption>
          <thead>
            <tr>
              <th scope="col" style={thStyle}>Channel</th>
              <th scope="col" style={thStyle}>CSV column</th>
              <th scope="col" style={thStyle}>Unit conversion</th>
              <th scope="col" style={thStyle}>Options</th>
            </tr>
          </thead>
          <tbody>
            {CANONICAL_CHANNELS.map((ch) => {
              const spec = CHANNEL_SPECS[ch];
              const id = `tt-map-${ch}`;
              const mapped = preset.columns[ch];
              const mult = preset.multipliers[ch] ?? 1;
              return (
                <tr key={ch} data-testid={`tt-map-row-${ch}`}>
                  <th scope="row" style={{ ...tdStyle, textAlign: "left", fontWeight: 400 }}>
                    <label htmlFor={id}>
                      <code>{ch}</code> <span style={{ color: colors.subtlest }}>({spec.unit})</span>
                      {spec.required && <strong> required</strong>}
                    </label>
                  </th>
                  <td style={tdStyle}>
                    <select id={id} value={mapped ?? ""} onChange={(e) => onChange(setColumn(preset, ch, e.target.value === "" ? null : e.target.value))} style={{ font: font.body, minHeight: 28 }}>
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {spec.multipliers.length > 0 && mapped !== undefined ? (
                      <select aria-label={`Unit conversion for ${ch}`} value={String(mult)} onChange={(e) => onChange(setMultiplier(preset, ch, Number(e.target.value)))} style={{ font: font.body, minHeight: 28 }}>
                        <option value="1">as is ({spec.unit})</option>
                        {spec.multipliers.map((m) => (
                          <option key={m.label} value={String(m.factor)}>
                            {m.label}
                          </option>
                        ))}
                        {mult !== 1 && !spec.multipliers.some((m) => m.factor === mult) && <option value={String(mult)}>× {mult}</option>}
                      </select>
                    ) : (
                      <span style={{ color: colors.subtlest }}>–</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {ch === "takeover" && mapped !== undefined && (
                      <label style={{ display: "inline-flex", gap: space.xs, alignItems: "center", font: font.small }}>
                        <input type="checkbox" checked={preset.invert.takeover === true} onChange={(e) => onChange(setInvert(preset, "takeover", e.target.checked))} />
                        inverted (1 = automation active)
                      </label>
                    )}
                    {ch === "brake" && mapped !== undefined && (
                      <select aria-label="Brake unit" value={preset.brakeUnit} onChange={(e) => onChange({ ...preset, brakeUnit: e.target.value === "bar" ? "bar" : "ratio" })} style={{ font: font.body, minHeight: 28 }}>
                        <option value="ratio">pedal 0..1</option>
                        <option value="bar">pressure (bar)</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ font: font.small, color: status.typeDeciding ? colors.subtle : colors.warningText, margin: `${space.xs} 0` }} data-testid="tt-mapping-status">
        {blocking
          ? `Map the required channel${status.missingRequired.length > 1 ? "s" : ""}: ${status.missingRequired.join(", ")}.`
          : status.typeDeciding
            ? `${status.mappedSignals} signal channels mapped.`
            : "None of lane_offset, ttc or brake is mapped, so the takeover type will be “unknown”."}
      </p>
      <Row align="flex-end">
        <Button appearance="primary" onClick={onApply} isDisabled={blocking} testId="tt-mapping-apply">
          Use this mapping
        </Button>
        {onSave !== undefined && (
          <>
            <TextField id="tt-preset-id" label="Save as preset (id)" value={presetId} onChange={(e) => setPresetId(e.target.value)} maxLength={40} />
            <Button onClick={() => void save()} isDisabled={blocking || presetId === ""} testId="tt-preset-save">
              Save preset
            </Button>
          </>
        )}
      </Row>
      {saveMsg !== null && (
        <p role="status" style={{ font: font.small, margin: `${space.xs} 0 0` }}>
          {saveMsg}
        </p>
      )}
    </section>
  );
}
