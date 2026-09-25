import { plotYValue } from "../types";
import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { formatMz } from "./format";
import { paletteColor, trmsColors, type ColorPaletteId } from "./colorPalettes";

export const defaultPlotAppearance = {
  fontFamily: "Arial" as const, showTitle: false, titleSize: 28, axisTitleSize: 28,
  tickSize: 24, legendSize: 24, lineWidth: 2.5, markerSize: 7,
  exportWidth: 1000, exportHeight: 800, legendPosition: "insideTop" as const, legendColumns: 0,
};

export const trmsPlotDefaults = {
  ...defaultPlotAppearance,
  xAxis: "retentionTime" as const, xTitle: "Time", xUnit: "min",
  xValueScale: "secondsToMinutes" as const, xValueMultiplier: 1 / 60,
  yMode: "selectedSum" as const, yTitle: "Relative Intensity", yUnit: "%",
  xMin: "0", yMin: "0", xMax: "", yMax: "",
  curveMode: "movingAverage" as const, movingAverageWindow: 3, lineShape: "linear" as const,
  legendColumns: 1, legendInsideX: 0.02, legendInsideY: 0.98,
  forceSingleLegend: true, highlightOnClick: false, colorPalette: "trms" as const,
};

export type PlotTrace = {
  x: Array<number | string>;
  y: number[];
  type: "scatter";
  mode: "lines+markers" | "lines" | "markers";
  name: string;
  text: string[];
  hovertemplate: string;
  marker: { size: number; color: string };
  line: { width: number; color: string; shape: "linear" | "spline" };
  showlegend: boolean;
  legendgroup?: string;
  meta: { ionId: string };
  legendrank?: number;
  uid?: string;
  legend?: string;
};

export type TraceStyleOptions = {
  colors: Record<string, string>;
  colorPalette?: ColorPaletteId;
  lineWidth: number;
  markerSize: number;
  lineShape: "linear" | "spline";
  curveMode:
    | "connect"
    | "movingAverage"
    | "polynomial"
    | "exponential"
    | "logistic"
    | "auto";
  polynomialDegree: number;
  movingAverageWindow?: number;
  highlightedIonId?: string;
};

export const defaultTraceColors = trmsColors;

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

const solveLinearSystem = (
  matrix: number[][],
  vector: number[],
): number[] | null => {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][column]) >
        Math.abs(augmented[pivotRow][column])
      ) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-12) {
      return null;
    }

    [augmented[column], augmented[pivotRow]] = [
      augmented[pivotRow],
      augmented[column],
    ];

    const pivot = augmented[column][column];
    for (let cell = column; cell <= size; cell += 1) {
      augmented[column][cell] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

type CurveFitResult = {
  x: number[];
  y: number[];
  label: string;
  rSquared: number;
  sumSquaredErrors: number;
  parameterCount: number;
};

const fitStatistics = (
  observed: number[],
  predicted: number[],
): { rSquared: number; sumSquaredErrors: number } => {
  const mean =
    observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const sumSquaredErrors = observed.reduce(
    (sum, value, index) => sum + (value - predicted[index]) ** 2,
    0,
  );
  const totalVariation = observed.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  );

  return {
    rSquared:
      totalVariation > 1e-12
        ? 1 - sumSquaredErrors / totalVariation
        : sumSquaredErrors < 1e-12
          ? 1
          : 0,
    sumSquaredErrors,
  };
};

const sampleXValues = (minX: number, maxX: number, pointCount: number) => {
  const sampleCount = Math.max(120, Math.min(320, pointCount * 24));
  return Array.from({ length: sampleCount }, (_, index) =>
    minX + ((maxX - minX) * index) / (sampleCount - 1),
  );
};

