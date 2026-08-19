import Plotly from "plotly.js-dist-min";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";
import { downloadTextFile, plotRowsToCsv } from "../utils/csv";
import {
  buildPlotData,
  defaultTraceColors,
  legendLayout,
  traceName,
} from "../utils/plot";

type PlotBuilderProps = {
  rows: ProcessedRow[];
  isActive?: boolean;
};

type PlotTab = "data" | "style";
type PlotFont =
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Calibri"
  | "Inter, ui-sans-serif, system-ui, sans-serif";
type LineShape = "linear" | "spline";
type TickFormat = "auto" | "plain" | "scientific";
type XValueScale = "raw" | "msToSeconds" | "custom";
type JournalPresetKey = "jasms-single";
type FigureContent = "color" | "grayscale" | "lineArt";
type RasterDpi = 300 | 600 | 1200;

const MM_PER_INCH = 25.4;

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

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const expandEqualRange = (value: number): [number, number] => {
  const padding = Math.max(Math.abs(value) * 0.05, 1);
  return [value - padding, value + padding];
};

const normalizeRange = (min: number, max: number): [number, number] =>
  min === max ? expandEqualRange(min) : min < max ? [min, max] : [max, min];

const parseRange = (
  min: string,
  max: string,
  dataBounds?: [number, number],
): [number, number] | undefined => {
  const parsedMin = parseOptionalNumber(min);
  const parsedMax = parseOptionalNumber(max);

  if (parsedMin === null && parsedMax === null) {
    return undefined;
  }

  if (parsedMin !== null && parsedMax !== null) {
    return normalizeRange(parsedMin, parsedMax);
  }

  if (!dataBounds) {
    return undefined;
  }

  return normalizeRange(
    parsedMin ?? dataBounds[0],
    parsedMax ?? dataBounds[1],
  );
};

