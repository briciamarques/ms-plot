import Plotly from "plotly.js-dist-min";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendPosition, ProcessedRow, XAxisKey, YMode } from "../types";
import { xAxisOptions, yModeOptions } from "../types";
import {
  buildPlotData,
  defaultTraceColors,
  legendLayout,
  traceName,
} from "../utils/plot";

type PlotBuilderProps = {
  rows: ProcessedRow[];
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

export function PlotBuilder({ rows }: PlotBuilderProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<PlotTab>("data");
  const [xAxis, setXAxis] = useState<XAxisKey>("acqTime");
  const [yMode, setYMode] = useState<YMode>("absolute");
  const [title, setTitle] = useState("Ion intensity plot");
  const [xTitle, setXTitle] = useState(axisLabel("acqTime"));
  const [xUnit, setXUnit] = useState("ms");
  const [yTitle, setYTitle] = useState("Absolute intensity");
  const [yUnit, setYUnit] = useState("");
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
  const [plotHeight, setPlotHeight] = useState(460);
  const [exportWidth, setExportWidth] = useState(1000);
  const [exportHeight, setExportHeight] = useState(760);
  const [axisColor, setAxisColor] = useState("#111111");
  const [gridColor, setGridColor] = useState("#d7d7d7");
  const [plotBackground, setPlotBackground] = useState("#ffffff");
  const [paperBackground, setPaperBackground] = useState("#ffffff");
  const [traceColors, setTraceColors] = useState<Record<string, string>>({});

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
      }),
    [
      lineShape,
      lineWidth,
      markerSize,
      rows,
      shouldShowLegend,
      traceColors,
      xAxis,
      yMode,
    ],
  );

  const xDataBounds = useMemo(() => {
    const values = rows
      .map((row) => numericPrefix(row.metadata[xAxis] ?? ""))
      .filter((value): value is number => value !== null);

    return boundsFromValues(values);
  }, [rows, xAxis]);

  const yDataBounds = useMemo(() => {
    const values = rows.map((row) =>
      yMode === "absolute" ? row.absoluteIntensity : row.relativeIntensity,
    );

    return boundsFromValues(values);
  }, [rows, yMode]);

  useEffect(() => {
    setXTitle(axisLabel(xAxis));
    setXUnit(defaultXAxisUnit(xAxis));
  }, [xAxis]);

  useEffect(() => {
    setYTitle(yMode === "absolute" ? "Absolute intensity" : "Relative intensity");
    setYUnit(yMode === "relative" ? "%" : "");
  }, [yMode]);

  useEffect(() => {
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
      height: plotHeight,
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
      responsive: true,
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
    legendInsideX,
    legendInsideY,
    legendPosition,
    legendSize,
    paperBackground,
    plotData,
    plotBackground,
    plotHeight,
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
    setPlotHeight(460);
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
    setPlotHeight(460);
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
      width: exportWidth,
      height: exportHeight,
      scale: 2,
    });
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Visualization</p>
          <h2>Plot</h2>
        </div>
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
        <>
          <div className="plot-menu">
            <div className="plot-control-group">
              <h3>Text and axes</h3>
              <div className="plot-controls">
                <label>
                  <span>x axis</span>
                  <select
                    value={xAxis}
                    onChange={(event) => setXAxis(event.target.value as XAxisKey)}
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
        </>
      ) : (
        <div className="style-panel">
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
                  max="42"
                  value={titleSize}
                  onChange={(event) => setTitleSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Axis title size</span>
                <input
                  type="number"
                  min="8"
                  max="36"
                  value={axisTitleSize}
                  onChange={(event) => setAxisTitleSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Tick size</span>
                <input
                  type="number"
                  min="8"
                  max="30"
                  value={tickSize}
                  onChange={(event) => setTickSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Legend size</span>
                <input
                  type="number"
                  min="8"
                  max="30"
                  value={legendSize}
                  onChange={(event) => setLegendSize(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Line width</span>
                <input
                  type="number"
                  min="0.5"
                  max="10"
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
                  max="20"
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
                  max="6"
                  step="0.5"
                  value={axisLineWidth}
                  onChange={(event) => setAxisLineWidth(Number(event.target.value))}
                />
              </label>

              <label>
                <span>Plot height</span>
                <input
                  type="number"
                  min="320"
                  max="1200"
                  step="20"
                  value={plotHeight}
                  onChange={(event) => setPlotHeight(Number(event.target.value))}
                />
              </label>

              <label>
                <span>PNG width</span>
                <input
                  type="number"
                  min="500"
                  max="3000"
                  step="50"
                  value={exportWidth}
                  onChange={(event) => setExportWidth(Number(event.target.value))}
                />
              </label>

              <label>
                <span>PNG height</span>
                <input
                  type="number"
                  min="400"
                  max="3000"
                  step="50"
                  value={exportHeight}
                  onChange={(event) => setExportHeight(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="style-switches">
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

      <div className="plot-shell" style={{ minHeight: plotHeight }}>
        {plotData.length === 0 ? (
          <div className="plot-empty">No processed data</div>
        ) : null}
        <div ref={plotRef} className="plot-canvas" style={{ minHeight: plotHeight }} />
      </div>
    </section>
  );
}