const polynomialFit = (
  xValues: number[],
  yValues: number[],
  requestedDegree: number,
): CurveFitResult | null => {
  const points = xValues
    .map((x, index) => ({ x, y: yValues[index] }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const uniqueXValues = new Set(points.map((point) => point.x));

  if (points.length < 2 || uniqueXValues.size < 2) {
    return null;
  }

  const degree = Math.min(
    Math.max(1, Math.floor(requestedDegree)),
    uniqueXValues.size - 1,
    points.length - 1,
  );
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const center = (minX + maxX) / 2;
  const scale = (maxX - minX) / 2;

  if (!Number.isFinite(scale) || scale === 0) {
    return null;
  }

  const normalizedPoints = points.map((point) => ({
    x: (point.x - center) / scale,
    y: point.y,
  }));
  const coefficientCount = degree + 1;
  const matrix = Array.from({ length: coefficientCount }, () =>
    Array.from({ length: coefficientCount }, () => 0),
  );
  const vector = Array.from({ length: coefficientCount }, () => 0);

  normalizedPoints.forEach((point) => {
    const powers = Array.from({ length: degree * 2 + 1 }, () => 1);
    for (let power = 1; power < powers.length; power += 1) {
      powers[power] = powers[power - 1] * point.x;
    }

    for (let row = 0; row < coefficientCount; row += 1) {
      vector[row] += point.y * powers[row];
      for (let column = 0; column < coefficientCount; column += 1) {
        matrix[row][column] += powers[row + column];
      }
    }
  });

  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients) {
    return null;
  }

  const evaluate = (x: number) => {
    const normalizedX = (x - center) / scale;
    return coefficients.reduce(
      (sum, coefficient, power) =>
        sum + coefficient * normalizedX ** power,
      0,
    );
  };
  const fittedX = sampleXValues(minX, maxX, points.length);
  const fittedY = fittedX.map(evaluate);
  const statistics = fitStatistics(
    points.map((point) => point.y),
    points.map((point) => evaluate(point.x)),
  );

  return {
    x: fittedX,
    y: fittedY,
    label: `Polynomial degree ${degree}`,
    rSquared: statistics.rSquared,
    sumSquaredErrors: statistics.sumSquaredErrors,
    parameterCount: coefficientCount,
  };
};

const linearBasisFit = (
  basisValues: number[],
  yValues: number[],
): { intercept: number; slope: number; predicted: number[] } | null => {
  const count = basisValues.length;
  const sumBasis = basisValues.reduce((sum, value) => sum + value, 0);
  const sumY = yValues.reduce((sum, value) => sum + value, 0);
  const sumBasisSquared = basisValues.reduce(
    (sum, value) => sum + value * value,
    0,
  );
  const sumBasisY = basisValues.reduce(
    (sum, value, index) => sum + value * yValues[index],
    0,
  );
  const denominator = count * sumBasisSquared - sumBasis * sumBasis;

  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const slope = (count * sumBasisY - sumBasis * sumY) / denominator;
  const intercept = (sumY - slope * sumBasis) / count;

  return {
    intercept,
    slope,
    predicted: basisValues.map((value) => intercept + slope * value),
  };
};

const exponentialPlateauFit = (
  xValues: number[],
  yValues: number[],
): CurveFitResult | null => {
  if (xValues.length < 3) {
    return null;
  }

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const span = maxX - minX;
  if (!Number.isFinite(span) || span === 0) {
    return null;
  }

  const normalizedX = xValues.map((x) => (x - minX) / span);
  let best:
    | {
        rate: number;
        intercept: number;
        slope: number;
        statistics: ReturnType<typeof fitStatistics>;
      }
    | undefined;
  const minRate = Math.log(0.05);
  const maxRate = Math.log(30);

  for (let index = 0; index <= 120; index += 1) {
    const rate = Math.exp(minRate + ((maxRate - minRate) * index) / 120);
    const basis = normalizedX.map((x) => 1 - Math.exp(-rate * x));
    const linearFit = linearBasisFit(basis, yValues);
    if (!linearFit) {
      continue;
    }

    const statistics = fitStatistics(yValues, linearFit.predicted);
    if (
      !best ||
      statistics.sumSquaredErrors < best.statistics.sumSquaredErrors
    ) {
      best = {
        rate,
        intercept: linearFit.intercept,
        slope: linearFit.slope,
        statistics,
      };
    }
  }

  if (!best) {
    return null;
  }

  const fittedX = sampleXValues(minX, maxX, xValues.length);
  const fittedY = fittedX.map((x) => {
    const normalizedValue = (x - minX) / span;
    return best.intercept + best.slope * (1 - Math.exp(-best.rate * normalizedValue));
  });

  return {
    x: fittedX,
    y: fittedY,
    label: "Exponential plateau",
    rSquared: best.statistics.rSquared,
    sumSquaredErrors: best.statistics.sumSquaredErrors,
    parameterCount: 3,
  };
};

const sigmoid = (value: number): number => {
  if (value >= 0) {
    return 1 / (1 + Math.exp(-value));
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
};

const logisticFit = (
  xValues: number[],
  yValues: number[],
): CurveFitResult | null => {
  if (xValues.length < 4) {
    return null;
  }

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const span = maxX - minX;
  if (!Number.isFinite(span) || span === 0) {
    return null;
  }

  const normalizedX = xValues.map((x) => (x - minX) / span);
  let best:
    | {
        rate: number;
        midpoint: number;
        intercept: number;
        slope: number;
        statistics: ReturnType<typeof fitStatistics>;
      }
    | undefined;
  const minRate = Math.log(0.1);
  const maxRate = Math.log(40);

  for (let rateIndex = 0; rateIndex <= 48; rateIndex += 1) {
    const rate = Math.exp(
      minRate + ((maxRate - minRate) * rateIndex) / 48,
    );

    for (let midpointIndex = 0; midpointIndex <= 48; midpointIndex += 1) {
      const midpoint = -0.5 + (2 * midpointIndex) / 48;
      const basis = normalizedX.map((x) =>
        sigmoid(rate * (x - midpoint)),
      );
      const linearFit = linearBasisFit(basis, yValues);
      if (!linearFit) {
        continue;
      }

      const statistics = fitStatistics(yValues, linearFit.predicted);
      if (
        !best ||
        statistics.sumSquaredErrors < best.statistics.sumSquaredErrors
      ) {
        best = {
          rate,
          midpoint,
          intercept: linearFit.intercept,
          slope: linearFit.slope,
          statistics,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  const fittedX = sampleXValues(minX, maxX, xValues.length);
  const fittedY = fittedX.map((x) => {
    const normalizedValue = (x - minX) / span;
    return (
      best.intercept +
      best.slope * sigmoid(best.rate * (normalizedValue - best.midpoint))
    );
  });

  return {
    x: fittedX,
    y: fittedY,
    label: "Sigmoidal (logistic)",
    rSquared: best.statistics.rSquared,
    sumSquaredErrors: best.statistics.sumSquaredErrors,
    parameterCount: 4,
  };
};

const correctedAkaikeScore = (
  fit: CurveFitResult,
  pointCount: number,
): number => {
  const baseScore =
    pointCount *
      Math.log(Math.max(fit.sumSquaredErrors / pointCount, 1e-12)) +
    2 * fit.parameterCount;

  return pointCount > fit.parameterCount + 1
    ? baseScore +
        (2 * fit.parameterCount * (fit.parameterCount + 1)) /
          (pointCount - fit.parameterCount - 1)
    : baseScore + fit.parameterCount * 10;
};

const automaticFit = (
  xValues: number[],
  yValues: number[],
  polynomialDegree: number,
): CurveFitResult | null => {
  const candidates = [
    polynomialFit(xValues, yValues, polynomialDegree),
    exponentialPlateauFit(xValues, yValues),
    logisticFit(xValues, yValues),
  ].filter((fit): fit is CurveFitResult => fit !== null);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, candidate) =>
    correctedAkaikeScore(candidate, xValues.length) <
    correctedAkaikeScore(best, xValues.length)
      ? candidate
      : best,
  );
};

const fitCurve = (
  mode: TraceStyleOptions["curveMode"],
  xValues: number[],
  yValues: number[],
  polynomialDegree: number,
): CurveFitResult | null => {
  if (mode === "polynomial") {
    return polynomialFit(xValues, yValues, polynomialDegree);
  }

  if (mode === "exponential") {
    return exponentialPlateauFit(xValues, yValues);
  }

  if (mode === "logistic") {
    return logisticFit(xValues, yValues);
  }

  if (mode === "auto") {
    return automaticFit(xValues, yValues, 3);
  }

  return null;
};

export const traceName = (targetMz: number, label: string): string =>
  label.trim()
    ? `<i>m/z</i> ${formatMz(targetMz)} - ${label.trim()}`
    : `<i>m/z</i> ${formatMz(targetMz)}`;

// Symmetric shrinking endpoints match the saved Origin worksheet: 1, 3, 5, …, 3, 1.
export const movingAverageValues = (values: number[], window = 5): number[] => {
  if (!Number.isInteger(window) || window < 3 || window > 31 || window % 2 !== 1) {
    throw new Error("Moving average requires an odd window of 3–31 points.");
  }
  return values.map((_, index) => {
    const radius = Math.min((window - 1) / 2, index, values.length - 1 - index);
    const neighbors = values.slice(index - radius, index + radius + 1);
    return neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
  });
};

const groupRows = (rows: ProcessedRow[]) => {
  const groups = new Map<string, ProcessedRow[]>();
  rows.forEach(row => {
    const key = JSON.stringify([row.ionId, row.seriesId ?? ""]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return groups;
};

export const movingAverageByRow = (rows: ProcessedRow[], axis: XAxisKey, mode: YMode, window = 5): Map<string, number> => {
  const result = new Map<string, number>();
  groupRows(rows).forEach(group => {
    const sorted = sortRowsByAxis(group, axis);
    const smoothed = movingAverageValues(sorted.map(row => plotYValue(row, mode)), window);
    sorted.forEach((row, index) => result.set(row.id, smoothed[index]));
  });
  return result;
};

export const buildPlotData = (
  rows: ProcessedRow[],
  axis: XAxisKey,
  yMode: YMode,
  showLegend: boolean,
  style: TraceStyleOptions,
  xValueMultiplier = 1,
): PlotTrace[] => {
  const rowsByIon = groupRows(rows);
  const ionIndexes = new Map([...new Set(rows.map(row => row.ionId))].map((id, index) => [id, index]));
  const highlightedIonId = rows.some(row => row.ionId === style.highlightedIonId) ? style.highlightedIonId : undefined;

  return Array.from(rowsByIon.entries()).flatMap<PlotTrace>(
    ([groupId, ionRows]): PlotTrace[] => {
      const sortedRows = sortRowsByAxis(ionRows, axis);
      const firstRow = sortedRows[0];
      const color =
        highlightedIonId && firstRow.ionId !== highlightedIonId ? "#b8b8b8" :
        style.colors[firstRow.ionId] ??
        paletteColor(style.colorPalette ?? "trms", firstRow.targetMz, ionIndexes.get(firstRow.ionId) ?? 0);
      const xValues = sortedRows.map((row) =>
        getPlotXValue(getAxisRawValue(row, axis), xValueMultiplier),
      );
      const yValues = sortedRows.map((row) =>
        plotYValue(row, yMode),
      );
      const name = traceName(firstRow.targetMz, firstRow.label);
      if (style.curveMode === "movingAverage") {
        const common = {
          x: xValues, type: "scatter" as const, name, legendgroup: groupId, meta: { ionId: firstRow.ionId },
          text: sortedRows.map(row => row.filename),
          marker: { size: style.markerSize, color },
          line: { width: style.lineWidth, color, shape: "linear" as const },
        };
        return [
          { ...common, y: movingAverageValues(yValues, style.movingAverageWindow ?? 5), mode: "lines",
            hovertemplate: "%{text}<br>x=%{x}<br>moving average=%{y}<extra>%{fullData.name}</extra>", showlegend: showLegend },
          { ...common, y: yValues, mode: "markers",
            hovertemplate: "%{text}<br>x=%{x}<br>measured intensity=%{y}<extra>%{fullData.name}</extra>", showlegend: false },
        ];
      }
      const numericXValues = xValues.every(
        (value): value is number => typeof value === "number",
      )
        ? xValues
        : null;
      const fit =
        style.curveMode !== "connect" && numericXValues
          ? fitCurve(
              style.curveMode,
              numericXValues,
              yValues,
              style.polynomialDegree,
            )
          : null;

      if (fit) {
        return [
          {
            x: fit.x,
            meta: { ionId: firstRow.ionId }, legendgroup: groupId,
            y: fit.y,
            type: "scatter",
            mode: "lines",
            name,
            text: fit.x.map(
              () => `${fit.label} (R2 = ${fit.rSquared.toFixed(3)})`,
            ),
            hovertemplate:
              "%{text}<br>x=%{x:.4g}<br>fitted intensity=%{y:.4g}<extra>%{fullData.name}</extra>",
            marker: { size: 0, color },
            line: { width: style.lineWidth, color, shape: "linear" },
            showlegend: showLegend,
          },
          {
            x: xValues,
            y: yValues,
            type: "scatter",
            mode: "markers",
            meta: { ionId: firstRow.ionId }, legendgroup: groupId,
            name,
            text: sortedRows.map((row) => row.filename),
            hovertemplate:
              "%{text}<br>x=%{x}<br>intensity=%{y:.4g}<extra>%{fullData.name}</extra>",
            marker: { size: style.markerSize, color },
            line: { width: 0, color, shape: "linear" },
            showlegend: false,
          },
        ];
      }

      return [
        {
          x: xValues,
          y: yValues,
          type: "scatter",
          mode: "lines+markers",
          meta: { ionId: firstRow.ionId }, legendgroup: groupId,
          name,
          text: sortedRows.map((row) => row.filename),
          hovertemplate:
            "%{text}<br>x=%{x}<br>intensity=%{y:.4g}<extra>%{fullData.name}</extra>",
          marker: { size: style.markerSize, color },
          line: { width: style.lineWidth, color, shape: style.lineShape },
          showlegend: showLegend,
        },
      ];
    },
  ).map((trace, index) => ({ ...trace, legendrank: index,
    // Plotly inserts uid directly into CSS selectors during cleanPlot/purge.
    // Encode UTF-16 units so punctuation in group IDs cannot break selectors,
    // while retaining a collision-free identity across highlight reordering.
    uid: "trace-" + JSON.stringify([trace.legendgroup, trace.mode]).split("")
      .map(character => character.charCodeAt(0).toString(16).padStart(4, "0")).join(""),
  }))
    // Draw the selected ion last. Stable legend ranks and trace IDs preserve
    // legend order and click identity while moving both lines and points forward.
    .sort((a, b) => Number(a.meta.ionId === highlightedIonId) - Number(b.meta.ionId === highlightedIonId));
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

export const legendGeometry = (
  position: LegendPosition, names: string[], width: number, height: number,
  fontSize: number, requestedColumns = 0, hasTitle = false, insideX = 0.98, insideY = 0.98,
) => {
  const resolved = position === "auto" ? "top" : position;
  const margin = { l: 72, r: 32, t: hasTitle ? 72 : 32, b: 88 };
  const base = legendLayout(resolved, insideX, insideY);
  if (!names.length) return { legend: base, margin, columns: 1 };
  const longest = Math.max(...names.map(name => name.replace(/<[^>]*>/g, "").length));
  const entryWidth = Math.max(100, longest * fontSize * 0.65 + 70);
  if (resolved === "right") margin.r = Math.ceil(entryWidth + 24);
  if (resolved !== "top" && resolved !== "bottom" && resolved !== "insideTop" && resolved !== "inside") return { legend: base, margin, columns: 1 };
  const fittingColumns = Math.max(1, Math.floor((width - margin.l - margin.r) / entryWidth));
  const columns = Math.max(1, Math.min(names.length, fittingColumns, requestedColumns > 0 ? Math.floor(requestedColumns) : fittingColumns));
  const rows = Math.ceil(names.length / columns);
  if (resolved === "insideTop" || resolved === "inside") return {
    legend: { ...base, orientation: "h",
      x: resolved === "insideTop" ? 0.02 : insideX, y: resolved === "insideTop" ? 0.98 : insideY,
      xanchor: resolved === "insideTop" ? "left" : insideX > 0.5 ? "right" : "left",
      yanchor: resolved === "insideTop" ? "top" : insideY > 0.5 ? "top" : "bottom",
      traceorder: "normal", entrywidthmode: "fraction", entrywidth: 0.96 / columns,
      bgcolor: "rgba(255,255,255,0)", borderwidth: 0 },
    margin, columns,
  };
  const legendHeight = Math.ceil(rows * (fontSize * 1.5 + 6));
  if (resolved === "top") margin.t += legendHeight + 12;
  else margin.b += legendHeight + 12;
  const plotHeight = Math.max(1, height - margin.t - margin.b);
  return {
    legend: { ...base, traceorder: "normal", entrywidthmode: "fraction", entrywidth: 1 / columns,
      y: resolved === "top" ? 1 + 12 / plotHeight : -88 / plotHeight },
    margin, columns,
  };
};

// Separate native legends make compact columns movable without changing trace
// order or coupling the visibility of unrelated ions in one column.
export const insideLegendColumns = (
  traces: PlotTrace[], columns: number, plotWidth: number, fontSize: number,
  x: number, y: number,
) => {
  const entries = traces.filter(trace => trace.showlegend).sort((a, b) => (a.legendrank ?? 0) - (b.legendrank ?? 0));
  if (!entries.length) return { data: traces, legends: {} as Record<string, Record<string, unknown>> };
  const count = Math.max(1, Math.min(columns, entries.length));
  const groupColumn = new Map<string, number>();
  const widths = Array.from({ length: count }, () => 0);
  entries.forEach((trace, index) => {
    const column = index % count;
    groupColumn.set(trace.legendgroup ?? trace.meta.ionId, column);
    const labelWidth = trace.name.replace(/<[^>]*>/g, "").length * fontSize * 0.65;
    widths[column] = Math.max(widths[column], labelWidth + 70);
  });
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const available = Math.max(1, plotWidth);
  const startX = Math.max(0, 1 - totalWidth / available) * Math.max(0, Math.min(1, x));
  const legends: Record<string, Record<string, unknown>> = {};
  let offset = 0;
  const legendName = (column: number) => column === 0 ? "legend" : `legend${column + 1}`;
  widths.forEach((width, column) => {
    legends[legendName(column)] = {
      orientation: "v", x: startX + offset / available, y,
      xanchor: "left", yanchor: y > 0.5 ? "top" : "bottom",
      bgcolor: "rgba(255,255,255,0)", borderwidth: 0, traceorder: "normal",
    };
    offset += width;
  });
  return {
    data: traces.map(trace => ({ ...trace, legend: legendName(groupColumn.get(trace.legendgroup ?? trace.meta.ionId) ?? 0) })),
    legends,
  };
};
