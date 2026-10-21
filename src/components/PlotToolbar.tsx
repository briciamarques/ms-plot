import { useState } from "react";
export function PlotToolbar({disabled, exporting, collapsed, onCollapse, expanded, onExpand, previewZoom, onPreviewZoom, onImage, onData}: {
  disabled: boolean; exporting: boolean; collapsed: boolean; onCollapse: () => void;
  expanded: boolean; onExpand: () => void; previewZoom: string; onPreviewZoom: (zoom: string) => void;
  onImage: (format: "png" | "svg") => void; onData: (format: "csv" | "txt") => void;
}) {
  const [format, setFormat] = useState("png");
  return <div className="section-header plot-toolbar"><div><h2>Plot</h2></div>
    <div className="plot-export-actions">
      <button id="plot-expand-toggle" type="button" className="secondary-button" onClick={onExpand} aria-pressed={expanded} title={expanded ? "Return to the workspace (Esc)" : "Use the whole window while keeping plot settings available"}>{expanded ? "Exit expanded view" : "Expand workspace"}</button>
      <button type="button" className="secondary-button" onClick={onCollapse} aria-expanded={!collapsed} aria-controls="plot-settings">{collapsed ? "Show settings" : "Hide settings"}</button>
      <label title="Preview only; exported image dimensions do not change">Preview zoom<select value={previewZoom} onChange={event => onPreviewZoom(event.target.value)}><option value="fit">Fit figure</option><option value="width">Fill width</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
      <label>Export format<select value={format} onChange={event => setFormat(event.target.value)}><option value="png">PNG image</option><option value="svg">SVG vector image</option><option value="csv">Plotted data CSV</option><option value="txt">Plotted data TXT</option></select></label>
      <button type="button" className="primary-button" disabled={disabled || exporting} onClick={() => format === "png" || format === "svg" ? onImage(format) : onData(format as "csv" | "txt")}>{exporting ? "Exporting…" : "Export"}</button>
    </div></div>;
}
