import Plotly from "plotly.js-dist-min";
import { insideLegendColumns, type PlotTrace } from "../../src/utils/plot";

const plot = document.getElementById("plot")!;
const result = document.getElementById("result")!;
const traces = [751.3, 659.2, 617.2, 375.2, 283.1, 241.1].map((mz, i) => ({
  x: [0, 1], y: [i + 1, i + 2], name: `<i>m/z</i> ${mz}`, type: "scatter", mode: "lines+markers",
  showlegend: true, legendgroup: String(i), legendrank: i, meta: {ionId: String(i)},
  line: {color: "#0072bd", width: 2, shape: "linear"}, marker: {color: "#0072bd", size: 5}, text: [], hovertemplate: "",
})) as PlotTrace[];

async function verify() {
  for (const width of [700, 1000]) for (const fontFamily of ["Arial", "Times New Roman"]) for (const columns of [1, 3]) for (const x of [0, 1]) {
    const margin = {l: 72, r: 32, t: 32, b: 60};
    const placed = insideLegendColumns(traces, columns, width - margin.l - margin.r, 16, x, .98);
    const legends = Object.fromEntries(Object.entries(placed.legends).map(([key, value]) => [key, {...value, font: {size: 16, family: fontFamily}}]));
    await Plotly.react(plot, placed.data, {width, height: 400, margin, showlegend: true, ...legends}, {displayModeBar: false});
    const svg = plot.querySelector<SVGSVGElement>('svg.main-svg')!.getBoundingClientRect();
    const columnName = x === 1 && columns > 1 ? `legend${columns}` : 'legend';
    const box = plot.querySelector<SVGElement>(`g.${columnName} > rect.bg`)!.getBoundingClientRect();
    const actual = x === 1 ? box.right : box.left;
    const expected = x === 1 ? svg.left + width - margin.r : svg.left + margin.l;
    if (Math.abs(actual - expected) > 1) throw new Error(`${fontFamily}, ${width}px, ${columns} columns, x=${x}: edge differs by ${actual - expected}px`);
  }
  result.textContent = 'PASS: rendered legend boxes reach both plot edges with 1/3 columns, two fonts and two figure widths.';
}
void verify().catch(error => {result.textContent = `FAIL: ${String(error)}`;});
