import type { ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";

const escapeCsvValue = (value: string | number | null): string => {
  const stringValue = value === null ? "" : String(value);

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const processedRowsToCsv = (rows: ProcessedRow[]): string => {
  const headers = [
    "filename",
    "compound",
    "parent ion",
    "condition",
    "ACQ time",
    "activation time",
    "LED power",
    "wavelength",
    "replicate",
    "target m/z",
    "found m/z",
    "label",
    "absolute intensity",
    "relative intensity",
    "warning",
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
    row.warning,
  ]);

  return [headers, ...csvRows]
    .map((csvRow) => csvRow.map(escapeCsvValue).join(","))
    .join("\n");
};

const axisLabel = (axis: XAxisKey): string =>
  xAxisOptions.find((option) => option.key === axis)?.label ?? axis;

const yModeLabel = (mode: YMode): string =>
  yModeOptions.find((option) => option.key === mode)?.label ?? mode;

export const plotRowsToCsv = (
  rows: ProcessedRow[],
  xAxis: XAxisKey,
  yMode: YMode,
): string => {
  const headers = [
    "plot x axis",
    "plot x value",
    "plot y mode",
    "plot y value",
    "filename",
    "compound",
    "parent ion",
    "condition",
    "ACQ time",
    "activation time",
    "LED power",
    "wavelength",
    "replicate",
    "target m/z",
    "found m/z",
    "label",
    "absolute intensity",
    "relative intensity",
    "warning",
  ];

  const csvRows = rows.map((row) => [
    axisLabel(xAxis),
    row.metadata[xAxis],
    yModeLabel(yMode),
    yMode === "absolute" ? row.absoluteIntensity : row.relativeIntensity,
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
    row.warning,
  ]);

  return [headers, ...csvRows]
    .map((csvRow) => csvRow.map(escapeCsvValue).join(","))
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
  link.click();

  URL.revokeObjectURL(url);
};
