import { plotYValue } from "../types";
import type { ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";
import { movingAverageByRow, rowsForPlotAxis } from "./plot";

const escapeCsvValue = (value: string | number | null): string => {
  const stringValue = value === null ? "" : String(value);

  if (/[",\t\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const processedRowsToCsv = (rows: ProcessedRow[], delimiter = ","): string => {
  const headers = [
    "filename",
    "compound",
    "parent ion",
    "condition",
    "Act. Time (ms)",
    "activation time",
    "LED power",
    "wavelength",
    "replicate",
    "target m/z",
    "found m/z",
    "label",
    "absolute intensity",
    "relative intensity (each ion own maximum = 100%)",
    "share of selected ions per segment (%)",
    "warning",
    "acquisition time (s)", "segment", "notes",
  ];

  const csvRows = rows.map((row) => [
    row.filename,
    row.metadata.compound,
    row.metadata.parentIon,
    row.metadata.condition,
    row.metadata.acqTime,
    row.metadata.activationTime,
    row.metadata.ledPower,
    row.metadata.wavelength,
    row.metadata.replicate,
    row.targetMz,
    row.foundMz,
    row.label,
    row.absoluteIntensity,
    row.relativeIntensity,
    row.selectedIonPercent,
    row.warning,
    row.metadata.retentionTime, row.metadata.segment, row.metadata.notes,
  ]);

  return [headers, ...csvRows]
    .map((csvRow) => csvRow.map(escapeCsvValue).join(delimiter))
    .join("\n");
};

const axisLabel = (axis: XAxisKey): string =>
  xAxisOptions.find((option) => option.key === axis)?.label ?? axis;

const yModeLabel = (mode: YMode): string =>
  yModeOptions.find((option) => option.key === mode)?.label ?? mode;

const numericPrefix = (value: string): number | null => {
  const match = value.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const plotAxisValue = (
  value: string,
  numericMultiplier: number,
): string | number => {
  const numericValue = numericPrefix(value);

  if (numericValue === null) {
    return value;
  }

  return numericValue * numericMultiplier;
};

export const plotRowsToCsv = (
  rows: ProcessedRow[],
  xAxis: XAxisKey,
  yMode: YMode,
  xValueMultiplier = 1,
  xAxisDisplayLabel?: string,
  delimiter = ",",
  movingAverageWindow?: number,
): string => {
  rows = rowsForPlotAxis(rows, xAxis);
  const smoothed = movingAverageWindow === undefined ? undefined : movingAverageByRow(rows, xAxis, yMode, movingAverageWindow);
  const headers = [
    "plot x axis",
    "plot x value",
    "plot y mode",
    "plot y value",
    "filename",
    "compound",
    "parent ion",
    "condition",
    "Act. Time (ms)",
    "activation time",
    "LED power",
    "wavelength",
    "replicate",
    "target m/z",
    "found m/z",
    "label",
    "absolute intensity",
    "relative intensity (each ion own maximum = 100%)",
    "share of selected ions per segment (%)",
    "warning",
    "acquisition time (s)", "segment", "notes",
    ...(smoothed ? ["smoothing", "smoothed plot y value"] : []),
  ];

  const csvRows = rows.map((row) => [
    xAxisDisplayLabel ?? axisLabel(xAxis),
    plotAxisValue(row.metadata[xAxis] ?? "", xValueMultiplier),
    yModeLabel(yMode),
    plotYValue(row, yMode),
    row.filename,
    row.metadata.compound,
    row.metadata.parentIon,
    row.metadata.condition,
    row.metadata.acqTime,
    row.metadata.activationTime,
    row.metadata.ledPower,
    row.metadata.wavelength,
    row.metadata.replicate,
    row.targetMz,
    row.foundMz,
    row.label,
    row.absoluteIntensity,
    row.relativeIntensity,
    row.selectedIonPercent,
    row.warning,
    row.metadata.retentionTime, row.metadata.segment, row.metadata.notes,
    ...(smoothed ? [`Centered moving average (${movingAverageWindow} points; symmetric shrinking endpoints)`, smoothed.get(row.id) ?? null] : []),
  ]);

  return [headers, ...csvRows]
    .map((csvRow) => csvRow.map(escapeCsvValue).join(delimiter))
    .join("\n");
};

export const downloadTextFile = (
  filename: string,
  content: string,
  mimeType: string,
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser consume the download before releasing its backing data.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
