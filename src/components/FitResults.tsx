import type { PlotTrace } from "../utils/plot";
import { downloadTextFile } from "../utils/csv";
export function FitResults({traces, filename}: {traces: PlotTrace[]; filename: string}) {
  const fits = traces.filter(trace => trace.meta.fit);
  if (!fits.length) return null;
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const exportResults = () => downloadTextFile(`${filename}-fit-residuals.csv`, [
    ["curve", "model", "parameters", "R2", "RMSE", "x", "residual (measured - fitted)"].map(quote).join(","),
    ...fits.flatMap(trace => {const fit = trace.meta.fit!; return fit.x.map((x, i) => [trace.name.replace(/<[^>]*>/g, ""), fit.model, fit.parameters, fit.rSquared, fit.rmse, x, fit.residuals[i]].map(quote).join(","));}),
  ].join("\n"), "text/csv;charset=utf-8");
  return <details className="fit-results"><summary>Fit results · {fits.length} curves</summary><p>Unweighted fits to plotted values. Residual = measured − fitted. R² is descriptive and does not establish a kinetic mechanism.</p><button type="button" className="secondary-button" onClick={exportResults}>Export fit parameters and residuals</button><div className="table-shell"><table><thead><tr><th>Curve</th><th>Model</th><th>R²</th><th>RMSE</th><th>Parameters</th></tr></thead><tbody>{fits.map(trace => <tr key={trace.uid}><td>{trace.name.replace(/<[^>]*>/g, "")}</td><td>{trace.meta.fit!.model}</td><td>{trace.meta.fit!.rSquared.toPrecision(5)}</td><td>{trace.meta.fit!.rmse.toPrecision(5)}</td><td>{trace.meta.fit!.parameters}</td></tr>)}</tbody></table></div></details>;
}
