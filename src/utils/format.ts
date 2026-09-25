export const formatMz = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "";
  }

  return value.toString();
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
