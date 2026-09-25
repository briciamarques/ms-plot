import { useState, type ChangeEvent } from "react";
import type { SpectrumFile } from "../types";
import { findBrukerFiles, parseBrukerExport, type BrukerImport as ImportResult } from "../utils/bruker";

export function BrukerImport({ onImport }: { onImport: (files: SpectrumFile[]) => void }) {
  const [input, setInput] = useState<{ ascii: string; segments: string; source: string }>();
  const [preview, setPreview] = useState<ImportResult>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanUnit, setScanUnit] = useState<"min" | "s">("min");
  const [segmentUnit, setSegmentUnit] = useState<"min" | "s">("s");
  const [acknowledged, setAcknowledged] = useState(false);

  const prepare = (data: NonNullable<typeof input>, scan: typeof scanUnit, segment: typeof segmentUnit) => {
    setPreview(undefined);
    setAcknowledged(false);
    try {
      setPreview(parseBrukerExport(data.ascii, data.segments, data.source, scan, segment));
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not read exports."); }
  };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    setBusy(true); setPreview(undefined); setInput(undefined); setStatus("Reading exports…");
    try {
      const pair = findBrukerFiles(selected);
      const [ascii, segments] = await Promise.all([pair.ascii.text(), pair.segments.text()]);
      const data = { ascii, segments, source: pair.source };
      setInput(data);
      prepare(data, scanUnit, segmentUnit);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not read folder."); }
    finally { setBusy(false); }
  };
  return <section className="workspace-section bruker-import">
    <div className="section-header"><div><p className="section-kicker">Input</p><h2>Bruker files</h2></div></div>
    <p>Run the export method in DataAnalysis, then choose your .d folder. The app reads data.ascii and Segments.txt locally in your browser.</p>
    <div className="bruker-actions">
      <label className="primary-file-button">Choose .d folder
        <input type="file" multiple {...{ webkitdirectory: "" }} onChange={choose} disabled={busy} />
      </label>
      <label className="secondary-button import-project-button">Choose both export files
        <input type="file" multiple accept=".ascii,.txt" onChange={choose} disabled={busy} />
      </label>
    </div>
    <p className="bruker-help">The .d item is a folder. Raw Bruker binary files are not read. No Python or Excel step is needed after export.</p>
    <div className="bruker-actions">
      <label>Scan times in data.ascii
        <select value={scanUnit} disabled={busy} onChange={e => {
          const unit = e.target.value as typeof scanUnit; setScanUnit(unit); if (input) prepare(input, unit, segmentUnit);
        }}><option value="min">Minutes (standard export)</option><option value="s">Seconds</option></select>
      </label>
      <label>Boundaries in Segments.txt
        <select value={segmentUnit} disabled={busy} onChange={e => {
          const unit = e.target.value as typeof segmentUnit; setSegmentUnit(unit); if (input) prepare(input, scanUnit, unit);
        }}><option value="s">Seconds (lab method)</option><option value="min">Minutes</option></select>
      </label>
    </div>
    <p>Original exported m/z and intensity decimals are retained. For each target, the plot uses the mean of observed peak intensities within your m/z tolerance; found m/z is the arithmetic mean of those matched masses. Missing peaks are not counted as zero in that mean. Acquisition time is the segment midpoint in seconds.</p>
    <p>Decimal segment boundaries are preserved when present. The original export script removes their decimals; re-export with a precision-preserving method to recover them. Intervals include the start and exclude the end, except the final end. Gaps are preserved.</p>
    {status && <p role="status">{status}</p>}
    {preview && <>
      <h3>{input?.source}</h3>
      <p>After adding, save the project to reopen these segments without the original folder.</p>
      <p>{preview.files.length} segments · {preview.assignedScans} assigned scans / {preview.totalScans} exported scans</p>
      {preview.warnings.length > 0 && <div className="bruker-warning" role="status">
        <ul>{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        <label className="checkbox-label"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I reviewed these import warnings</label>
      </div>}
      <div className="table-shell bruker-preview"><table className="data-table"><thead><tr><th>Segment</th><th>Start (s)</th><th>End (s)</th><th>Midpoint (s)</th><th>Scans</th><th>Exported peaks</th></tr></thead>
        <tbody>{preview.files.map(f => <tr key={f.id}><td>{f.bruker?.segment}</td><td>{f.bruker?.startSeconds}</td><td>{f.bruker?.endSeconds}</td><td>{f.metadata.retentionTime}</td><td>{f.bruker?.scanCount}</td><td>{f.peaks.length}</td></tr>)}</tbody>
      </table></div>
      <button type="button" className="secondary-button" disabled={busy || (preview.warnings.length > 0 && !acknowledged)} onClick={() => {
        onImport(preview.files); setPreview(undefined); setInput(undefined); setStatus("Segments added. Use Ions and Plot, or save your project above.");
      }}>Add segments to project</button>
    </>}
  </section>;
}
