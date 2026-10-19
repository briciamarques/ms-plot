import type { SpectrumFile, YMode } from "../types";
export function MethodSummary({files, tolerance, yMode, curveMode, window, replicateMode, rows}: {
  files: SpectrumFile[]; tolerance: number; yMode: YMode; curveMode: string; window: number; replicateMode: string; rows: number;
}) {
  const methods = [...new Set(files.map(file => file.thermo ? "Thermo: scan maximum, then mean of all scans (missing = zero)" : file.bruker ? `Bruker: observed-peak mean${file.bruker.mzDecimals !== undefined ? `, ${file.bruker.mzDecimals} decimal mass bins (tolerance ignored)` : ""}` : "TXT: maximum in the target window"))];
  return <details className="method-summary"><summary>{files.length} input files · {rows} plotted rows · {yMode === "absolute" ? "Absolute intensity" : yMode === "selectedSum" ? "Share of selected ions" : "Each ion / own maximum"} · {replicateMode === "individual" ? "Individual files" : `Mean ± ${replicateMode.toUpperCase()}`} · Method details</summary>
    <div>{methods.map(method => <p key={method}>{method}</p>)}<p>Target tolerance: ±{tolerance} m/z (unrounded extraction). {curveMode === "movingAverage" ? `Lines: centered ${window}-point moving average; dots: measured values.` : curveMode === "connect" ? "Lines connect measured points." : `Dashed lines: ${curveMode} fit; dots: measured values.`}</p>
      <p>Plot CSV/TXT contains measured plotted values, selected-file/axis filtering and replicate statistics; moving-average values have a separate column. Fitted curves and temporary legend hiding are not applied to those measured values. Data exports all individual results.</p>
      {methods.length > 1 && <p className="validation-notice">This plot combines extraction methods. Confirm their comparability before interpreting intensity differences.</p>}
    </div></details>;
}
