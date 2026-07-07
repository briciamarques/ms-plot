export const formatMz = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
};

export const formatIntensity = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
};

export const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toFixed(2);
};
