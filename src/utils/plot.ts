import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { formatMz } from "./format";

export type PlotTrace = {
  x: Array<number | string>;
  y: number[];
  type: "scatter";
  mode: "lines+markers";
  name: string;
  text: string[];
  hovertemplate: string;
  marker: { size: number; color: string };
  line: { width: number; color: string; shape: "linear" | "spline" };
  showlegend: boolean;
};

export type TraceStyleOptions = {
  colors: Record<string, string>;
  lineWidth: number;
  markerSize: number;
  lineShape: "linear" | "spline";
};

export const defaultTraceColors = [
  "#000000",
  "#8a008a",
  "#0066cc",
  "#d7191c",
  "#1a9641",
  "#7b2ff7",
  "#a6761d",
  "#00a6a6",
];

const fallbackColors = [
  "#0f766e",
  "#b45309",
  "#2563eb",
  "#be123c",
  "#7c3aed",
  "#15803d",
  "#c2410c",
  "#0e7490",
];

const getAxisRawValue = (row: ProcessedRow, axis: XAxisKey): string =>
  row.metadata[axis] ?? "";

const getSortableNumber = (value: string): number | null => {
  const match = value.trim().match(/^-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPlotXValue = (
  value: string,
  numericMultiplier = 1,
): number | string => {
  const sortableNumber = getSortableNumber(value);
  if (sortableNumber !== null) {
    return sortableNumber * numericMultiplier;
  }

  return value.trim() || "(blank)";
};

const sortRowsByAxis = (rows: ProcessedRow[], axis: XAxisKey): ProcessedRow[] =>
  [...rows].sort((a, b) => {
    const rawA = getAxisRawValue(a, axis);
    const rawB = getAxisRawValue(b, axis);
    const numericA = getSortableNumber(rawA);
    const numericB = getSortableNumber(rawB);

    if (numericA !== null && numericB !== null) {
      return numericA - numericB;
    }

    if (numericA !== null) {
      return -1;
    }

    if (numericB !== null) {
      return 1;
    }

    return rawA.localeCompare(rawB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

export const traceName = (targetMz: number, label: string): string =>
  label.trim()
    ? `<i>m/z</i> ${formatMz(targetMz)} - ${label.trim()}`
    : `<i>m/z</i> ${formatMz(targetMz)}`;

export const buildPlotData = (
  rows: ProcessedRow[],
  axis: XAxisKey,
  yMode: YMode,
  showLegend: boolean,
  style: TraceStyleOptions,
  xValueMultiplier = 1,
): PlotTrace[] => {
  const rowsByIon = new Map<string, ProcessedRow[]>();

  rows.forEach((row) => {
    const currentRows = rowsByIon.get(row.ionId) ?? [];
    currentRows.push(row);
    rowsByIon.set(row.ionId, currentRows);
  });

  return Array.from(rowsByIon.entries()).map(([ionId, ionRows], index) => {
    const sortedRows = sortRowsByAxis(ionRows, axis);
    const firstRow = sortedRows[0];
    const color =
      style.colors[ionId] ??
      defaultTraceColors[index % defaultTraceColors.length] ??
      fallbackColors[index % fallbackColors.length];

    return {
      x: sortedRows.map((row) =>
        getPlotXValue(getAxisRawValue(row, axis), xValueMultiplier),
      ),
      y: sortedRows.map((row) =>
        yMode === "absolute" ? row.absoluteIntensity : row.relativeIntensity,
      ),
      type: "scatter",
      mode: "lines+markers",
      name: traceName(firstRow.targetMz, firstRow.label),
      text: sortedRows.map((row) => row.filename),
      hovertemplate:
        "%{text}<br>x=%{x}<br>intensity=%{y:.4g}<extra>%{fullData.name}</extra>",
      marker: { size: style.markerSize, color },
      line: { width: style.lineWidth, color, shape: style.lineShape },
      showlegend: showLegend,
    };
  });
};

export const legendLayout = (
  position: LegendPosition,
  insideX = 0.98,
  insideY = 0.98,
): Record<string, unknown> => {
  if (position === "inside") {
    return {
      orientation: "v",
      x: insideX,
      y: insideY,
      xanchor: insideX > 0.5 ? "right" : "left",
      yanchor: insideY > 0.5 ? "top" : "bottom",
      bgcolor: "rgba(255,255,255,0.78)",
      bordercolor: "rgba(17,17,17,0.25)",
      borderwidth: 1,
    };
  }

  if (position === "top") {
    return {
      orientation: "h",
      x: 0,
      y: 1.15,
      xanchor: "left",
      yanchor: "bottom",
    };
  }

  if (position === "bottom") {
    return {
      orientation: "h",
      x: 0,
      y: -0.25,
      xanchor: "left",
      yanchor: "top",
    };
  }

  return {
    orientation: "v",
    x: 1.02,
    y: 1,
    xanchor: "left",
    yanchor: "top",
  };
};
