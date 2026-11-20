/**
 * SignalPlot: the 201-sample, 10 Hz telemetry window as stacked SVG strips (one per channel)
 * on a shared time axis, with the takeover marker at t = 0. Pure SVG, no chart library.
 *
 * Accessibility: the SVG is `role="img"` with a title and a text description of every channel
 * (min / max / value at takeover), so the plot is not visual-only.
 */
import { useId } from "react";
import {
  channelDomain,
  channelMeta,
  describeChannel,
  displayChannels,
  linePath,
  timeRange,
  timeTicks,
  xScale,
  yScale,
  type Domain,
  type Frame,
} from "./plot-math.js";
import { colors, font, SERIES_DASH } from "./theme.js";
import type { SeriesLike } from "./types.js";

export interface PlotLayer {
  readonly label: string;
  readonly series: SeriesLike;
}

export interface StripPlotProps {
  /** The first layer is the event; further layers are drawn on the same axes (overlay). */
  readonly layers: readonly PlotLayer[];
  readonly channels: readonly string[];
  readonly title: string;
  readonly width?: number;
  readonly stripHeight?: number;
  /** Fixed y domains per channel, e.g. shared across side-by-side plots. */
  readonly domains?: Readonly<Record<string, Domain>>;
  readonly testId?: string;
  /** Draw the legend (overlay plots). */
  readonly legend?: boolean;
}

const LEFT = 112;
const RIGHT = 12;
const AXIS = 22;

/** Shared renderer of {@link SignalPlot} and {@link OverlayPlot}. */
export function StripPlot({ layers, channels, title, width = 640, stripHeight = 56, domains, testId, legend = false }: StripPlotProps) {
  const id = useId();
  const first = layers[0];
  if (first === undefined || channels.length === 0) {
    return (
      <p data-testid={testId} style={{ font: font.body, color: colors.subtle }}>
        No plottable channels in this telemetry window.
      </p>
    );
  }
  const [tMin, tMax] = timeRange(first.series);
  const legendH = legend ? 20 : 0;
  const height = legendH + channels.length * stripHeight + AXIS;
  const x = xScale(tMin, tMax, { x0: LEFT, x1: width - RIGHT, y0: 0, y1: 0 });
  const description = layers.map((l) => `${l.label}. ${channels.map((c) => describeChannel(l.series, c)).join(" ")}`).join(" ");
  const ticks = timeTicks(tMin, tMax);
  const plotBottom = legendH + channels.length * stripHeight;
  return (
    <svg
      data-testid={testId}
      role="img"
      aria-labelledby={`${id}-t ${id}-d`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, display: "block", font: font.small, color: colors.text }}
    >
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{description}</desc>
      {legend &&
        layers.map((l, i) => (
          <g key={`lg-${l.series.key}-${i}`} transform={`translate(${LEFT + i * 150}, 4)`}>
            <line x1={0} x2={24} y1={7} y2={7} stroke={colors.series[i % colors.series.length]} strokeWidth={2} strokeDasharray={SERIES_DASH[i % SERIES_DASH.length]} />
            <text x={30} y={11} fill={colors.text} fontSize={11}>
              {l.label}
            </text>
          </g>
        ))}
      {channels.map((c, ci) => {
        const f: Frame = { x0: LEFT, x1: width - RIGHT, y0: legendH + ci * stripHeight + 6, y1: legendH + (ci + 1) * stripHeight - 6 };
        const all = layers.flatMap((l) => l.series.channels[c] ?? []);
        const d = domains?.[c] ?? channelDomain(all);
        const y = yScale(d, f);
        const meta = channelMeta(c);
        return (
          <g key={c} data-channel={c}>
            <rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill="none" stroke={colors.grid} />
            <text x={4} y={f.y0 + 12} fill={colors.text} fontSize={11}>
              {meta.label}
            </text>
            <text x={4} y={f.y0 + 26} fill={colors.subtlest} fontSize={10}>
              {meta.unit}
            </text>
            <text x={LEFT - 4} y={f.y0 + 9} fill={colors.subtlest} fontSize={10} textAnchor="end">
              {fmtAxis(d[1])}
            </text>
            <text x={LEFT - 4} y={f.y1} fill={colors.subtlest} fontSize={10} textAnchor="end">
              {fmtAxis(d[0])}
            </text>
            {layers.map((l, li) => (
              <path
                key={`${l.series.key}-${li}`}
                d={linePath(l.series, l.series.channels[c] ?? [], x, y)}
                fill="none"
                stroke={colors.series[li % colors.series.length]}
                strokeWidth={li === 0 ? 2 : 1.5}
                strokeDasharray={SERIES_DASH[li % SERIES_DASH.length]}
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      })}
      {/* Takeover marker at t = 0 */}
      <line data-testid="tt-takeover-marker" x1={x(0)} x2={x(0)} y1={legendH} y2={plotBottom} stroke={colors.marker} strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={x(0) + 3} y={legendH + 10} fill={colors.dangerText} fontSize={10}>
        takeover
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={plotBottom} y2={plotBottom + 4} stroke={colors.subtlest} />
          <text x={x(t)} y={plotBottom + 16} textAnchor="middle" fill={colors.subtle} fontSize={10}>
            {t > 0 ? `+${t}` : t} s
          </text>
        </g>
      ))}
    </svg>
  );
}

function fmtAxis(v: number): string {
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export interface SignalPlotProps {
  readonly series: SeriesLike;
  /** Channels to draw (default: every channel with data, in display order). */
  readonly channels?: readonly string[];
  readonly title?: string;
  readonly width?: number;
  readonly stripHeight?: number;
  readonly domains?: Readonly<Record<string, Domain>>;
  readonly testId?: string;
}

/** One event's telemetry window with the takeover marker. */
export function SignalPlot({ series, channels, title, width, stripHeight, domains, testId = "tt-signal-plot" }: SignalPlotProps) {
  const shown = displayChannels(series, channels);
  return (
    <StripPlot
      layers={[{ label: series.key, series }]}
      channels={shown}
      title={title ?? `Telemetry of ${series.key}, 15 s before to 5 s after the takeover`}
      {...(width !== undefined ? { width } : {})}
      {...(stripHeight !== undefined ? { stripHeight } : {})}
      {...(domains !== undefined ? { domains } : {})}
      testId={testId}
    />
  );
}

export interface OverlayPlotProps {
  readonly event: SeriesLike;
  /** Up to 3 nearest neighbours (US-10 AC2); more are ignored. */
  readonly neighbours: readonly SeriesLike[];
  readonly channels?: readonly string[];
  readonly title?: string;
  readonly width?: number;
  readonly testId?: string;
}

/** The event and its top-3 neighbours overlaid on the same axes, aligned at t = 0. */
export function OverlayPlot({ event, neighbours, channels, title, width, testId = "tt-overlay-plot" }: OverlayPlotProps) {
  const layers: PlotLayer[] = [{ label: `${event.key} (this event)`, series: event }, ...neighbours.slice(0, 3).map((n) => ({ label: n.key, series: n }))];
  const shown = displayChannels(event, channels);
  return (
    <StripPlot
      layers={layers}
      channels={shown}
      legend
      title={title ?? `${event.key} overlaid with ${layers.length - 1} nearest events, aligned at the takeover`}
      {...(width !== undefined ? { width } : {})}
      testId={testId}
    />
  );
}
