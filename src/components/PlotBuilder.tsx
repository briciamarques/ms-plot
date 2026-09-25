import Plotly from "plotly.js-dist-min";
import { Download, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";
import { downloadTextFile, plotRowsToCsv } from "../utils/csv";
import { queuePlotTask } from "../utils/plotLifecycle";
import { axisRange, axisRangeLayout, numericBounds } from "../utils/axisRange";
import {
  buildPlotData,
  defaultTraceColors,
  legendGeometry,
  insideLegendColumns,
  defaultPlotAppearance,
  traceName,
} from "../utils/plot";

function readPlotSetting<T>(settings: Record<string, unknown>, key: string, fallback: T): T {
  const value = settings[key];
  if (value === undefined || value === null || typeof value !== typeof fallback) return fallback;
  if (typeof value === "number" && !Number.isFinite(value)) return fallback;
  if (key === "xAxis" && !xAxisOptions.some(option => option.key === value)) return fallback;
  return value as T;
}

type PlotBuilderProps = {
  rows: ProcessedRow[];
  isActive?: boolean;
  initialSettings?: Record<string, unknown>;
  settingsRef: { current: Record<string, unknown> };
};

type PlotTab = "data" | "style";
type PlotInteraction = { curveNumber?: number; points?: Array<{ curveNumber: number }> };
type InteractivePlotElement = HTMLDivElement & {
  on: (event: string, handler: (event: PlotInteraction) => boolean | void) => void;
  removeListener: (event: string, handler: (event: PlotInteraction) => boolean | void) => void;
};
type StyleTab =
  | "presets"
  | "curve"
  | "legend"
  | "publication"
  | "appearance"
  | "colors";
type PlotFont =
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Calibri"
  | "Inter, ui-sans-serif, system-ui, sans-serif";
type LineShape = "linear" | "spline";
type CurveMode =
  | "connect"
  | "movingAverage"
  | "polynomial"
  | "exponential"
  | "logistic"
  | "auto";
type TickFormat = "auto" | "plain" | "scientific";
type XValueScale = "raw" | "msToSeconds" | "secondsToMinutes" | "custom";
type JournalPresetKey = "jasms-single";
type FigureContent = "color" | "grayscale" | "lineArt";
type RasterDpi = 300 | 600 | 1200;

type PlotStyleSettings = {
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
};

type SavedPlotStyle = {
  id: string;
  name: string;
  settings: PlotStyleSettings;
};

const MM_PER_INCH = 25.4;
const STYLE_PRESETS_STORAGE_KEY = "pd-ms-plot-style-presets-v1";

const styleTabs: Array<{ key: StyleTab; label: string }> = [
  { key: "presets", label: "Presets" },
  { key: "curve", label: "Curve" },
  { key: "legend", label: "Legend" },
  { key: "publication", label: "Publication" },
  { key: "appearance", label: "Appearance" },
  { key: "colors", label: "Colors" },
];

const loadSavedPlotStyles = (): SavedPlotStyle[] => {
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

const journalPresets: Array<{
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

const figureContentOptions: Array<{
  key: FigureContent;
  label: string;
  recommendedDpi: RasterDpi;
}> = [
  { key: "color", label: "Color", recommendedDpi: 300 },
  { key: "grayscale", label: "Grayscale", recommendedDpi: 600 },
  { key: "lineArt", label: "Line art", recommendedDpi: 1200 },
];

const rasterDpiOptions: RasterDpi[] = [300, 600, 1200];

const pointsToPixels = (points: number, dpi: number): number =>
  Math.max(1, Math.round((points * dpi) / 72));

const pixelsToPoints = (pixels: number, dpi: number): number =>
  (pixels / dpi) * 72;

const pixelsFromMm = (millimeters: number, dpi: number): number =>
  Math.max(1, Math.round((millimeters / MM_PER_INCH) * dpi));

const mmFromPixels = (pixels: number, dpi: number): number =>
  (pixels / dpi) * MM_PER_INCH;

const formatDecimal = (value: number, digits = 1): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0.0";

const axisLabel = (axis: XAxisKey): string =>
  xAxisOptions.find((option) => option.key === axis)?.label ?? "x";

const defaultXAxisUnit = (axis: XAxisKey): string => {
  if (axis === "retentionTime") return "s";
  if (axis === "acqTime" || axis === "activationTime") {
    return "ms";
  }

  if (axis === "wavelength") {
    return "nm";
  }

  return "";
};

const axisTitleWithUnit = (title: string, unit: string): string =>
  unit.trim() ? `${title.trim()} (${unit.trim()})` : title;

const tickFormatValue = (format: TickFormat): string | undefined => {
  if (format === "plain") {
    return ".0f";
  }

  if (format === "scientific") {
    return ".2e";
  }

  return undefined;
};

const normalizeHexColor = (value: string): string | null => {
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

type ColorControlProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

function ColorControl({
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

export function PlotBuilder({ rows, isActive = true, initialSettings = {}, settingsRef }: PlotBuilderProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const [plotError, setPlotError] = useState("");
  const [renderAttempt, setRenderAttempt] = useState(0);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<PlotTab>("data");
  const [activeStyleTab, setActiveStyleTab] = useState<StyleTab>("curve");
  const [xAxis, setXAxis] = useState<XAxisKey>(() => readPlotSetting(initialSettings, "xAxis", "acqTime"));
  const [yMode, setYMode] = useState<YMode>(() => readPlotSetting(initialSettings, "yMode", "absolute"));
  const [title, setTitle] = useState(() => readPlotSetting(initialSettings, "title", "Ion intensity plot"));
  const [showTitle, setShowTitle] = useState(() => readPlotSetting(initialSettings, "showTitle", defaultPlotAppearance.showTitle));
  const [xTitle, setXTitle] = useState(() => readPlotSetting(initialSettings, "xTitle", axisLabel("acqTime")));
  const [xUnit, setXUnit] = useState(() => readPlotSetting(initialSettings, "xUnit", "ms"));
  const [yTitle, setYTitle] = useState(() => readPlotSetting(initialSettings, "yTitle", yMode === "absolute" ? "Absolute intensity" : yMode === "selectedSum" ? "Share of selected ions" : "Intensity / own maximum"));
  const [yUnit, setYUnit] = useState(() => readPlotSetting(initialSettings, "yUnit", yMode !== "absolute" ? "%" : ""));
  const [xValueScale, setXValueScale] = useState<XValueScale>(() => readPlotSetting(initialSettings, "xValueScale", "raw"));
  const [xValueMultiplier, setXValueMultiplier] = useState(() => readPlotSetting(initialSettings, "xValueMultiplier", 1));
  const [xTickFormat, setXTickFormat] = useState<TickFormat>(() => readPlotSetting(initialSettings, "xTickFormat", "auto"));
  const [yTickFormat, setYTickFormat] = useState<TickFormat>(() => readPlotSetting(initialSettings, "yTickFormat", "auto"));
  const [xMin, setXMin] = useState(() => readPlotSetting(initialSettings, "xMin", ""));
  const [xMax, setXMax] = useState(() => readPlotSetting(initialSettings, "xMax", ""));
  const [yMin, setYMin] = useState(() => readPlotSetting(initialSettings, "yMin", ""));
  const [yMax, setYMax] = useState(() => readPlotSetting(initialSettings, "yMax", ""));
  const [showLegend, setShowLegend] = useState(() => readPlotSetting(initialSettings, "showLegend", true));
  const [legendPosition, setLegendPosition] = useState<LegendPosition>(() => readPlotSetting(initialSettings, "legendPosition", defaultPlotAppearance.legendPosition));
  const [legendColumns, setLegendColumns] = useState(() => readPlotSetting(initialSettings, "legendColumns", 0));
  const [highlightOnClick, setHighlightOnClick] = useState(() => readPlotSetting(initialSettings, "highlightOnClick", false));
  const [highlightedIonId, setHighlightedIonId] = useState(() => readPlotSetting(initialSettings, "highlightedIonId", ""));
  const [legendInsideX, setLegendInsideX] = useState(() => readPlotSetting(initialSettings, "legendInsideX", 0.98));
  const [legendInsideY, setLegendInsideY] = useState(() => readPlotSetting(initialSettings, "legendInsideY", 0.98));
  const [forceSingleLegend, setForceSingleLegend] = useState(() => readPlotSetting(initialSettings, "forceSingleLegend", true));
  const [xZoomOnly, setXZoomOnly] = useState(() => readPlotSetting(initialSettings, "xZoomOnly", true));
  const [fontFamily, setFontFamily] = useState<PlotFont>(() => readPlotSetting(initialSettings, "fontFamily", defaultPlotAppearance.fontFamily));
  const [titleSize, setTitleSize] = useState(() => readPlotSetting(initialSettings, "titleSize", defaultPlotAppearance.titleSize));
  const [axisTitleSize, setAxisTitleSize] = useState(() => readPlotSetting(initialSettings, "axisTitleSize", defaultPlotAppearance.axisTitleSize));
  const [tickSize, setTickSize] = useState(() => readPlotSetting(initialSettings, "tickSize", defaultPlotAppearance.tickSize));
  const [legendSize, setLegendSize] = useState(() => readPlotSetting(initialSettings, "legendSize", defaultPlotAppearance.legendSize));
  const [showGrid, setShowGrid] = useState(() => readPlotSetting(initialSettings, "showGrid", false));
  const [showAxisBox, setShowAxisBox] = useState(() => readPlotSetting(initialSettings, "showAxisBox", true));
  const [axisLineWidth, setAxisLineWidth] = useState(() => readPlotSetting(initialSettings, "axisLineWidth", 2));
  const [lineWidth, setLineWidth] = useState(() => readPlotSetting(initialSettings, "lineWidth", defaultPlotAppearance.lineWidth));
  const [markerSize, setMarkerSize] = useState(() => readPlotSetting(initialSettings, "markerSize", defaultPlotAppearance.markerSize));
  const [lineShape, setLineShape] = useState<LineShape>(() => readPlotSetting(initialSettings, "lineShape", "linear"));
  const [curveMode, setCurveMode] = useState<CurveMode>(() => readPlotSetting(initialSettings, "curveMode", "connect"));
  const [polynomialDegree, setPolynomialDegree] = useState(() => readPlotSetting(initialSettings, "polynomialDegree", 3));
  const [movingAverageWindow, setMovingAverageWindow] = useState(() => readPlotSetting(initialSettings, "movingAverageWindow", 5));
  const [previewExportRatio, setPreviewExportRatio] = useState(() => readPlotSetting(initialSettings, "previewExportRatio", true));
  const [plotHeight, setPlotHeight] = useState(() => readPlotSetting(initialSettings, "plotHeight", 640));
  const [exportWidth, setExportWidth] = useState(() => readPlotSetting(initialSettings, "exportWidth", defaultPlotAppearance.exportWidth));
  const [exportHeight, setExportHeight] = useState(() => readPlotSetting(initialSettings, "exportHeight", defaultPlotAppearance.exportHeight));
  const [journalPreset, setJournalPreset] =
    useState<JournalPresetKey>(() => readPlotSetting(initialSettings, "journalPreset", "jasms-single"));
  const [figureContent, setFigureContent] = useState<FigureContent>(() => readPlotSetting(initialSettings, "figureContent", "color"));
  const [rasterDpi, setRasterDpi] = useState<RasterDpi>(() => readPlotSetting(initialSettings, "rasterDpi", 300));
  const [finalWidthMm, setFinalWidthMm] = useState(() => readPlotSetting(initialSettings, "finalWidthMm", 84.6));
  const [journalStatus, setJournalStatus] = useState(() => readPlotSetting(initialSettings, "journalStatus", ""));
  const [axisColor, setAxisColor] = useState(() => readPlotSetting(initialSettings, "axisColor", "#111111"));
  const [gridColor, setGridColor] = useState(() => readPlotSetting(initialSettings, "gridColor", "#d7d7d7"));
  const [plotBackground, setPlotBackground] = useState(() => readPlotSetting(initialSettings, "plotBackground", "#ffffff"));
  const [paperBackground, setPaperBackground] = useState(() => readPlotSetting(initialSettings, "paperBackground", "#ffffff"));
  const [traceColors, setTraceColors] = useState<Record<string, string>>(() => readPlotSetting(initialSettings, "traceColors", {}));
  const [savedPlotStyles, setSavedPlotStyles] =
    useState<SavedPlotStyle[]>(loadSavedPlotStyles);
  const [stylePresetName, setStylePresetName] = useState("");
  const [selectedStylePresetId, setSelectedStylePresetId] = useState("");
  const [stylePresetStatus, setStylePresetStatus] = useState("");
  const [previewAreaWidth, setPreviewAreaWidth] = useState(0);
  const [previewAreaHeight, setPreviewAreaHeight] = useState(0);

  useEffect(() => { settingsRef.current = { xAxis, yMode, title, showTitle, xTitle, xUnit, yTitle, yUnit, xValueScale, xValueMultiplier, xTickFormat, yTickFormat, xMin, xMax, yMin, yMax, showLegend, legendPosition, legendColumns, highlightOnClick, highlightedIonId, legendInsideX, legendInsideY, forceSingleLegend, xZoomOnly, fontFamily, titleSize, axisTitleSize, tickSize, legendSize, showGrid, showAxisBox, axisLineWidth, lineWidth, markerSize, lineShape, curveMode, polynomialDegree, movingAverageWindow, previewExportRatio, plotHeight, exportWidth, exportHeight, journalPreset, figureContent, rasterDpi, finalWidthMm, axisColor, gridColor, plotBackground, paperBackground, traceColors }; });

  const shouldShowLegend =
    showLegend && (forceSingleLegend || new Set(rows.map((row) => row.ionId)).size > 1);
  const hasVisibleTitle = showTitle && title.trim().length > 0;

  const ionOptions = useMemo(() => {
    const options = new Map<
      string,
      { ionId: string; name: string; fallbackColor: string }
    >();

    rows.forEach((row) => {
      if (!options.has(row.ionId)) {
        options.set(row.ionId, {
          ionId: row.ionId,
          name: traceName(row.targetMz, row.label),
          fallbackColor: defaultTraceColors[options.size % defaultTraceColors.length],
        });
      }
    });

    return Array.from(options.values());
  }, [rows]);

  const plotData = useMemo(
    () =>
      buildPlotData(rows, xAxis, yMode, shouldShowLegend, {
        colors: traceColors,
        lineWidth,
        markerSize,
        lineShape,
        curveMode,
        polynomialDegree,
        movingAverageWindow,
        highlightedIonId: highlightOnClick ? highlightedIonId : undefined,
      }, xValueMultiplier),
    [
      curveMode,
      lineShape,
      lineWidth,
      markerSize,
      polynomialDegree,
      movingAverageWindow,
      highlightOnClick,
      highlightedIonId,
      rows,
      shouldShowLegend,
      traceColors,
      xAxis,
      xValueMultiplier,
      yMode,
    ],
  );

  const safeExportWidth =
    Number.isFinite(exportWidth) && exportWidth > 0 ? exportWidth : 1;
  const safeExportHeight =
    Number.isFinite(exportHeight) && exportHeight > 0 ? exportHeight : 1;
  const selectedJournalPreset =
    journalPresets.find((preset) => preset.key === journalPreset) ??
    journalPresets[0];
  const selectedFigureContent =
    figureContentOptions.find((option) => option.key === figureContent) ??
    figureContentOptions[0];
  const outputWidthMm = mmFromPixels(safeExportWidth, rasterDpi);
  const outputHeightMm = mmFromPixels(safeExportHeight, rasterDpi);
  const smallestFontPt = Math.min(
    pixelsToPoints(axisTitleSize, rasterDpi),
    pixelsToPoints(tickSize, rasterDpi),
    ...(hasVisibleTitle ? [pixelsToPoints(titleSize, rasterDpi)] : []),
    ...(shouldShowLegend ? [pixelsToPoints(legendSize, rasterDpi)] : []),
  );
  const smallestLinePt = Math.min(
    pixelsToPoints(axisLineWidth, rasterDpi),
    pixelsToPoints(lineWidth, rasterDpi),
  );

  const previewScale = useMemo(() => {
    if (!previewExportRatio) {
      return 1;
    }

    const maxPreviewWidth =
      previewAreaWidth > 0 ? previewAreaWidth : safeExportWidth;
    const maxPreviewHeight = Math.max(
      180,
      previewAreaHeight > 0
        ? Math.min(plotHeight, previewAreaHeight)
        : plotHeight,
    );
    const scale = Math.min(
      1,
      maxPreviewWidth / safeExportWidth,
      maxPreviewHeight / safeExportHeight,
    );

    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, [
    plotHeight,
    previewAreaHeight,
    previewAreaWidth,
    previewExportRatio,
    safeExportHeight,
    safeExportWidth,
  ]);

  const previewFrameWidth = Math.max(
    1,
    Math.round(safeExportWidth * previewScale),
  );
  const previewFrameHeight = Math.max(
    1,
    Math.round(safeExportHeight * previewScale),
  );
  const plotRenderWidth = previewExportRatio ? safeExportWidth : undefined;
  const plotRenderHeight = previewExportRatio ? safeExportHeight : plotHeight;

  const xDataBounds = useMemo(() => numericBounds(plotData.flatMap(trace => trace.x)), [plotData]);
  const yDataBounds = useMemo(() => numericBounds(plotData.flatMap(trace => trace.y)), [plotData]);
  const xAxisRange = useMemo(() => axisRange(xMin, xMax, xDataBounds), [xMin, xMax, xDataBounds]);
  const yAxisRange = useMemo(() => axisRange(yMin, yMax, yDataBounds), [yMin, yMax, yDataBounds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STYLE_PRESETS_STORAGE_KEY,
        JSON.stringify(savedPlotStyles),
      );
    } catch {
      setStylePresetStatus("Could not save presets in this browser");
    }
  }, [savedPlotStyles]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const previewAreaElement = previewAreaRef.current;
    if (!previewAreaElement) {
      return;
    }

    const updatePreviewAreaSize = () => {
      setPreviewAreaWidth(previewAreaElement.clientWidth);
      setPreviewAreaHeight(previewAreaElement.clientHeight);
    };

    updatePreviewAreaSize();

    const resizeObserver = new ResizeObserver(updatePreviewAreaSize);
    resizeObserver.observe(previewAreaElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const plotElement = plotRef.current;
    if (!plotElement) {
      return;
    }

    if (xAxisRange.error || yAxisRange.error) return;
    const xTickFormatValue = tickFormatValue(xTickFormat);
    const yTickFormatValue = tickFormatValue(yTickFormat);
    const legendSpace = legendGeometry(legendPosition,
      shouldShowLegend ? plotData.filter(trace => trace.showlegend).map(trace => trace.name) : [],
      plotRenderWidth ?? (previewAreaWidth || safeExportWidth), plotRenderHeight, legendSize,
      legendColumns, hasVisibleTitle, legendInsideX, legendInsideY);
    const internalLegend = legendPosition === "inside" || legendPosition === "insideTop"
      ? insideLegendColumns(plotData, legendSpace.columns,
          (plotRenderWidth ?? (previewAreaWidth || safeExportWidth)) - legendSpace.margin.l - legendSpace.margin.r,
          legendSize, legendPosition === "insideTop" ? 0.02 : legendInsideX,
          legendPosition === "insideTop" ? 0.98 : legendInsideY)
      : undefined;
    const legendStyle = {
      uirevision: highlightOnClick ? "highlight" : "visibility",
      font: { size: legendSize, family: fontFamily, color: axisColor },
    };

    const layout = {
      title: hasVisibleTitle
        ? {
            text: title,
            font: { size: titleSize, family: fontFamily },
            xref: "paper",
            x: 0.5,
            xanchor: "center",
          }
        : undefined,
      xaxis: {
        title: {
          text: axisTitleWithUnit(xTitle, xUnit),
          font: { size: axisTitleSize, family: fontFamily },
        },
        automargin: true,
        ...axisRangeLayout(xAxisRange.range),
        tickformat: xTickFormatValue,
        showgrid: showGrid,
        gridcolor: gridColor,
        showline: showAxisBox,
        mirror: showAxisBox ? "ticks" : false,
        linewidth: axisLineWidth,
        linecolor: axisColor,
        ticks: "outside",
        ticklen: 5,
        tickwidth: axisLineWidth,
        tickcolor: axisColor,
        tickfont: { size: tickSize, family: fontFamily, color: axisColor },
        zeroline: false,
      },
      yaxis: {
        title: {
          text: axisTitleWithUnit(yTitle, yUnit),
          font: { size: axisTitleSize, family: fontFamily },
        },
        automargin: true,
        fixedrange: xZoomOnly,
        ...axisRangeLayout(yAxisRange.range),
        tickformat: yTickFormatValue,
        showgrid: showGrid,
        gridcolor: gridColor,
        showline: showAxisBox,
        mirror: showAxisBox ? "ticks" : false,
        linewidth: axisLineWidth,
        linecolor: axisColor,
        ticks: "outside",
        ticklen: 5,
        tickwidth: axisLineWidth,
        tickcolor: axisColor,
        tickfont: { size: tickSize, family: fontFamily, color: axisColor },
        zeroline: showGrid,
        zerolinecolor: gridColor,
      },
      dragmode: "zoom",
      showlegend: shouldShowLegend,
      legend: {
        ...legendSpace.legend,
        ...legendStyle,
      },
      ...Object.fromEntries(Object.entries(internalLegend?.legends ?? {}).map(([name, options]) => [name, { ...options, ...legendStyle }])),
      margin: legendSpace.margin,
      autosize: !previewExportRatio,
      ...(plotRenderWidth ? { width: plotRenderWidth } : {}),
      height: plotRenderHeight,
      paper_bgcolor: paperBackground,
      plot_bgcolor: plotBackground,
      font: {
        family: fontFamily,
        size: tickSize,
        color: axisColor,
      },
      hovermode: "closest",
      uirevision: JSON.stringify([xAxis, yMode, xValueMultiplier, xMin, xMax, yMin, yMax, renderAttempt, rows.length, rows[0]?.id, rows[rows.length - 1]?.id]),
    };

    const interactive = plotElement as InteractivePlotElement;
    const selectIon = (index: number | undefined) => {
      if (index === undefined) return;
      const ionId = plotData[index]?.meta.ionId;
      if (ionId) setHighlightedIonId(current => current === ionId ? "" : ionId);
    };
    const legendClick = (event: PlotInteraction) => {
      if (!highlightOnClick) return;
      selectIon(event.curveNumber);
      return false;
    };
    const legendDoubleClick = () => highlightOnClick ? false : undefined;
    const pointClick = (event: PlotInteraction) => {
      if (highlightOnClick) selectIon(event.points?.[0]?.curveNumber);
    };
    let listenersAttached = false;
    const task = queuePlotTask(renderQueue.current, async isCurrent => {
      setPlotError("");
      await Plotly.react(plotElement, internalLegend?.data ?? plotData, layout, {
        responsive: !previewExportRatio,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        scrollZoom: true,
        doubleClick: "reset",
      });
      if (!isCurrent()) return;
      listenersAttached = true;
      interactive.on("plotly_legendclick", legendClick);
      interactive.on("plotly_legenddoubleclick", legendDoubleClick);
      interactive.on("plotly_click", pointClick);
    }, error => {
      console.error("Plot update failed", error);
      setPlotError(error instanceof Error ? error.message : "Could not draw the plot");
    });
    renderQueue.current = task.done;

    return () => {
      task.cancel();
      if (listenersAttached) {
        interactive.removeListener?.("plotly_legendclick", legendClick);
        interactive.removeListener?.("plotly_legenddoubleclick", legendDoubleClick);
        interactive.removeListener?.("plotly_click", pointClick);
      }
    };
  }, [
    axisColor,
    axisLineWidth,
    axisTitleSize,
    fontFamily,
    gridColor,
    hasVisibleTitle,
    isActive,
    renderAttempt,
    legendInsideX,
    legendInsideY,
    legendPosition,
    legendColumns,
    highlightOnClick,
    rows,
    xAxis,
    yMode,
    xValueMultiplier,
    previewAreaWidth,
    safeExportWidth,
    legendSize,
    paperBackground,
    plotData,
    plotBackground,
    plotHeight,
    plotRenderHeight,
    plotRenderWidth,
    previewExportRatio,
    shouldShowLegend,
    showAxisBox,
    showGrid,
    tickSize,
    title,
    titleSize,
    xZoomOnly,
    xDataBounds,
    xAxisRange,
    yAxisRange,
    xMax,
    xMin,
    xTickFormat,
    xTitle,
    xUnit,
    yMax,
    yDataBounds,
    yMin,
    yTickFormat,
    yTitle,
    yUnit,
  ]);

  useEffect(() => {
    const element = plotRef.current;
    return () => {
      if (!element) return;
      // Wait for any in-flight render before destroying its graph resources.
      renderQueue.current = queuePlotTask(renderQueue.current, () => Plotly.purge(element),
        error => console.error("Plot cleanup failed", error)).done;
    };
  }, []);

  const applyPaperStyle = () => {
    setFontFamily("Arial");
    setShowTitle(true);
    setTitleSize(20);
    setAxisTitleSize(18);
    setTickSize(15);
    setLegendSize(14);
    setShowGrid(false);
    setShowAxisBox(true);
    setAxisLineWidth(2);
    setLineWidth(2.8);
    setMarkerSize(5);
    setLineShape("linear");
    setCurveMode("connect");
    setPolynomialDegree(3);
    setPreviewExportRatio(true);
    setPlotHeight(640);
    setExportWidth(1000);
    setExportHeight(760);
    setAxisColor("#111111");
    setGridColor("#d7d7d7");
    setPlotBackground("#ffffff");
    setPaperBackground("#ffffff");
  };

  const applyDefaultStyle = () => {
    setFontFamily(defaultPlotAppearance.fontFamily);
    setShowTitle(defaultPlotAppearance.showTitle);
    setTitleSize(defaultPlotAppearance.titleSize);
    setAxisTitleSize(defaultPlotAppearance.axisTitleSize);
    setTickSize(defaultPlotAppearance.tickSize);
    setLegendSize(defaultPlotAppearance.legendSize);
    setLineWidth(defaultPlotAppearance.lineWidth);
    setMarkerSize(defaultPlotAppearance.markerSize);
    setExportWidth(defaultPlotAppearance.exportWidth);
    setExportHeight(defaultPlotAppearance.exportHeight);
    setLegendPosition(defaultPlotAppearance.legendPosition);
    setLegendColumns(defaultPlotAppearance.legendColumns);
    setHighlightOnClick(false); setHighlightedIonId("");
    setShowLegend(true); setShowGrid(false); setShowAxisBox(true);
    setAxisLineWidth(2); setPreviewExportRatio(true);
    setAxisColor("#111111"); setPlotBackground("#ffffff"); setPaperBackground("#ffffff");
    setStylePresetStatus("Default Arial appearance applied");
  };

  const applyMonoMagentaPalette = () => {
    setTraceColors(
      Object.fromEntries(
        ionOptions.map((option, index) => [
          option.ionId,
          index === 0 ? "#000000" : "#8a008a",
        ]),
      ),
    );
  };

  const resetTraceColors = () => {
    setTraceColors({});
  };

  const currentStyleSettings = (): PlotStyleSettings => ({
    fontFamily,
    showTitle,
    titleSize,
    axisTitleSize,
    tickSize,
    legendSize,
    showLegend,
    legendPosition,
    legendColumns,
    highlightOnClick,
    legendInsideX,
    legendInsideY,
    forceSingleLegend,
    showGrid,
    showAxisBox,
    axisLineWidth,
    lineWidth,
    markerSize,
    lineShape,
    curveMode,
    polynomialDegree,
    movingAverageWindow,
    previewExportRatio,
    plotHeight,
    exportWidth: safeExportWidth,
    exportHeight: safeExportHeight,
    figureContent,
    rasterDpi,
    finalWidthMm,
    axisColor,
    gridColor,
    plotBackground,
    paperBackground,
    tracePalette: ionOptions.map(
      (option) => traceColors[option.ionId] ?? option.fallbackColor,
    ),
  });

  const saveCurrentStyle = () => {
    const name = stylePresetName.trim();
    if (!name) {
      setStylePresetStatus("Enter a name for the style");
      return;
    }

    const existingPreset = savedPlotStyles.find(
      (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const preset: SavedPlotStyle = {
      id:
        existingPreset?.id ??
        `style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      settings: currentStyleSettings(),
    };

    setSavedPlotStyles((currentPresets) =>
      existingPreset
        ? currentPresets.map((currentPreset) =>
            currentPreset.id === existingPreset.id ? preset : currentPreset,
          )
        : [...currentPresets, preset],
    );
    setSelectedStylePresetId(preset.id);
    setStylePresetStatus(
      existingPreset ? "Style preset updated" : "Style preset saved",
    );
  };

  const applySavedStyle = () => {
    const preset = savedPlotStyles.find(
      (savedPreset) => savedPreset.id === selectedStylePresetId,
    );
    if (!preset) {
      setStylePresetStatus("Choose a saved style");
      return;
    }

    const settings = preset.settings;
    setFontFamily(settings.fontFamily);
    setShowTitle(settings.showTitle ?? true);
    setTitleSize(settings.titleSize);
    setAxisTitleSize(settings.axisTitleSize);
    setTickSize(settings.tickSize);
    setLegendSize(settings.legendSize);
    setShowLegend(settings.showLegend);
    setLegendPosition(settings.legendPosition);
    setLegendColumns(settings.legendColumns ?? 0);
    setHighlightOnClick(settings.highlightOnClick ?? false);
    setHighlightedIonId("");
    setLegendInsideX(settings.legendInsideX);
    setLegendInsideY(settings.legendInsideY);
    setForceSingleLegend(settings.forceSingleLegend);
    setShowGrid(settings.showGrid);
    setShowAxisBox(settings.showAxisBox);
    setAxisLineWidth(settings.axisLineWidth);
    setLineWidth(settings.lineWidth);
    setMarkerSize(settings.markerSize);
    setLineShape(settings.lineShape);
    setCurveMode(settings.curveMode ?? "connect");
    setPolynomialDegree(settings.polynomialDegree ?? 3);
    setMovingAverageWindow(settings.movingAverageWindow ?? 5);
    setPreviewExportRatio(settings.previewExportRatio);
    setPlotHeight(settings.plotHeight);
    setExportWidth(settings.exportWidth);
    setExportHeight(settings.exportHeight);
    setFigureContent(settings.figureContent);
    setRasterDpi(settings.rasterDpi);
    setFinalWidthMm(settings.finalWidthMm);
    setAxisColor(settings.axisColor);
    setGridColor(settings.gridColor);
    setPlotBackground(settings.plotBackground);
    setPaperBackground(settings.paperBackground);
    setTraceColors(
      settings.tracePalette.length > 0
        ? Object.fromEntries(
            ionOptions.map((option, index) => [
              option.ionId,
              settings.tracePalette[index % settings.tracePalette.length],
            ]),
          )
        : {},
    );
    setStylePresetName(preset.name);
    setStylePresetStatus("Style preset applied");
  };

  const deleteSavedStyle = () => {
    const preset = savedPlotStyles.find(
      (savedPreset) => savedPreset.id === selectedStylePresetId,
    );
    if (!preset) {
      return;
    }

    if (!window.confirm(`Delete the style preset "${preset.name}"?`)) {
      return;
    }

    setSavedPlotStyles((currentPresets) =>
      currentPresets.filter((currentPreset) => currentPreset.id !== preset.id),
    );
    setSelectedStylePresetId("");
    setStylePresetName("");
    setStylePresetStatus("Style preset deleted");
  };

  const updateXAxis = (nextAxis: XAxisKey) => {
    setXAxis(nextAxis);
    setXTitle(axisLabel(nextAxis));
    setXUnit(defaultXAxisUnit(nextAxis));
    setXValueScale("raw");
    setXValueMultiplier(1);
    setXMin("");
    setXMax("");
  };

  const updateXValueScale = (nextScale: XValueScale) => {
    setXValueScale(nextScale);
    setXMin("");
    setXMax("");

    if (nextScale === "raw") {
      setXValueMultiplier(1);
      setXUnit(defaultXAxisUnit(xAxis));
    }

    if (nextScale === "msToSeconds") {
      setXValueMultiplier(0.001);
      setXUnit("s");
    }
    if (nextScale === "secondsToMinutes") {
      setXValueMultiplier(1 / 60);
      setXUnit("min");
    }
  };

  const applyIrradiationTimeAxis = () => {
    setXAxis("acqTime");
    setXTitle("Irradiation Time");
    setXUnit("s");
    setXTickFormat("plain");
    setXValueScale("msToSeconds");
    setXValueMultiplier(0.001);
    setXMin("");
    setXMax("");
  };

  const setPublicationOutput = (widthMm: number, dpi: RasterDpi) => {
    const nextWidthMm =
      Number.isFinite(widthMm) && widthMm > 0
        ? widthMm
        : selectedJournalPreset.widthMm;
    const aspectRatio = safeExportHeight / safeExportWidth || 1;
    const nextWidthPx = pixelsFromMm(nextWidthMm, dpi);

    setFinalWidthMm(nextWidthMm);
    setRasterDpi(dpi);
    setExportWidth(nextWidthPx);
    setExportHeight(Math.max(1, Math.round(nextWidthPx * aspectRatio)));
  };

  const updateFigureContent = (nextContent: FigureContent) => {
    const recommendedDpi =
      figureContentOptions.find((option) => option.key === nextContent)
        ?.recommendedDpi ?? rasterDpi;

    setFigureContent(nextContent);
    setPublicationOutput(finalWidthMm, recommendedDpi);
  };

  const updateRasterDpi = (nextDpi: RasterDpi) => {
    setPublicationOutput(finalWidthMm, nextDpi);
  };

  const updateFinalWidthMm = (nextWidthMm: number) => {
    setPublicationOutput(nextWidthMm, rasterDpi);
  };

  const updateExportWidth = (nextWidth: number) => {
    setExportWidth(nextWidth);

    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      setFinalWidthMm(mmFromPixels(nextWidth, rasterDpi));
    }
  };

  const applyJournalPreset = () => {
    const dpi = selectedFigureContent.recommendedDpi;

    setFontFamily("Arial");
    setShowTitle(true);
    setTitleSize(pointsToPixels(8, dpi));
    setAxisTitleSize(pointsToPixels(8, dpi));
    setTickSize(pointsToPixels(7, dpi));
    setLegendSize(pointsToPixels(7, dpi));
    setShowGrid(false);
    setShowAxisBox(true);
    setAxisLineWidth(pointsToPixels(0.6, dpi));
    setLineWidth(pointsToPixels(0.7, dpi));
    setMarkerSize(pointsToPixels(1.1, dpi));
    setLineShape("linear");
    setCurveMode("connect");
    setPolynomialDegree(3);
    setPreviewExportRatio(true);
    setPlotHeight(720);
    setAxisColor("#111111");
    setGridColor("#d7d7d7");
    setPlotBackground("#ffffff");
    setPaperBackground("#ffffff");
    setPublicationOutput(selectedJournalPreset.widthMm, dpi);
    setJournalStatus("Journal preset applied");
  };

  const checkJournalCompliance = () => {
    const issues: string[] = [];

    if (outputWidthMm > selectedJournalPreset.widthMm + 0.1) {
      issues.push(
        `width is ${formatDecimal(outputWidthMm)} mm, above ${selectedJournalPreset.widthMm} mm`,
      );
    }

    if (outputHeightMm > selectedJournalPreset.maxHeightMm + 0.1) {
      issues.push(
        `height is ${formatDecimal(outputHeightMm)} mm, above ${selectedJournalPreset.maxHeightMm} mm`,
      );
    }

    if (smallestFontPt < selectedJournalPreset.minFontPt) {
      issues.push(
        `smallest font is ${formatDecimal(smallestFontPt)} pt, below ${selectedJournalPreset.minFontPt} pt`,
      );
    }

    if (smallestLinePt < selectedJournalPreset.minLinePt) {
      issues.push(
        `smallest line is ${formatDecimal(smallestLinePt)} pt, below ${selectedJournalPreset.minLinePt} pt`,
      );
    }

    if (rasterDpi < selectedFigureContent.recommendedDpi) {
      issues.push(
        `${selectedFigureContent.label.toLowerCase()} figures should use at least ${selectedFigureContent.recommendedDpi} dpi`,
      );
    }

    setJournalStatus(
      issues.length > 0
        ? issues.join(" - ")
        : "Looks within the selected JASMS checks",
    );
  };

  const setRangeToDataLimits = () => {
    const xLimits = xDataBounds?.[0] === xDataBounds?.[1] ? axisRange("", "", xDataBounds).range : xDataBounds;
    const yLimits = yDataBounds?.[0] === yDataBounds?.[1] ? axisRange("", "", yDataBounds).range : yDataBounds;
    if (xLimits) {
      setXMin(String(xLimits[0]));
      setXMax(String(xLimits[1]));
    } else {
      setXMin("");
      setXMax("");
    }

    if (yLimits) {
      setYMin(String(yLimits[0]));
      setYMax(String(yLimits[1]));
    } else {
      setYMin("");
      setYMax("");
    }
    setRenderAttempt(value => value + 1);
  };

  const clearAxisRanges = () => {
    setXMin("");
    setXMax("");
    setYMin("");
    setYMax("");
    setRenderAttempt(value => value + 1);
  };

  const exportPng = () => {
    if (!plotRef.current || plotData.length === 0) {
      return;
    }

    void Plotly.downloadImage(plotRef.current, {
      format: "png",
      filename: "pd-ms-plot",
      width: safeExportWidth,
      height: safeExportHeight,
      scale: 1,
    });
  };

  const exportPlotCsv = (format: "csv" | "txt" = "csv") => {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      `pd-ms-plot-data.${format}`,
      plotRowsToCsv(
        rows,
        xAxis,
        yMode,
        xValueMultiplier,
        axisTitleWithUnit(xTitle, xUnit),
        format === "txt" ? "\t" : ",",
        curveMode === "movingAverage" ? movingAverageWindow : undefined,
      ),
      format === "txt" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8",
    );
  };

  return (
    <section className="workspace-section plot-workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Visualization</p>
          <h2>Plot</h2>
        </div>
        <div className="plot-export-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportPlotCsv()}
            disabled={rows.length === 0}
          >
            <Download size={16} aria-hidden="true" />
            <span>Export plot CSV</span>
          </button>
          <button type="button" className="secondary-button" onClick={() => exportPlotCsv("txt")} disabled={rows.length === 0}>Export plot TXT</button>
          <button
            type="button"
            className="secondary-button"
            onClick={exportPng}
            disabled={plotData.length === 0}
          >
            <Download size={16} aria-hidden="true" />
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      <div className="plot-workbench">
        <aside className="plot-settings-panel" aria-label="Plot settings">
          <div className="plot-tabs" role="tablist" aria-label="Plot settings">
            <button
              type="button"
              className={activeTab === "data" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("data")}
            >
              Data
            </button>
            <button
              type="button"
              className={activeTab === "style" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("style")}
            >
              Style
            </button>
          </div>

          {activeTab === "data" ? (
            <div className="plot-menu">
            <div className="plot-control-group">
              <h3>Text and axes</h3>
              <div className="plot-controls">
                <label>
                  <span>x axis</span>
                  <select
                    value={xAxis}
                    onChange={(event) =>
                      updateXAxis(event.target.value as XAxisKey)
                    }
                  >
                    {xAxisOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>y axis</span>
                  <select
                    value={yMode}
                    onChange={(event) => {
                      const mode = event.target.value as YMode;
                      setYMode(mode);
                      // A percentage range would clip an absolute-intensity plot.
                      setYMin("");
                      setYMax("");
                      setYTitle(mode === "absolute" ? "Absolute intensity" : mode === "selectedSum" ? "Share of selected ions" : "Intensity / own maximum");
                      setYUnit(mode !== "absolute" ? "%" : "");
                    }}
                  >
                    {yModeOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="fit-guidance">{yMode === "selectedSum" ? "For each file/segment: 100 × ion intensity / sum of all targets in Ions. Changing the ion list changes the percentages. Hiding a curve in the legend does not change the denominator. An all-zero segment is shown as zero." : yMode === "relative" ? "Each ion is divided by its own maximum across the plotted files. This compares temporal profiles, not relative abundance between ions." : "Extracted intensity before normalization."}</p>

                <label>
                  <span>Plot title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={!showTitle}
                  />
                </label>

                <label className="checkbox-label plot-title-toggle">
                  <input
                    type="checkbox"
                    checked={showTitle}
                    onChange={(event) => setShowTitle(event.target.checked)}
                  />
                  <span>Show plot title</span>
                </label>

                <label>
                  <span>x title</span>
                  <input
                    value={xTitle}
                    onChange={(event) => setXTitle(event.target.value)}
                  />
                </label>

                <label>
                  <span>y title</span>
                  <input
                    value={yTitle}
                    onChange={(event) => setYTitle(event.target.value)}
                  />
                </label>

                <label>
                  <span>x unit</span>
                  <input
                    value={xUnit}
                    onChange={(event) => setXUnit(event.target.value)}
                    placeholder="ms"
                  />
                </label>

                <label>
                  <span>x value scale</span>
                  <select
                    value={xValueScale}
                    onChange={(event) =>
                      updateXValueScale(event.target.value as XValueScale)
                    }
                  >
                    <option value="raw">Raw values</option>
                    <option value="msToSeconds">ms to s</option>
                    <option value="secondsToMinutes">s to min</option>
                    <option value="custom">Custom multiplier</option>
                  </select>
                </label>

                <label>
                  <span>x multiplier</span>
                  <input
                    type="number"
                    step="0.001"
                    value={xValueMultiplier}
                    onChange={(event) => {
                      setXValueScale("custom");
                      setXValueMultiplier(Number(event.target.value));
                      setXMin("");
                      setXMax("");
                    }}
                  />
                </label>

                <div className="control-button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={applyIrradiationTimeAxis}
                  >
                    Irradiation Time (s)
                  </button>
                </div>

                <label>
                  <span>y unit</span>
                  <input
                    value={yUnit}
                    onChange={(event) => setYUnit(event.target.value)}
                    placeholder="%"
                  />
                </label>
              </div>
            </div>

            <div className="plot-control-group">
              <h3>Ticks and range</h3>
              <p>Blank limits fit the curves with a small margin. Entered limits are exact, including zero.</p>
              {(xAxisRange.error || yAxisRange.error) && <p role="alert">{xAxisRange.error ? `x axis: ${xAxisRange.error} ` : ""}{yAxisRange.error ? `y axis: ${yAxisRange.error}` : ""}</p>}
              <div className="axis-range-controls">
                <label>
                  <span>x ticks</span>
                  <select
                    value={xTickFormat}
                    onChange={(event) =>
                      setXTickFormat(event.target.value as TickFormat)
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="plain">Plain numbers</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </label>

                <label>
                  <span>y ticks</span>
                  <select
                    value={yTickFormat}
                    onChange={(event) =>
                      setYTickFormat(event.target.value as TickFormat)
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="plain">Plain numbers</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </label>

                <label>
                  <span>x min</span>
                  <input
                    type="number"
                    value={xMin}
                    onChange={(event) => setXMin(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>x max</span>
                  <input
                    type="number"
                    value={xMax}
                    onChange={(event) => setXMax(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>y min</span>
                  <input
                    type="number"
                    value={yMin}
                    onChange={(event) => setYMin(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>y max</span>
                  <input
                    type="number"
                    value={yMax}
                    onChange={(event) => setYMax(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <div className="control-button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={setRangeToDataLimits}
                  >
                    Data limits
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearAxisRanges}
                  >
                    Clear range
                  </button>
                </div>
              </div>
            </div>

            <div className="plot-control-group">
              <h3>Zoom</h3>
              <div className="style-switches">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={xZoomOnly}
                    onChange={(event) => setXZoomOnly(event.target.checked)}
                  />
                  <span>Lock y axis zoom</span>
                </label>
              </div>
            </div>
            </div>
          ) : (
            <div className="style-panel">
          <div className="style-subtabs" role="tablist" aria-label="Style settings">
            {styleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeStyleTab === tab.key}
                className={
                  activeStyleTab === tab.key
                    ? "style-subtab-button active"
                    : "style-subtab-button"
                }
                onClick={() => setActiveStyleTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "presets"}
          >
            <h3>Journal and saved styles</h3>
            <p className="control-subheading">Journal</p>
            <div className="style-grid publication-grid">
              <label>
                <span>Journal preset</span>
                <select
                  value={journalPreset}
                  onChange={(event) =>
                    setJournalPreset(event.target.value as JournalPresetKey)
                  }
                >
                  {journalPresets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Figure content</span>
                <select
                  value={figureContent}
                  onChange={(event) =>
                    updateFigureContent(event.target.value as FigureContent)
                  }
                >
                  {figureContentOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="publication-guidelines">
              {selectedJournalPreset.widthMm} mm wide -{" "}
              {selectedJournalPreset.maxHeightMm} mm max height - minimum font{" "}
              {selectedJournalPreset.minFontPt} pt - minimum line{" "}
              {selectedJournalPreset.minLinePt} pt -{" "}
              {selectedFigureContent.recommendedDpi} dpi recommended
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={applyJournalPreset}
            >
              Apply journal preset
            </button>

            <button type="button" className="secondary-button" onClick={applyDefaultStyle}>Use default Arial style</button>

            <div className="saved-style-section">
              <p className="control-subheading">My saved styles</p>
              <label className="saved-style-name">
                <span>Style name</span>
                <input
                  value={stylePresetName}
                  onChange={(event) => setStylePresetName(event.target.value)}
                  placeholder="e.g. thesis figure"
                />
              </label>

              <button
                type="button"
                className="secondary-button"
                onClick={saveCurrentStyle}
                disabled={!stylePresetName.trim()}
              >
                <Save size={16} aria-hidden="true" />
                <span>Save current style</span>
              </button>

              <label className="saved-style-name">
                <span>Saved styles</span>
                <select
                  value={selectedStylePresetId}
                  onChange={(event) => {
                    const presetId = event.target.value;
                    const preset = savedPlotStyles.find(
                      (savedPreset) => savedPreset.id === presetId,
                    );
                    setSelectedStylePresetId(presetId);
                    setStylePresetName(preset?.name ?? "");
                    setStylePresetStatus("");
                  }}
                  disabled={savedPlotStyles.length === 0}
                >
                  <option value="">
                    {savedPlotStyles.length === 0
                      ? "No saved styles yet"
                      : "Choose a saved style"}
                  </option>
                  {savedPlotStyles.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="control-button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={applySavedStyle}
                  disabled={!selectedStylePresetId}
                >
                  Apply style
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={deleteSavedStyle}
                  disabled={!selectedStylePresetId}
                  aria-label="Delete saved style"
                  title="Delete saved style"
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>

              {stylePresetStatus ? (
                <span className="inline-status" aria-live="polite">
                  {stylePresetStatus}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "legend"}
          >
            <h3>Legend</h3>
            <div className="legend-controls">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(event) => setShowLegend(event.target.checked)}
                />
                <span>Show legend</span>
              </label>

              <label>
                <span>Legend position</span>
                <select
                  value={legendPosition}
                  onChange={(event) =>
                    setLegendPosition(event.target.value as LegendPosition)
                  }
                >
                  <option value="insideTop">Inside · top (default)</option>
                  <option value="auto">Automatic · outside curves</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="inside">Inside · custom position</option>
                </select>
              </label>

              {(legendPosition === "inside" || legendPosition === "insideTop" || legendPosition === "auto" || legendPosition === "top" || legendPosition === "bottom") && <label>
                <span>Legend columns</span>
                <select value={legendColumns} onChange={event => setLegendColumns(Number(event.target.value))}>
                  <option value="0">Automatic</option>
                  {[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>}

              <label>
                <span>Legend size</span>
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={legendSize}
                  onChange={(event) => setLegendSize(Number(event.target.value))}
                />
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={forceSingleLegend}
                  onChange={(event) => setForceSingleLegend(event.target.checked)}
                />
                <span>Keep legend for one m/z</span>
              </label>
            </div>

            <p className="fit-guidance">Choose 2 columns to split the legend. Columns adapt to the available width; your selection is the maximum. Use the horizontal and vertical controls below to move an inside legend.</p>
            <label className="checkbox-label"><input type="checkbox" checked={highlightOnClick} onChange={event => {
              setHighlightOnClick(event.target.checked); setHighlightedIonId("");
            }} /><span>Highlight one m/z on click</span></label>
            {highlightOnClick && <>
              <p className="fit-guidance">Click an m/z in the legend or a plotted point to bring it to the front, keep its color and turn the others gray. Click it again to restore all colors. Values and normalization stay the same.</p>
              <button type="button" className="secondary-button" disabled={!highlightedIonId} onClick={() => setHighlightedIonId("")}>Restore all colors</button>
            </>}
            {legendPosition === "inside" || legendPosition === "insideTop" ? (
              <div className="inside-legend-controls">
                <label>
                  <span>Legend horizontal position</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={legendPosition === "insideTop" ? 0.02 : legendInsideX}
                    onChange={(event) => {
                      if (legendPosition === "insideTop") setLegendInsideY(0.98);
                      setLegendPosition("inside"); setLegendInsideX(Number(event.target.value));
                    }}
                  />
                </label>

                <label>
                  <span>Legend vertical position</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={legendPosition === "insideTop" ? 0.98 : legendInsideY}
                    onChange={(event) => {
                      if (legendPosition === "insideTop") setLegendInsideX(0.02);
                      setLegendPosition("inside"); setLegendInsideY(Number(event.target.value));
                    }}
                  />
                </label>
                <button type="button" className="secondary-button" onClick={() => setLegendPosition("insideTop")}>Reset legend to top</button>
              </div>
            ) : null}
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "curve"}
          >
            <h3>Curve</h3>
            <div className="style-grid">
              <label>
                <span>Curve display</span>
                <select
                  value={curveMode}
                  onChange={(event) =>
                    setCurveMode(event.target.value as CurveMode)
                  }
                >
                  <option value="connect">Connect points</option>
                  <option value="movingAverage">Moving average + measured points</option>
                  <option value="auto">Auto fit</option>
                  <option value="polynomial">Polynomial fit</option>
                  <option value="exponential">Exponential plateau</option>
                  <option value="logistic">Sigmoidal (logistic)</option>
                </select>
              </label>

              {curveMode === "movingAverage" ? (
                <label><span>Moving average window</span>
                  <select value={movingAverageWindow} onChange={event => setMovingAverageWindow(Number(event.target.value))}>
                    {[3, 5, 7, 9, 11, 15, 21, 31].map(size => <option key={size} value={size}>{size} points{size === 5 ? " (Origin project)" : ""}</option>)}
                  </select>
                </label>
              ) : curveMode === "polynomial" ? (
                <label>
                  <span>Polynomial degree</span>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    step="1"
                    value={polynomialDegree}
                    onChange={(event) =>
                      setPolynomialDegree(
                        Math.min(6, Math.max(1, Number(event.target.value))),
                      )
                    }
                  />
                </label>
              ) : (
                <label>
                  <span>Line shape</span>
                  <select
                    value={lineShape}
                    onChange={(event) =>
                      setLineShape(event.target.value as LineShape)
                    }
                  >
                    <option value="linear">Straight</option>
                    <option value="spline">Smooth</option>
                  </select>
                </label>
              )}

              <label>
                <span>Line width</span>
                <input
                  type="number"
                  min="0.5"
                  max="60"
                  step="0.1"
                  value={lineWidth}
                  onChange={(event) => setLineWidth(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Marker size</span>
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="0.5"
                  value={markerSize}
                  onChange={(event) => setMarkerSize(Number(event.target.value))}
                />
              </label>
            </div>

            {curveMode !== "connect" ? (
              <p className="fit-guidance">
                {curveMode === "movingAverage"
                  ? "Lines show a centered moving average; dots retain the measured values. The window shrinks symmetrically at both ends. This averages points, not a fixed time span. CSV/TXT includes measured and smoothed values."
                  : curveMode === "auto"
                  ? "Auto compares cubic polynomial, exponential and logistic fits for each m/z. Hover the curve to see the selected model and R2."
                  : "The fit uses numeric x values. Hover the curve to see the model and R2."}
              </p>
            ) : null}
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "publication"}
          >
            <h3>Publication size and export</h3>
            <div className="style-grid publication-grid">
              <label>
                <span>Raster resolution</span>
                <select
                  value={rasterDpi}
                  onChange={(event) =>
                    updateRasterDpi(Number(event.target.value) as RasterDpi)
                  }
                >
                  {rasterDpiOptions.map((dpi) => (
                    <option key={dpi} value={dpi}>
                      {dpi} dpi
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Final width (mm)</span>
                <input
                  type="number"
                  min="10"
                  max="250"
                  step="0.1"
                  value={finalWidthMm}
                  onChange={(event) =>
                    updateFinalWidthMm(Number(event.target.value))
                  }
                />
              </label>

              <label>
                <span>PNG width</span>
                <input
                  type="number"
                  min="100"
                  max="12000"
                  step="50"
                  value={exportWidth}
                  onChange={(event) => updateExportWidth(Number(event.target.value))}
                />
              </label>

              <label>
                <span>PNG height</span>
                <input
                  type="number"
                  min="100"
                  max="12000"
                  step="50"
                  value={exportHeight}
                  onChange={(event) => setExportHeight(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="publication-summary" aria-live="polite">
              Output: PNG {safeExportWidth} x {safeExportHeight} px at{" "}
              {rasterDpi} dpi. Final size: {formatDecimal(outputWidthMm)} x{" "}
              {formatDecimal(outputHeightMm)} mm. Smallest font:{" "}
              {formatDecimal(smallestFontPt)} pt.
            </div>

            <div className="publication-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={checkJournalCompliance}
              >
                Check JASMS compliance
              </button>
              {journalStatus ? (
                <span className="inline-status">{journalStatus}</span>
              ) : null}
            </div>
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "presets"}
          >
            <h3>Quick styles</h3>
            <div className="style-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={applyDefaultStyle}
              >
                <RotateCcw size={16} aria-hidden="true" />
                <span>Default style</span>
              </button>
              <button type="button" className="secondary-button" onClick={applyPaperStyle}>
                <RotateCcw size={16} aria-hidden="true" />
                <span>Paper style</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={applyMonoMagentaPalette}
              >
                Black + magenta
              </button>
              <button type="button" className="secondary-button" onClick={resetTraceColors}>
                Reset colors
              </button>
            </div>
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "appearance"}
          >
            <h3>Visual details</h3>
            <div className="style-grid">
              <label>
                <span>Font</span>
                <select
                  value={fontFamily}
                  onChange={(event) => setFontFamily(event.target.value as PlotFont)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Inter, ui-sans-serif, system-ui, sans-serif">
                    App default
                  </option>
                </select>
              </label>

              <label>
                <span>Title size</span>
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={titleSize}
                  onChange={(event) => setTitleSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Axis title size</span>
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={axisTitleSize}
                  onChange={(event) => setAxisTitleSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Tick size</span>
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={tickSize}
                  onChange={(event) => setTickSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Axis width</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="0.5"
                  value={axisLineWidth}
                  onChange={(event) => setAxisLineWidth(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Preview max height</span>
                <input
                  type="number"
                  min="320"
                  max="1800"
                  step="20"
                  value={plotHeight}
                  onChange={(event) => setPlotHeight(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="style-switches">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={previewExportRatio}
                  onChange={(event) =>
                    setPreviewExportRatio(event.target.checked)
                  }
                />
                <span>Match PNG preview</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                />
                <span>Show grid</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showAxisBox}
                  onChange={(event) => setShowAxisBox(event.target.checked)}
                />
                <span>Boxed axes</span>
              </label>
            </div>
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "colors"}
          >
            <h3>Plot colors</h3>
            <div className="style-grid color-settings-grid">
              <ColorControl
                label="Axis color"
                value={axisColor}
                onChange={setAxisColor}
              />

              <ColorControl
                label="Grid color"
                value={gridColor}
                onChange={setGridColor}
              />

              <ColorControl
                label="Plot background"
                value={plotBackground}
                onChange={setPlotBackground}
              />

              <ColorControl
                label="Outer background"
                value={paperBackground}
                onChange={setPaperBackground}
              />
            </div>
          </div>

          <div
            className="plot-control-group"
            hidden={activeStyleTab !== "colors"}
          >
            <h3>Curve colors</h3>
            <div className="trace-color-panel">
              {ionOptions.length === 0 ? (
                <span className="style-empty">No m/z curves yet</span>
              ) : (
                ionOptions.map((option) => (
                  <ColorControl
                    key={option.ionId}
                    compact
                    label={option.name}
                    value={traceColors[option.ionId] ?? option.fallbackColor}
                    onChange={(value) =>
                      setTraceColors((currentColors) => ({
                        ...currentColors,
                        [option.ionId]: value,
                      }))
                    }
                  />
                ))
              )}
            </div>
          </div>
            </div>
          )}
        </aside>

        <div className="plot-preview-pane">
          {plotError && <div className="bruker-warning" role="alert">
            <p>The plot could not be updated. Your data and ion list are still available; you can switch tabs or save the project.</p>
            <button type="button" className="secondary-button" onClick={() => setRenderAttempt(value => value + 1)}>Retry plot</button>
            <details><summary>Error details</summary>{plotError}</details>
          </div>}
          <div className="plot-preview-area" ref={previewAreaRef}>
            <div
              className={
                previewExportRatio
                  ? "plot-shell plot-shell-scaled"
                  : "plot-shell"
              }
              style={
                previewExportRatio
                  ? {
                      width: previewFrameWidth,
                      height: previewFrameHeight,
                      minHeight: previewFrameHeight,
                    }
                  : { minHeight: plotHeight }
              }
            >
              {plotData.length === 0 ? (
                <div className="plot-empty">No processed data</div>
              ) : null}
              <div
                ref={plotRef}
                className={
                  previewExportRatio
                    ? "plot-canvas plot-canvas-scaled"
                    : "plot-canvas"
                }
                style={
                  previewExportRatio
                    ? {
                        width: safeExportWidth,
                        height: safeExportHeight,
                        transform: `scale(${previewScale})`,
                      }
                    : { minHeight: plotHeight }
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
