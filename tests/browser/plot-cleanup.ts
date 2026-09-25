import Plotly from "plotly.js-dist-min";
import { buildPlotData } from "../../src/utils/plot";
import { emptyMetadata, type ProcessedRow } from "../../src/types";

// Open /tests/browser/plot-cleanup.html in the Vite dev server. Exercise the real
// library, since string-only tests cannot detect its unescaped CSS selectors.
const plot = document.getElementById("plot")!;
const result = document.getElementById("result")!;
const rows: ProcessedRow[] = [0, 30].map(time => ({
  id: `row-${time}`, fileId: `file-${time}`, ionId: 'ion-"241"', seriesId: "run-[one]",
  filename: "synthetic", metadata: { ...emptyMetadata(), retentionTime: String(time) },
  targetMz: 241, foundMz: 241, label: "", absoluteIntensity: time + 1,
  relativeIntensity: 100, selectedIonPercent: 100, warning: "",
}));
const data = () => buildPlotData(rows, "retentionTime", "absolute", true, {
  colors: {}, lineWidth: 2, markerSize: 5, lineShape: "linear", curveMode: "connect", polynomialDegree: 3,
});
const layout = { width: 500, height: 300 };

async function checkCleanup() {
  // Negative control: confirm the old UID reproduces the reported crash.
  const oldData = data().map(trace => ({ ...trace, uid: JSON.stringify([trace.legendgroup, trace.mode]) }));
  await Plotly.react(plot, oldData, layout);
  let reproduced = false;
  try { Plotly.purge(plot); } catch (error) { reproduced = error instanceof Error && /selector/i.test(error.message); }
  if (!reproduced) throw new Error("The old identifier did not reproduce the selector failure");
  // Use a fresh element: the failed legacy purge leaves a partially cleared graph.
  const repaired = document.createElement("div");
  plot.replaceWith(repaired);
  await Plotly.react(repaired, data(), layout);
  await Plotly.react(repaired, [], layout); // Removing ions invokes cleanPlot.
  await Plotly.react(repaired, data(), layout);
  Plotly.purge(repaired); // Opening a project/unmounting the panel invokes purge.
  result.textContent = "PASS: old IDs reproduce the selector crash; corrected IDs support replacing ions and purging the plot.";
}
void checkCleanup().catch(error => { result.textContent = `FAIL: ${String(error)}`; });
