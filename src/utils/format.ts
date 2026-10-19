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
