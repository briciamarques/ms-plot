import type { XAxisKey } from "../types";

export const formatMz = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "";
  }

  return value.toString();
};

export type LegendMzDecimals = "auto" | number;
export const readLegendMzDecimals = (value: unknown): LegendMzDecimals =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8 ? value : "auto";

export const formatLegendMz = (value: number, decimals: LegendMzDecimals = "auto"): string => {
  const precision = readLegendMzDecimals(decimals);
  return precision === "auto" ? formatMz(value) : value.toFixed(precision);
};

export const formatIntensity = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toString();
};

export const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toFixed(2);
};
export const isTimeAxis = (axis: XAxisKey): boolean =>
  axis === "acqTime" || axis === "activationTime" || axis === "retentionTime";

// Duration axes use ms; retention time uses s. Unitless legacy values keep
// their base unit. Convert explicit units before sorting, pooling or scaling.
export const axisNumericValue = (value: string, axis: XAxisKey): number | null => {
  if (isTimeAxis(axis)) {
    const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(ms|s|min|h|[µμu]s)?$/i);
    if (!match) return null;
    const number = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    const seconds = unit ? number * ({ms: 0.001, s: 1, min: 60, h: 3600, us: 0.000001, "µs": 0.000001, "μs": 0.000001}[unit] ?? 1) : null;
    const result = seconds === null ? number : seconds * (axis === "retentionTime" ? 1 : 1000);
    return Number.isFinite(result) && result >= 0 ? result : null;
  }
  const match = value.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) ? number : null;
};

export const plotAxisValue = (value: string, axis: XAxisKey, multiplier = 1): number | string => {
  const number = axisNumericValue(value, axis);
  return number === null ? value.trim() || "(blank)" : number * multiplier;
};
