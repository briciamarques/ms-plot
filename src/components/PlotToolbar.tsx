import { useState } from "react";
export function PlotToolbar({disabled, exporting, collapsed, onCollapse, onImage, onData}: {
  disabled: boolean; exporting: boolean; collapsed: boolean; onCollapse: () => void;
  onImage: (format: "png" | "svg") => void; onData: (format: "csv" | "txt") => void;
}) {
  const [format, setFormat] = useState("png");
  return <div className="section-header plot-toolbar"><div><p className="section-kicker">Visualization</p><h2>Plot</h2></div>
    <div className="plot-export-actions"><button type="button" className="secondary-button" onClick={onCollapse} aria-expanded={!collapsed} aria-controls="plot-settings">{collapsed ? "Show settings" : "Expand plot"}</button>
      <label>Export format<select value={format} onChange={event => setFormat(event.target.value)}><option value="png">PNG image</option><option value="svg">SVG vector image</option><option value="csv">Plotted data CSV</option><option value="txt">Plotted data TXT</option></select></label>
      <button type="button" className="primary-button" disabled={disabled || exporting} onClick={() => format === "png" || format === "svg" ? onImage(format) : onData(format as "csv" | "txt")}>{exporting ? "Exporting…" : "Export"}</button>
    </div></div>;
}
