import { exportCatalogResult, downloadPackage } from "../utils/catalogProject";
import { PhotodepletionControls } from "./PhotodepletionControls";
import { analyzePhoto, photoCsv, photoTraces, readPhotoState } from "../utils/photodepletion";
import Plotly from "plotly.js-dist-min";
import { Download, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";
import { downloadTextFile, plotRowsToCsv } from "../utils/csv";
import { queuePlotTask } from "../utils/plotLifecycle";
import { aggregateReplicates, type ReplicateMode } from "../utils/replicates";
import { fitExportPreview } from "../utils/preview";
import { axisRange, axisRangeLayout, numericBounds } from "../utils/axisRange";
import {
  buildPlotData,
  rowsForPlotAxis,
  legendGeometry,
  insideLegendColumns,
  defaultPlotAppearance,
  trmsPlotDefaults,
  traceName,
} from "../utils/plot";
import { colorPalettes, paletteColor, readColorPalette, type ColorPaletteId } from "../utils/colorPalettes";
import type { SpectrumFile } from "../types";
import { safeProjectFilename } from "../utils/project";
import { PlotToolbar } from "./PlotToolbar";
import { SavedPowerControls } from "./SavedPowerControls";
import { FitResults } from "./FitResults";
import { readLegendMzDecimals } from "../utils/format";

import { readPlotSetting, type PlotBuilderProps, type PlotTab, type PlotInteraction, type InteractivePlotElement, type PlotFont, type LineShape, type CurveMode, type TickFormat, type XValueScale, type JournalPresetKey, type FigureContent, type RasterDpi, type PlotStyleSettings, type SavedPlotStyle, MM_PER_INCH, STYLE_PRESETS_STORAGE_KEY, loadSavedPlotStyles, journalPresets, figureContentOptions, rasterDpiOptions, pointsToPixels, pixelsToPoints, pixelsFromMm, mmFromPixels, formatDecimal, axisLabel, defaultXAxisUnit, axisTitleWithUnit, tickFormatValue, normalizeHexColor, type ColorControlProps, ColorControl } from "./plot/controls";

export function PlotBuilder({ getProject, onCatalogExport, rows: sourceRows, isActive = true, expanded, onExpandedChange, initialSettings = {}, settingsRef, onSettingsChange, projectName, files, photoFiles = files, processingBusy = false, powerCalibration, onPowerCalibrationChange }: PlotBuilderProps) {
  const [analysisMode, setAnalysisMode] = useState(() => initialSettings.analysisMode === "photodepletion" ? "photodepletion" : "intensity");
  const isPhoto = analysisMode === "photodepletion";
  const [photo, setPhoto] = useState(() => readPhotoState(initialSettings.photodepletion));
  const photoAnalysis = useMemo(() => analyzePhoto(photo, photoFiles), [photo, photoFiles]);
  const [collapsed, setCollapsed] = useState(false);
  const [previewZoom, setPreviewZoom] = useState("fit");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const catalogDownload = useRef<{signature: string; bytes: Uint8Array; name: string}>();
  const settingsInitialized = useRef<string | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const [plotError, setPlotError] = useState("");
  const [renderAttempt, setRenderAttempt] = useState(0);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<PlotTab>("data");
  const [xAxis, setXAxis] = useState<XAxisKey>(() => readPlotSetting(initialSettings, "xAxis", "acqTime"));
  const axisRows = useMemo(() => rowsForPlotAxis(sourceRows, xAxis), [sourceRows, xAxis]);
  const [yMode, setYMode] = useState<YMode>(() => readPlotSetting(initialSettings, "yMode", "absolute"));
  const [replicateMode, setReplicateMode] = useState<ReplicateMode>(() => ["sd", "sem"].includes(String(initialSettings.replicateMode)) ? initialSettings.replicateMode as ReplicateMode : "individual");
  const aggregation = useMemo(() => replicateMode === "individual" ? { rows: axisRows, warnings: [] } : aggregateReplicates(axisRows, xAxis, yMode), [axisRows, xAxis, yMode, replicateMode]);
  const rows = aggregation.rows;
  const omittedAxisFiles = useMemo(() => {
    const visible = new Set(axisRows.map(row => row.id));
    return new Set(sourceRows.filter(row => !visible.has(row.id)).map(row => row.fileId)).size;
  }, [sourceRows, axisRows]);
  const omittedWavelengthFiles = useMemo(() => {
    if (xAxis !== "wavelength") return 0;
    const visibleIds = new Set(axisRows.map(row => row.id));
    return new Set(sourceRows.filter(row => !visibleIds.has(row.id)).map(row => row.fileId)).size;
  }, [sourceRows, axisRows, xAxis]);
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
  const [legendPosition, setLegendPosition] = useState<LegendPosition>(() => readPlotSetting(initialSettings, "legendPosition", "top"));
  const [legendColumns, setLegendColumns] = useState(() => readPlotSetting(initialSettings, "legendColumns", 0));
  const [legendMzDecimals, setLegendMzDecimals] = useState(() => readLegendMzDecimals(initialSettings.legendMzDecimals));
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
  const previewExportRatio = true;
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
  const [colorPalette, setColorPalette] = useState<ColorPaletteId>(() => readColorPalette(initialSettings.colorPalette));
  const [savedPlotStyles, setSavedPlotStyles] =
    useState<SavedPlotStyle[]>(loadSavedPlotStyles);
  const [stylePresetName, setStylePresetName] = useState("");
  const [selectedStylePresetId, setSelectedStylePresetId] = useState("");
  const [stylePresetStatus, setStylePresetStatus] = useState("");
  const [previewAreaWidth, setPreviewAreaWidth] = useState(0);
  const [previewAreaHeight, setPreviewAreaHeight] = useState(0);

  useEffect(() => { settingsRef.current = { analysisMode, photodepletion: photo, xAxis, yMode, replicateMode, title, showTitle, xTitle, xUnit, yTitle, yUnit, xValueScale, xValueMultiplier, xTickFormat, yTickFormat, xMin, xMax, yMin, yMax, showLegend, legendPosition, legendColumns, legendMzDecimals, highlightOnClick, highlightedIonId, legendInsideX, legendInsideY, forceSingleLegend, xZoomOnly, fontFamily, titleSize, axisTitleSize, tickSize, legendSize, showGrid, showAxisBox, axisLineWidth, lineWidth, markerSize, lineShape, curveMode, polynomialDegree, movingAverageWindow, previewExportRatio, plotHeight, exportWidth, exportHeight, journalPreset, figureContent, rasterDpi, finalWidthMm, axisColor, gridColor, plotBackground, paperBackground, traceColors, colorPalette }; const signature = JSON.stringify(settingsRef.current); if (settingsInitialized.current !== null && settingsInitialized.current !== signature) onSettingsChange(settingsRef.current); settingsInitialized.current = signature; });

  const shouldShowLegend =
    showLegend && (isPhoto || forceSingleLegend || new Set(rows.map((row) => row.ionId)).size > 1);
  const hasVisibleTitle = showTitle && title.trim().length > 0;

  const ionOptions = useMemo(() => {
    if (isPhoto) return photoAnalysis.series.map(([ionId, name], index) => ({ionId, name, fallbackColor: paletteColor(colorPalette, -1, index)}));
    const options = new Map<
      string,
      { ionId: string; name: string; fallbackColor: string }
    >();

    rows.forEach((row) => {
      if (!options.has(row.ionId)) {
        options.set(row.ionId, {
          ionId: row.ionId,
          name: traceName(row.targetMz, row.label),
          fallbackColor: paletteColor(colorPalette, row.targetMz, options.size),
        });
      }
    });

    return Array.from(options.values());
  }, [rows, colorPalette, isPhoto, photoAnalysis]);

  const plotData = useMemo(
    () =>
      isPhoto ? photoTraces(photoAnalysis, photo, traceColors, colorPalette, markerSize, lineWidth, shouldShowLegend) : buildPlotData(rows, xAxis, yMode, shouldShowLegend, {
        legendMzDecimals,
        replicateMode,
        colors: traceColors,
        colorPalette,
        lineWidth,
        markerSize,
        lineShape,
        curveMode,
        polynomialDegree,
        movingAverageWindow,
        highlightedIonId: highlightOnClick ? highlightedIonId : undefined,
      }, xValueMultiplier),
    [
      isPhoto, photoAnalysis, photo,
      legendMzDecimals,
      replicateMode,
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
      colorPalette,
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
    const maxPreviewHeight = Math.max(1, previewAreaHeight > 0 ? previewAreaHeight : plotHeight);
    if (previewZoom === "width") return maxPreviewWidth / safeExportWidth;
    if (previewZoom !== "fit") return Number(previewZoom);
    const { scale } = fitExportPreview(safeExportWidth, safeExportHeight, maxPreviewWidth, maxPreviewHeight);

    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, [
    plotHeight,
    previewAreaHeight,
    previewAreaWidth,
    previewZoom,
    previewExportRatio,
    safeExportHeight,
    safeExportWidth,
  ]);

  const previewFrameWidth = Math.max(
    1,
    safeExportWidth * previewScale,
  );
  const previewFrameHeight = Math.max(
    1,
    safeExportHeight * previewScale,
  );
  const plotRenderWidth = previewExportRatio ? safeExportWidth : undefined;
  const plotRenderHeight = previewExportRatio ? safeExportHeight : plotHeight;

  const xDataBounds = useMemo(() => numericBounds(plotData.flatMap(trace => trace.x)), [plotData]);
  const yDataBounds = useMemo(() => numericBounds(plotData.flatMap(trace => trace.y.flatMap((y, index) => {
    const error = trace.error_y?.array[index] ?? 0;
    return [y - error, y + error];
  }))), [plotData]);
  const xAxisRange = useMemo(() => axisRange(isPhoto ? (photo.xMin ?? "") : xMin, isPhoto ? (photo.xMax ?? "") : xMax, xDataBounds), [xMin, xMax, xDataBounds, isPhoto, photo.xMin, photo.xMax]);
  const yAxisRange = useMemo(() => axisRange(isPhoto ? (photo.yMin ?? "") : yMin, isPhoto ? (photo.yMax ?? "") : yMax, yDataBounds), [yMin, yMax, yDataBounds, isPhoto, photo.yMin, photo.yMax]);

  useEffect(() => {
    const refreshCloudPresets = () => setSavedPlotStyles(loadSavedPlotStyles());
    window.addEventListener("ms-cloud-presets-loaded", refreshCloudPresets);
    return () => window.removeEventListener("ms-cloud-presets-loaded", refreshCloudPresets);
  }, []);

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
            text: isPhoto ? "Photodepletion" : title,
            font: { size: titleSize, family: fontFamily },
            xref: "paper",
            x: 0.5,
            xanchor: "center",
          }
        : undefined,
      xaxis: {
        ...(isPhoto ? {type: "linear"} : {}),
        title: {
          text: isPhoto ? `Optical power (${photo.unit})` : axisTitleWithUnit(xTitle, xUnit),
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
        ...(isPhoto ? {type: "linear"} : {}),
        title: {
          text: isPhoto ? "ln(I_OFF/I_ON)" : axisTitleWithUnit(yTitle, yUnit),
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
      uirevision: JSON.stringify([analysisMode, photo.unit, photo.xMin, photo.xMax, photo.yMin, photo.yMax, xAxis, yMode, xValueMultiplier, xMin, xMax, yMin, yMax, renderAttempt, rows.length, rows[0]?.id, rows[rows.length - 1]?.id]),
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
    legendMzDecimals,
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
    setLegendMzDecimals("auto");
    setHighlightOnClick(false); setHighlightedIonId("");
    setShowLegend(true); setShowGrid(false); setShowAxisBox(true);
    setAxisLineWidth(2);
    setAxisColor("#111111"); setPlotBackground("#ffffff"); setPaperBackground("#ffffff");
    setStylePresetStatus("Default Arial appearance applied");
  };

  const applyMonoMagentaPalette = () => {
    applyColorPalette("mono-magenta");
  };

  const resetTraceColors = () => {
    applyColorPalette("trms");
  };

  const applyColorPalette = (id: ColorPaletteId) => {
    setColorPalette(id);
    setTraceColors({});
  };

  const applyTrmsDefaults = () => {
    const preset = trmsPlotDefaults;
    applyDefaultStyle();
    setXAxis(preset.xAxis); setXTitle(preset.xTitle); setXUnit(preset.xUnit);
    setXValueScale(preset.xValueScale); setXValueMultiplier(preset.xValueMultiplier);
    setYMode(preset.yMode); setYTitle(preset.yTitle); setYUnit(preset.yUnit);
    setXMin(preset.xMin); setXMax(preset.xMax); setYMin(preset.yMin); setYMax(preset.yMax);
    setXTickFormat("auto"); setYTickFormat("auto");
    setCurveMode(preset.curveMode); setMovingAverageWindow(preset.movingAverageWindow); setLineShape(preset.lineShape);
    setLegendColumns(preset.legendColumns); setLegendInsideX(preset.legendInsideX); setLegendInsideY(preset.legendInsideY);
    setForceSingleLegend(preset.forceSingleLegend);
    applyColorPalette(preset.colorPalette);
    setRenderAttempt(value => value + 1);
    setStylePresetStatus("TRMS defaults applied");
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
    legendMzDecimals,
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
    colorPalette,
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
    setLegendMzDecimals(readLegendMzDecimals(settings.legendMzDecimals));
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
    setColorPalette(readColorPalette(settings.colorPalette));
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
    if (isPhoto) {setPhoto(current => ({...current, xMin: xLimits ? String(xLimits[0]) : "", xMax: xLimits ? String(xLimits[1]) : "", yMin: yLimits ? String(yLimits[0]) : "", yMax: yLimits ? String(yLimits[1]) : ""})); return;}
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
    if (isPhoto) {setPhoto(current => ({...current, xMin: "", xMax: "", yMin: "", yMax: ""})); setRenderAttempt(value => value + 1); return;}
    setXMin("");
    setXMax("");
    setYMin("");
    setYMax("");
    setRenderAttempt(value => value + 1);
  };

  const exportImage = async (format: "png" | "svg") => {
    if (!plotRef.current || !plotData.length) {setExportError(isPhoto ? "Nenhum par válido para exportar a figura. O CSV/TXT inclui os pares excluídos." : "No plotted data to export."); return;}
    if (xAxisRange.error || yAxisRange.error) {setExportError("Corrija os limites dos eixos antes de exportar a figura."); return;}
    setExporting(true); setExportError("");
    try {
      if (format === "png" && safeExportWidth * safeExportHeight > 40000000) throw new Error("PNG export is limited to 40 million pixels. Reduce the dimensions or use SVG.");
      await renderQueue.current;
      await Plotly.downloadImage(plotRef.current, {format, filename: safeProjectFilename(projectName).replace(".pdmsplot.json", isPhoto ? "-photodepletion" : "-plot"), width: safeExportWidth, height: safeExportHeight, scale: 1});
    } catch (error) { setExportError(error instanceof Error ? error.message : "Export failed. Try a smaller image."); }
    finally { setExporting(false); }
  };

  const exportCatalog = async () => {
    if (!getProject || !plotRef.current || !plotData.length || xAxisRange.error || yAxisRange.error || processingBusy || plotError) {setExportError("Aguarde o processamento e corrija o gráfico antes de exportar."); return;}
    setExporting(true); setExportError("");
    try {
      const snapshot = structuredClone({...getProject(), plotSettings: settingsRef.current});
      const signature = JSON.stringify(snapshot);
      const ensureUnchanged = () => {if (JSON.stringify({...getProject(), plotSettings: settingsRef.current}) !== signature) throw Error("O projeto mudou durante a exportação. Exporte novamente para manter figura, dados e versão consistentes.");};
      if (catalogDownload.current?.signature === signature) {downloadPackage(catalogDownload.current.bytes, catalogDownload.current.name); return;}
      if (safeExportWidth * safeExportHeight > 40000000) throw Error("Reduza a figura para no máximo 40 milhões de pixels.");
      await renderQueue.current;
      const url = await Plotly.toImage(plotRef.current, {format: "png", width: safeExportWidth, height: safeExportHeight, scale: 1});
      ensureUnchanged();
      const png = Uint8Array.from(atob(url.split(",")[1]), c => c.charCodeAt(0));
      const csv = isPhoto ? photoCsv(photoAnalysis, photo) : plotRowsToCsv(rows, xAxis, yMode, xValueMultiplier, axisTitleWithUnit(xTitle, xUnit), ",", curveMode === "movingAverage" ? movingAverageWindow : undefined);
      const result = await exportCatalogResult(snapshot, png, rows, csv);
      ensureUnchanged();
      const name = `${safeProjectFilename(projectName).replace(".pdmsplot.json", "")}-${result.manifest.result.versionId}.ms-result.zip`;
      catalogDownload.current = {signature: JSON.stringify({...snapshot, catalog: result.project.catalog}), bytes: result.bytes, name};
      onCatalogExport?.(result.project.catalog!);
      downloadPackage(result.bytes, name);
      setExportError("Pacote baixado: PNG + CSV + projeto editável. Importe o ZIP no estudo do MS Catalog para salvar esta versão.");
    } catch (error) {setExportError(error instanceof Error ? error.message : "Falha ao exportar pacote");}
    finally {setExporting(false);}
  };

  const exportPlotCsv = (format: "csv" | "txt" = "csv") => {
    if (isPhoto) {
      downloadTextFile(`${safeProjectFilename(projectName).replace(".pdmsplot.json", "-photodepletion")}.${format}`, photoCsv(photoAnalysis, photo, format === "txt" ? "\t" : ","), format === "txt" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8");
      return;
    }
    if (rows.length === 0) { return; }

    downloadTextFile(
      `${safeProjectFilename(projectName).replace(".pdmsplot.json", "-plot-data")}.${format}`,
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
      <PlotToolbar disabled={(isPhoto ? !photo.pairs.length : !rows.length) || processingBusy} exporting={exporting} collapsed={collapsed} onCollapse={() => setCollapsed(value => !value)} expanded={expanded} onExpand={() => onExpandedChange(!expanded)} previewZoom={previewZoom} onPreviewZoom={setPreviewZoom} onImage={format => void exportImage(format)} onData={exportPlotCsv} />
      {getProject?.().catalog && <div className="control-button-row"><button type="button" className="secondary-button" disabled={exporting || processingBusy} onClick={() => void exportCatalog()}>Baixar resultado para MS Catalog</button><span>PNG + CSV + projeto · transferência por arquivo</span></div>}
      {exportError && <p className="validation-notice" role="alert">{exportError}</p>}
      <div className={`plot-workbench ${collapsed ? "settings-collapsed" : ""}`}>
        <aside id="plot-settings" className="plot-settings-panel" aria-label="Plot settings" hidden={collapsed}>
          <div className="plot-tabs" role="group" aria-label="Plot settings">
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

          <label className="analysis-mode-control">Modo de análise<select aria-label="Modo de análise" value={analysisMode} onChange={event => setAnalysisMode(event.target.value)}><option value="intensity">Ion intensity</option><option value="photodepletion">Photodepletion</option></select></label>
          <FitResults traces={isPhoto || processingBusy ? [] : plotData} filename={safeProjectFilename(projectName).replace(".pdmsplot.json", "")} />
          {activeTab === "data" ? (
            <div className="plot-menu">
            {isPhoto && <PhotodepletionControls state={photo} onChange={setPhoto} analysis={photoAnalysis} files={photoFiles} calibration={powerCalibration} />}
            <details hidden={isPhoto} className="plot-control-group plot-accordion">
              <summary>Text and axes</summary>
            <div className="plot-accordion-content">
              <label><span>Replicates</span><select aria-label="Replicates" value={replicateMode} onChange={event => setReplicateMode(event.target.value as ReplicateMode)}>
                <option value="individual">Individual files</option><option value="sd">Mean ± sample SD</option><option value="sem">Mean ± SEM</option>
              </select></label>
              {replicateMode !== "individual" && <p>Equal weight per file. Normalization is applied per file before averaging. Groups match the other metadata and spectrum type; edit Experiment group to separate batches. Missing or repeated replicate IDs are not pooled.</p>}
              {aggregation.warnings.length > 0 && <details open><summary>Replicate warnings ({aggregation.warnings.length})</summary>{aggregation.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
              {(xAxis === "current" || xAxis === "voltage") && omittedAxisFiles > 0 && <p role="status">{omittedAxisFiles} files without a numeric {xAxis} are omitted. LED OFF stays in Data; assign a reference coordinate explicitly if you want to plot it.</p>}
              {xAxis === "opticalPower" && <p role="status">Optical power uses the saved measurements. {omittedAxisFiles > 0 ? `${omittedAxisFiles} files without matching calibration are omitted; check their current and wavelength.` : "Values use the active calibration and background choice."} Vertical error bars describe ion intensity, not power uncertainty.</p>}
              {xAxis === "opticalPower" && <details><summary>Power calibration used</summary>{[...new Set(axisRows.map(row => row.metadata.powerCalibration).filter(Boolean))].map(method => <p key={method}>{method}</p>)}</details>}
              {omittedWavelengthFiles > 0 && <p role="status">Segments without a positive numeric wavelength: {omittedWavelengthFiles}. Omitted from this plot and its normalization; available in Data and segment spectrum export.</p>}
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
            </details>

            <details className="plot-control-group plot-accordion">
              <summary>Ticks and range</summary>
            <div className="plot-accordion-content">
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
                    value={isPhoto ? (photo.xMin ?? "") : xMin}
                    onChange={(event) => isPhoto ? setPhoto(current => ({...current, xMin: event.target.value})) : setXMin(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>x max</span>
                  <input
                    type="number"
                    value={isPhoto ? (photo.xMax ?? "") : xMax}
                    onChange={(event) => isPhoto ? setPhoto(current => ({...current, xMax: event.target.value})) : setXMax(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>y min</span>
                  <input
                    type="number"
                    value={isPhoto ? (photo.yMin ?? "") : yMin}
                    onChange={(event) => isPhoto ? setPhoto(current => ({...current, yMin: event.target.value})) : setYMin(event.target.value)}
                    placeholder="auto"
                  />
                </label>

                <label>
                  <span>y max</span>
                  <input
                    type="number"
                    value={isPhoto ? (photo.yMax ?? "") : yMax}
                    onChange={(event) => isPhoto ? setPhoto(current => ({...current, yMax: event.target.value})) : setYMax(event.target.value)}
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
            </details>

            <details className="plot-control-group plot-accordion">
              <summary>Zoom</summary>
            <div className="plot-accordion-content">
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
            </details>
            {powerCalibration && onPowerCalibrationChange && <SavedPowerControls calibration={powerCalibration} onChange={onPowerCalibrationChange} />}
            </div>
          ) : (
            <div className="style-panel">


          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Figure style presets</summary>
            <div className="plot-accordion-content">
            <p>Time in minutes · share of selected ions (%) · 3-point moving average + measured points · one-column inside legend · Arial.</p>
            <button type="button" className="secondary-button" onClick={applyTrmsDefaults}>Apply TRMS default</button>
            <p className="fit-guidance">Uses acquisition time stored in seconds. Keeps your selected ions and applies the reference colors.</p>
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Legend</summary>
            <div className="plot-accordion-content">
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

              <label>
                <span>m/z decimal places · casas decimais</span>
                <select value={legendMzDecimals} onChange={event => setLegendMzDecimals(event.target.value === "auto" ? "auto" : Number(event.target.value))}>
                  <option value="auto">Automatic · original precision</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(decimals => <option key={decimals} value={decimals}>{decimals} · m/z {(751.321456).toFixed(decimals)}</option>)}
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
            </div>

            <p className="fit-guidance">Choose 2 columns to split the legend. Columns adapt to the available width; your selection is the maximum. Use the horizontal and vertical controls below to move an inside legend.</p>
            <p className="fit-guidance">Casas decimais: altera a exibição dos m/z na legenda e nas figuras exportadas. Os valores usados na extração, nos cálculos e nas tabelas mantêm a precisão original.</p>
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
                  <span className="help-text">Esquerda ← → Direita. No máximo, a legenda encosta na borda direita do gráfico.</span>
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
            </details>

          {isPhoto && <div className="style-grid"><label>Line width<input type="number" min="0.5" step="0.1" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} /></label><label>Marker size<input type="number" min="0" step="0.5" value={markerSize} onChange={e => setMarkerSize(Number(e.target.value))} /></label></div>}
          <details
            className="plot-control-group plot-accordion" hidden={isPhoto}
          >
            <summary>Curve</summary>
            <div className="plot-accordion-content">
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Publication size and export</summary>
            <div className="plot-accordion-content">
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Quick styles</summary>
            <div className="plot-accordion-content">
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Visual details</summary>
            <div className="plot-accordion-content">
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

              <p>Preview zoom only changes the on-screen size. The aspect ratio and downloaded image dimensions stay the same. Use Expand workspace to keep editing beside a larger plot.</p>
            </div>

            <div className="style-switches">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={previewExportRatio}
                  disabled
                />
                <span>Preview always matches export ratio</span>
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Color presets</summary>
            <div className="plot-accordion-content">
            <label className="saved-style-name">
              <span>Color preset</span>
              <select value={colorPalette} onChange={event => applyColorPalette(readColorPalette(event.target.value))}>
                {colorPalettes.map(palette => <option key={palette.id} value={palette.id}>{palette.name}</option>)}
              </select>
            </label>
            <div className="palette-swatches" aria-label="Preset colors">
              {colorPalettes.find(palette => palette.id === colorPalette)!.colors.map((color, index) => <span key={`${color}-${index}`} style={{backgroundColor:color}} title={color} aria-label={color} role="img" />)}
            </div>
            <p className="fit-guidance">Choosing a preset replaces individual color edits. You can customize each curve below.</p>
            {colorPalette === "trms" && <p className="fit-guidance">Reference m/z colors: 751 blue · 659 orange · 617 yellow · 375 purple · 283 green · 255 light blue · 241 burgundy.</p>}
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
            </details>

          <details
            className="plot-control-group plot-accordion"
          >
            <summary>Curve colors</summary>
            <div className="plot-accordion-content">
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
            </details>
            </div>
          )}
        </aside>

        <div className="plot-preview-pane" aria-busy={processingBusy}>
          {processingBusy && <p className="scan-live-progress" role="status">Atualizando gráfico… A última versão permanece visível durante o cálculo.</p>}
          {plotError && <div className="bruker-warning" role="alert">
            <p>The plot could not be updated. Your data and ion list are still available; you can switch tabs or save the project.</p>
            <button type="button" className="secondary-button" onClick={() => setRenderAttempt(value => value + 1)}>Retry plot</button>
            <details><summary>Error details</summary>{plotError}</details>
          </div>}
          <div className="plot-preview-area" ref={previewAreaRef} tabIndex={0} role="region" aria-label="Plot preview; scroll to explore when zoomed">
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