const numericPrefix = (value: string): number | null => {
  const match = value.trim().match(/^-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const boundsFromValues = (values: number[]): [number, number] | undefined => {
  const numericValues = values.filter(Number.isFinite);
  if (numericValues.length === 0) {
    return undefined;
  }

  return normalizeRange(Math.min(...numericValues), Math.max(...numericValues));
};

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

export function PlotBuilder({ rows, isActive = true }: PlotBuilderProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<PlotTab>("data");
  const [xAxis, setXAxis] = useState<XAxisKey>("acqTime");
  const [yMode, setYMode] = useState<YMode>("absolute");
  const [title, setTitle] = useState("Ion intensity plot");
  const [xTitle, setXTitle] = useState(axisLabel("acqTime"));
  const [xUnit, setXUnit] = useState("ms");
  const [yTitle, setYTitle] = useState("Absolute intensity");
  const [yUnit, setYUnit] = useState("");
  const [xValueScale, setXValueScale] = useState<XValueScale>("raw");
  const [xValueMultiplier, setXValueMultiplier] = useState(1);
  const [xTickFormat, setXTickFormat] = useState<TickFormat>("auto");
  const [yTickFormat, setYTickFormat] = useState<TickFormat>("auto");
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState<LegendPosition>("right");
  const [legendInsideX, setLegendInsideX] = useState(0.98);
  const [legendInsideY, setLegendInsideY] = useState(0.98);
  const [forceSingleLegend, setForceSingleLegend] = useState(true);
  const [xZoomOnly, setXZoomOnly] = useState(true);
  const [fontFamily, setFontFamily] = useState<PlotFont>("Arial");
  const [titleSize, setTitleSize] = useState(20);
  const [axisTitleSize, setAxisTitleSize] = useState(18);
  const [tickSize, setTickSize] = useState(15);
  const [legendSize, setLegendSize] = useState(14);
  const [showGrid, setShowGrid] = useState(false);
  const [showAxisBox, setShowAxisBox] = useState(true);
  const [axisLineWidth, setAxisLineWidth] = useState(2);
  const [lineWidth, setLineWidth] = useState(2.8);
  const [markerSize, setMarkerSize] = useState(5);
  const [lineShape, setLineShape] = useState<LineShape>("linear");
  const [previewExportRatio, setPreviewExportRatio] = useState(true);
  const [plotHeight, setPlotHeight] = useState(640);
  const [exportWidth, setExportWidth] = useState(1000);
  const [exportHeight, setExportHeight] = useState(760);
  const [journalPreset, setJournalPreset] =
    useState<JournalPresetKey>("jasms-single");
  const [figureContent, setFigureContent] = useState<FigureContent>("color");
  const [rasterDpi, setRasterDpi] = useState<RasterDpi>(300);
  const [finalWidthMm, setFinalWidthMm] = useState(84.6);
  const [journalStatus, setJournalStatus] = useState("");
  const [axisColor, setAxisColor] = useState("#111111");
  const [gridColor, setGridColor] = useState("#d7d7d7");
  const [plotBackground, setPlotBackground] = useState("#ffffff");
  const [paperBackground, setPaperBackground] = useState("#ffffff");
  const [traceColors, setTraceColors] = useState<Record<string, string>>({});
  const [previewAreaWidth, setPreviewAreaWidth] = useState(0);

  const shouldShowLegend =
    showLegend && (forceSingleLegend || new Set(rows.map((row) => row.ionId)).size > 1);

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
      }, xValueMultiplier),
    [
      lineShape,
      lineWidth,
      markerSize,
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
    pixelsToPoints(titleSize, rasterDpi),
    pixelsToPoints(axisTitleSize, rasterDpi),
    pixelsToPoints(tickSize, rasterDpi),
    pixelsToPoints(legendSize, rasterDpi),
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
    const maxPreviewHeight = Math.max(220, plotHeight);
    const scale = Math.min(
      1,
      maxPreviewWidth / safeExportWidth,
      maxPreviewHeight / safeExportHeight,
    );

    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, [
    plotHeight,
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

  const xDataBounds = useMemo(() => {
    const values = rows
      .map((row) => numericPrefix(row.metadata[xAxis] ?? ""))
      .map((value) => (value === null ? null : value * xValueMultiplier))
      .filter((value): value is number => value !== null);

    return boundsFromValues(values);
  }, [rows, xAxis, xValueMultiplier]);

  const yDataBounds = useMemo(() => {
    const values = rows.map((row) =>
      yMode === "absolute" ? row.absoluteIntensity : row.relativeIntensity,
    );

    return boundsFromValues(values);
  }, [rows, yMode]);

  useEffect(() => {
    setYTitle(yMode === "absolute" ? "Absolute intensity" : "Relative intensity");
    setYUnit(yMode === "relative" ? "%" : "");
  }, [yMode]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const previewAreaElement = previewAreaRef.current;
    if (!previewAreaElement) {
      return;
    }

    const updatePreviewAreaWidth = () => {
      setPreviewAreaWidth(previewAreaElement.clientWidth);
    };

    updatePreviewAreaWidth();

    const resizeObserver = new ResizeObserver(updatePreviewAreaWidth);
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

    const xRange = parseRange(xMin, xMax, xDataBounds);
    const yRange = parseRange(yMin, yMax, yDataBounds);
    const xTickFormatValue = tickFormatValue(xTickFormat);
    const yTickFormatValue = tickFormatValue(yTickFormat);

    const layout = {
      title: {
        text: title,
        font: { size: titleSize, family: fontFamily },
        xref: "paper",
        x: 0.5,
        xanchor: "center",
      },
      xaxis: {
        title: {
          text: axisTitleWithUnit(xTitle, xUnit),
          font: { size: axisTitleSize, family: fontFamily },
        },
        automargin: true,
        autorange: xRange ? false : true,
        range: xRange,
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
        autorange: yRange ? false : true,
        range: yRange,
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
        rangemode: "tozero",
        zeroline: showGrid,
        zerolinecolor: gridColor,
      },
      dragmode: "zoom",
      showlegend: shouldShowLegend,
      legend: {
        ...legendLayout(legendPosition, legendInsideX, legendInsideY),
        font: { size: legendSize, family: fontFamily, color: axisColor },
      },
      margin: {
        l: 72,
        r: shouldShowLegend && legendPosition === "right" ? 180 : 32,
        t: 72,
        b: shouldShowLegend && legendPosition === "bottom" ? 112 : 88,
      },
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
    };

    Plotly.react(plotElement, plotData, layout, {
      responsive: !previewExportRatio,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
      scrollZoom: true,
    });

    return () => {
      Plotly.purge(plotElement);
    };
  }, [
    axisColor,
    axisLineWidth,
    axisTitleSize,
    fontFamily,
    gridColor,
    isActive,
    legendInsideX,
    legendInsideY,
    legendPosition,
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

  const applyPaperStyle = () => {
    setFontFamily("Arial");
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
    setFontFamily("Inter, ui-sans-serif, system-ui, sans-serif");
    setTitleSize(18);
    setAxisTitleSize(14);
    setTickSize(12);
    setLegendSize(12);
    setShowGrid(true);
    setShowAxisBox(false);
    setAxisLineWidth(1);
    setLineWidth(2.5);
    setMarkerSize(8);
    setLineShape("linear");
    setPreviewExportRatio(true);
    setPlotHeight(640);
    setExportWidth(1400);
    setExportHeight(900);
    setAxisColor("#1e293b");
    setGridColor("#d7dee8");
    setPlotBackground("#f8fafc");
    setPaperBackground("#ffffff");
    setTraceColors({});
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
    }

    if (nextScale === "msToSeconds") {
      setXValueMultiplier(0.001);
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
    if (xDataBounds) {
      setXMin(String(xDataBounds[0]));
      setXMax(String(xDataBounds[1]));
    } else {
      setXMin("");
      setXMax("");
    }

    if (yDataBounds) {
      setYMin(String(yDataBounds[0]));
      setYMax(String(yDataBounds[1]));
    } else {
      setYMin("");
      setYMax("");
    }
  };

  const clearAxisRanges = () => {
    setXMin("");
    setXMax("");
    setYMin("");
    setYMax("");
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

  const exportPlotCsv = () => {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      "pd-ms-plot-data.csv",
      plotRowsToCsv(
        rows,
        xAxis,
        yMode,
        xValueMultiplier,
        axisTitleWithUnit(xTitle, xUnit),
      ),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Visualization</p>
          <h2>Plot</h2>
        </div>
        <div className="plot-export-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={exportPlotCsv}
            disabled={rows.length === 0}
          >
            <Download size={16} aria-hidden="true" />
            <span>Export plot CSV</span>
          </button>
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
                    onChange={(event) => setYMode(event.target.value as YMode)}
                  >
                    {yModeOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Plot title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
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
              <h3>Legend and zoom</h3>
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
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="inside">Inside</option>
                  </select>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={forceSingleLegend}
                    onChange={(event) => setForceSingleLegend(event.target.checked)}
                  />
                  <span>Keep legend for one m/z</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={xZoomOnly}
                    onChange={(event) => setXZoomOnly(event.target.checked)}
                  />
                  <span>Lock y axis zoom</span>
                </label>
              </div>

              {legendPosition === "inside" ? (
                <div className="inside-legend-controls">
                  <label>
                    <span>Legend x</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={legendInsideX}
                      onChange={(event) =>
                        setLegendInsideX(Number(event.target.value))
                      }
                    />
                  </label>

                  <label>
                    <span>Legend y</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={legendInsideY}
                      onChange={(event) =>
                        setLegendInsideY(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
            </div>
          ) : (
            <div className="style-panel">
          <div className="plot-control-group">
            <h3>Journal preset</h3>
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
          </div>

          <div className="plot-control-group">
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

          <div className="plot-control-group">
            <h3>Presets</h3>
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

          <div className="plot-control-group">
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
                <span>Legend size</span>
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={legendSize}
                  onChange={(event) => setLegendSize(Number(event.target.value))}
                />
              </label>

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

              <label>
                <span>Line shape</span>
                <select
                  value={lineShape}
                  onChange={(event) => setLineShape(event.target.value as LineShape)}
                >
                  <option value="linear">Straight</option>
                  <option value="spline">Smooth</option>
                </select>
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

          <div className="plot-control-group">
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

          <div className="plot-control-group">
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
