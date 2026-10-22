import {emptyMetadata} from "../../src/types";
const output = document.getElementById("result")!;
const workers: Worker[] = [];
function send(worker: Worker, message: unknown): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Worker timeout")), 10000);
    worker.onmessage = event => {clearTimeout(timer); resolve(event.data);};
    worker.onerror = event => {clearTimeout(timer); reject(new Error(event.message));};
    worker.postMessage(message);
  });
}
async function verify() {
  const txt = new Worker(new URL("../../src/workers/txt.worker.ts", import.meta.url), {type: "module"}); workers.push(txt);
  const parsed = await send(txt, new File(["100 5\n101 bad\n102 10"], "synthetic.txt"));
  if (parsed.peaks.length !== 2 || parsed.warnings.length !== 1 || parsed.fingerprint.length !== 64) throw new Error("TXT parsing / fingerprint mismatch");
  const duplicate = await send(txt, new File(["100 5\n101 bad\n102 10"], "renamed.txt"));
  if (parsed.fingerprint !== duplicate.fingerprint) throw new Error("Renamed duplicate detection failed");
  const processor = new Worker(new URL("../../src/workers/processing.worker.ts", import.meta.url), {type: "module"}); workers.push(processor);
  const file = {id: "synthetic", filename: "synthetic.txt", metadata: emptyMetadata(), peaks: parsed.peaks, validLineCount: 2, invalidLineCount: 1, warnings: []};
  const result = await send(processor, {id: 1, changed: [file], ids: [file.id], ions: [{id: "ion", targetMz: 100, label: ""}], tolerance: .1});
  if (result.rows?.[0]?.absoluteIntensity !== 5) throw new Error("Background extraction failed");
  const changed = await send(processor, {id: 2, changed: [], ids: [file.id], ions: [{id: "ion", targetMz: 102, label: ""}], tolerance: .1});
  if (changed.rows?.[0]?.absoluteIntensity !== 10) throw new Error("Changed target used stale cached data");
  const raw = {...file, id: "raw", filename: "synthetic.raw", thermo: {fingerprint: "synthetic", channel: "MS2", instrument: "test", mode: "profile", method: "mean-scan-maximum",
    scans: [{timeSeconds: 0, peaks: [{mz:100, intensity:20}]}, {timeSeconds: 1, peaks: []}]}};
  const request = {changed: [], ids: [raw.id], ions: [{id: "ion", targetMz: 100, label: ""}], tolerance: .1};
  const fullRaw = await send(processor, {...request, id: 4, changed: [raw]});
  if (fullRaw.rows?.[0]?.absoluteIntensity !== 10) throw new Error("All-scan mean mismatch");
  const selectedRaw = await send(processor, {...request, id: 5, selections: [{id: raw.id, scanRanges: [{start:1,end:1}], scanSelectionReason: "Test"}]});
  if (selectedRaw.rows?.[0]?.absoluteIntensity !== 20 || selectedRaw.rows[0].thermoScanSelections[0].selected !== 1) throw new Error("Scan-only update or provenance mismatch");
  const resetRaw = await send(processor, {...request, id: 6, selections: [{id: raw.id}]});
  if (resetRaw.rows?.[0]?.absoluteIntensity !== 10) throw new Error("Reset to all scans failed");
  const invalidRange = await send(processor, {...request, id: 7, selections: [{id: raw.id, scanRanges: [{start:1,end:3}]}]});
  if (!invalidRange.error) throw new Error("Invalid live range accepted");
  const removed = await send(processor, {id: 3, changed: [], ids: [], ions: [], tolerance: .1});
  if (removed.rows?.length !== 0) throw new Error("Removed files remain in worker results");
  const bruker = new Worker(new URL("../../src/workers/bruker.worker.ts", import.meta.url), {type: "module"}); workers.push(bruker);
  const imported = await send(bruker, {data: {ascii: "0,-,ESI,ms1,-,line,50-800,1,100.2 10\n0.25,-,ESI,ms1,-,line,50-800,1,100.3 30", segments: "2\n1 0 30", source: "synthetic.d"}, scan: "min", segment: "s", settings: {}});
  if (imported.preview?.files?.[0]?.peaks?.length !== 2 || imported.channels?.length !== 1) throw new Error("Bruker background import failed");
  output.textContent = "PASS: TXT/Bruker workers, hashes, extraction, target changes, file removal, Thermo scan-only updates, provenance, reset and invalid-range rejection.";
}
void verify().catch(error => {output.textContent = `FAIL: ${String(error)}`;}).finally(() => workers.forEach(worker => worker.terminate()));
