import {useEffect, useState} from "react";
import type {LegendPosition, ProcessedRow, XAxisKey, SpectrumFile} from "../../types";
import {xAxisOptions} from "../../types";
import type {ColorPaletteId} from "../../utils/colorPalettes";

export function readPlotSetting<T>(settings: Record<string, unknown>, key: string, fallback: T): T {
  const value = settings[key];
  if (value === undefined || value === null || typeof value !== typeof fallback) return fallback;
  if (typeof value === "number" && !Number.isFinite(value)) return fallback;
  if (key === "xAxis" && !xAxisOptions.some(option => option.key === value)) return fallback;
  return value as T;
}

export type PlotBuilderProps = {
  rows: ProcessedRow[];
  isActive?: boolean;
  initialSettings?: Record<string, unknown>;
  settingsRef: { current: Record<string, unknown> };
  onSettingsChange: (settings: Record<string, unknown>) => void;
  projectName: string;
  files: SpectrumFile[];
  tolerance: number;
};

export type PlotTab = "data" | "style";
export type PlotInteraction = { curveNumber?: number; points?: Array<{ curveNumber: number }> };
export type InteractivePlotElement = HTMLDivElement & {
  on: (event: string, handler: (event: PlotInteraction) => boolean | void) => void;
  removeListener: (event: string, handler: (event: PlotInteraction) => boolean | void) => void;
};
export type StyleTab =
  | "presets"
  | "curve"
  | "legend"
  | "publication"
  | "appearance"
  | "colors";
export type PlotFont =
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Calibri"
  | "Inter, ui-sans-serif, system-ui, sans-serif";
export type LineShape = "linear" | "spline";
export type CurveMode =
  | "connect"
  | "movingAverage"
  | "polynomial"
  | "exponential"
  | "logistic"
  | "auto";
export type TickFormat = "auto" | "plain" | "scientific";
export type XValueScale = "raw" | "msToSeconds" | "secondsToMinutes" | "custom";
export type JournalPresetKey = "jasms-single";
export type FigureContent = "color" | "grayscale" | "lineArt";
export type RasterDpi = 300 | 600 | 1200;

export type PlotStyleSettings = {
  fontFamily: PlotFont;
  showTitle?: boolean;
  titleSize: number;
  axisTitleSize: number;
  tickSize: number;
  legendSize: number;
  showLegend: boolean;
  legendPosition: LegendPosition;
  legendColumns?: number;
  highlightOnClick?: boolean;
  legendInsideX: number;
  legendInsideY: number;
  forceSingleLegend: boolean;
  showGrid: boolean;
  showAxisBox: boolean;
  axisLineWidth: number;
  lineWidth: number;
  markerSize: number;
  lineShape: LineShape;
  curveMode?: CurveMode;
  polynomialDegree?: number;
  movingAverageWindow?: number;
  previewExportRatio: boolean;
  plotHeight: number;
  exportWidth: number;
  exportHeight: number;
  figureContent: FigureContent;
  rasterDpi: RasterDpi;
  finalWidthMm: number;
  axisColor: string;
  gridColor: string;
  plotBackground: string;
  paperBackground: string;
  tracePalette: string[];
  colorPalette?: ColorPaletteId;
};

export type SavedPlotStyle = {
  id: string;
  name: string;
  settings: PlotStyleSettings;
};

export const MM_PER_INCH = 25.4;
export const STYLE_PRESETS_STORAGE_KEY = "pd-ms-plot-style-presets-v1";

export const styleTabs: Array<{ key: StyleTab; label: string }> = [
  { key: "presets", label: "Presets" },
  { key: "curve", label: "Curve" },
  { key: "legend", label: "Legend" },
  { key: "publication", label: "Publication" },
  { key: "appearance", label: "Appearance" },
  { key: "colors", label: "Colors" },
];

