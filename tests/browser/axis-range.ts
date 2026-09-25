import Plotly from "plotly.js-dist-min";
import { axisRange, axisRangeLayout } from "../../src/utils/axisRange";

const plot = document.getElementById("plot")!;
const result = document.getElementById("result")!;
const api = Plotly as typeof Plotly & { relayout: (root: HTMLElement, update: Record<string, unknown>) => Promise<unknown> };
const ranges = () => (plot as HTMLElement & { _fullLayout: { xaxis: { range: number[] }; yaxis: { range: number[] } } })._fullLayout;
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

async function verify() {
  const data = [{x:[0,15],y:[0,100],type:'scatter',mode:'lines+markers'}];
  const layout = {width:700,height:450,xaxis:axisRangeLayout(axisRange('', '', [0,15]).range),yaxis:axisRangeLayout(axisRange('', '', [0,100]).range)};
  await Plotly.react(plot, data, layout);
  check(ranges().xaxis.range[1] === 15.3 && ranges().yaxis.range[1] === 102, 'Automatic margins are not 2%');
  const fixed = {...layout, xaxis:axisRangeLayout(axisRange('0','15',[0,15]).range),yaxis:axisRangeLayout(axisRange('0','100',[0,100]).range)};
  await Plotly.react(plot, data, fixed);
  check(ranges().xaxis.range[0] === 0 && ranges().yaxis.range[0] === 0, 'Manual zeros drifted');
  await api.relayout(plot, {'xaxis.range':[3,9], 'yaxis.range':[20,70]});
  await api.relayout(plot, {'xaxis.autorange':true, 'yaxis.autorange':true});
  check(JSON.stringify(ranges().xaxis.range) === '[0,15]' && JSON.stringify(ranges().yaxis.range) === '[0,100]', 'Autoscale ignored manual bounds');
  await Plotly.react(plot, [{x:[0,0],y:[0,0],type:'scatter'}], {...layout,xaxis:axisRangeLayout(axisRange('0','',[0,0]).range),yaxis:axisRangeLayout(axisRange('0','',[0,0]).range)});
  check(ranges().xaxis.range[0] === 0 && ranges().yaxis.range[0] === 0, 'Constant data moved the zero below the frame');
  Plotly.purge(plot);
  result.textContent = 'PASS: 2% automatic margins; exact manual zeros, including after zoom/autoscale and with all-zero data.';
}
void verify().catch(error => { result.textContent = `FAIL: ${String(error)}`; });
