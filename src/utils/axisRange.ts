export const numericBounds = (values: Array<number | string>): [number, number] | undefined => {
  // Categorical axes keep Plotly's category spacing.
  if (values.some(value => typeof value === "string")) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return Number.isFinite(min) ? [min, max] : undefined;
};

const optionalNumber = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;

export function axisRange(minText: string, maxText: string, bounds?: [number, number]): { range?: [number, number]; error?: string } {
  const min = optionalNumber(minText);
  const max = optionalNumber(maxText);
  if (min !== undefined && max !== undefined) {
    return max > min ? { range: [min, max] } : { error: "Maximum must be greater than minimum." };
  }
  if (!bounds && min === undefined && max === undefined) return {};
  const [dataMin, dataMax] = bounds ?? [min ?? max!, min ?? max!];
  const span = dataMax - dataMin;
  const padding = span > 0 ? span * 0.02 : Math.abs(dataMax) * 0.02 || 1;
  // Keep nonnegative data from creating an empty strip below zero.
  let lower = min ?? (dataMin >= 0 ? Math.max(0, dataMin - padding) : dataMin - padding);
  let upper = max ?? dataMax + padding;
  // Expand only the automatic endpoint, never a user-entered zero or bound.
  if (upper <= lower) {
    if (max === undefined) upper = lower + padding;
    else lower = upper - padding;
  }
  return { range: [lower, upper] };
}

export function axisRangeLayout(range?: [number, number]) {
  return {
    autorange: !range,
    range,
    // The modebar Autoscale action must obey the same limits as the controls.
    autorangeoptions: range ? { minallowed: range[0], maxallowed: range[1] } : {},
  };
}