export const loadSavedPlotStyles = (): SavedPlotStyle[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(STYLE_PRESETS_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (preset): preset is SavedPlotStyle =>
        typeof preset === "object" &&
        preset !== null &&
        typeof (preset as SavedPlotStyle).id === "string" &&
        typeof (preset as SavedPlotStyle).name === "string" &&
        typeof (preset as SavedPlotStyle).settings === "object" &&
        (preset as SavedPlotStyle).settings !== null,
    );
  } catch {
    return [];
  }
};

export const journalPresets: Array<{
  key: JournalPresetKey;
  label: string;
  widthMm: number;
  maxHeightMm: number;
  minFontPt: number;
  minLinePt: number;
}> = [
  {
    key: "jasms-single",
    label: "JASMS - Single column",
    widthMm: 84.6,
    maxHeightMm: 232.8,
    minFontPt: 4.5,
    minLinePt: 0.5,
  },
];

export const figureContentOptions: Array<{
  key: FigureContent;
  label: string;
  recommendedDpi: RasterDpi;
}> = [
  { key: "color", label: "Color", recommendedDpi: 300 },
  { key: "grayscale", label: "Grayscale", recommendedDpi: 600 },
  { key: "lineArt", label: "Line art", recommendedDpi: 1200 },
];

export const rasterDpiOptions: RasterDpi[] = [300, 600, 1200];

export const pointsToPixels = (points: number, dpi: number): number =>
  Math.max(1, Math.round((points * dpi) / 72));

export const pixelsToPoints = (pixels: number, dpi: number): number =>
  (pixels / dpi) * 72;

export const pixelsFromMm = (millimeters: number, dpi: number): number =>
  Math.max(1, Math.round((millimeters / MM_PER_INCH) * dpi));

export const mmFromPixels = (pixels: number, dpi: number): number =>
  (pixels / dpi) * MM_PER_INCH;

export const formatDecimal = (value: number, digits = 1): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0.0";

export const axisLabel = (axis: XAxisKey): string =>
  xAxisOptions.find((option) => option.key === axis)?.label ?? "x";

export const defaultXAxisUnit = (axis: XAxisKey): string => {
  if (axis === "current") return "mA";
  if (axis === "voltage") return "V";
  if (axis === "retentionTime") return "s";
  if (axis === "acqTime" || axis === "activationTime") {
    return "ms";
  }

  if (axis === "wavelength") {
    return "nm";
  }

  return "";
};

export const axisTitleWithUnit = (title: string, unit: string): string =>
  unit.trim() ? `${title.trim()} (${unit.trim()})` : title;

export const tickFormatValue = (format: TickFormat): string | undefined => {
  if (format === "plain") {
    return ".0f";
  }

  if (format === "scientific") {
    return ".2e";
  }

  return undefined;
};

export const normalizeHexColor = (value: string): string | null => {
  const trimmedValue = value.trim();
  const colorValue = trimmedValue.startsWith("#")
    ? trimmedValue
    : `#${trimmedValue}`;

  if (/^#[0-9a-fA-F]{3}$/.test(colorValue)) {
    const [, red, green, blue] = colorValue;
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(colorValue)) {
    return colorValue.toLowerCase();
  }

  return null;
};

export type ColorControlProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

export function ColorControl({
  label,
  value,
  onChange,
  compact = false,
}: ColorControlProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const updateTextColor = (nextValue: string) => {
    setDraftValue(nextValue);
    const normalizedColor = normalizeHexColor(nextValue);

    if (normalizedColor) {
      onChange(normalizedColor);
    }
  };

  return (
    <label className={compact ? "trace-color-row" : "color-field color-combo"}>
      <span>{label}</span>
      <div className="color-combo-inputs">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} picker`}
        />
        <input
          type="text"
          value={draftValue}
          onChange={(event) => updateTextColor(event.target.value)}
          onBlur={() => setDraftValue(value)}
          placeholder="#000000"
          aria-label={`${label} hex code`}
        />
      </div>
    </label>
  );
}
