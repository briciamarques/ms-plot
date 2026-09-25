import { useMemo, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import type { SpectrumFile } from "../types";
import { downloadTextFile } from "../utils/csv";
import { segmentSpectrum, segmentSpectrumFilename, spectrumToTxt } from "../utils/segmentSpectrum";

export function SegmentSpectrumExport({ files, isActive }: { files: SpectrumFile[]; isActive: boolean }) {
  const segments = useMemo(() => files.filter(file => file.bruker), [files]);
  const [selectedId, setSelectedId] = useState("");
  const [precision, setPrecision] = useState("segment");
  const [copyStatus, setCopyStatus] = useState<{ text: string; message: string } | null>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const selected = segments.find(file => file.id === selectedId) ?? segments[0];
  const legacy = selected?.bruker?.method === "nominal-mz-observed-mean";
  const decimals = legacy ? 0 : precision === "segment" ? selected?.bruker?.mzDecimals
    : precision === "original" ? undefined : Number(precision);
  const peaks = useMemo(() => isActive && selected ? segmentSpectrum(selected, decimals) : [], [isActive, selected, decimals]);
  const text = useMemo(() => spectrumToTxt(peaks), [peaks]);

  async function copySpectrum() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus({ text, message: `Copied ${peaks.length} m/z–intensity pairs.` });
    } catch {
      previewRef.current?.focus();
      previewRef.current?.select();
      setCopyStatus({ text, message: "Clipboard unavailable. The list is selected below: press Ctrl+C (or ⌘C) to copy." });
    }
  }

  return (
    <section className="workspace-section segment-spectrum">
      <div className="section-header">
        <div>
          <p className="section-kicker">Export a mass spectrum</p>
          <h2>Segment spectrum</h2>
        </div>
      </div>
      {!selected ? <p>Import Bruker segments or open a saved Bruker project to copy a segment's complete spectrum.</p> : <>
        <p>Choose a segment to copy its complete m/z and intensity list into a spectrum plotter. Includes all available masses, regardless of which ions are selected in the time plot.</p>
        <div className="bruker-actions segment-spectrum-controls">
          <label className="segment-spectrum-selector">Segment
            <select value={selected.id} onChange={event => { setSelectedId(event.target.value); setCopyStatus(null); }}>
              {segments.map((file, index) => <option key={file.id} value={file.id}>
                {index + 1}. {file.bruker!.source} — Segment {file.bruker!.segment}{file.metadata.wavelength ? ` · ${file.metadata.wavelength} nm` : file.metadata.condition === "Laser off" ? " · Laser off" : ""} ({file.bruker!.startSeconds}–{file.bruker!.endSeconds} s)
              </option>)}
            </select>
          </label>
          <label>Export m/z precision
            <select value={legacy ? "0" : precision} disabled={legacy} onChange={event => { setPrecision(event.target.value); setCopyStatus(null); }}>
              <option value="segment">Use segment settings ({selected.bruker?.mzDecimals === undefined ? "original m/z" : `${selected.bruker.mzDecimals} decimals`})</option>
              <option value="original">Original m/z</option>
              {[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value} decimal{value === 1 ? "" : "s"}{value === 0 ? " (integer m/z)" : ""}</option>)}
            </select>
          </label>
        </div>
        <p className="segment-spectrum-help">
          {legacy ? "This older project contains averaged integer masses. Reimport the Bruker exports to recover original m/z precision."
            : decimals === undefined ? "Original m/z: only identical masses are grouped; small mass differences between scans remain separate."
            : `m/z rounded to ${decimals} decimals; observations at the same rounded mass are grouped.`}
          {" "}Each intensity is the mean of the available observations at that mass, in absolute units. No time smoothing or percentage normalization is applied. Intensity decimals are preserved.
        </p>
        <div className="bruker-actions">
          <button type="button" className="secondary-button" disabled={!peaks.length} onClick={() => void copySpectrum()}><Copy size={16} aria-hidden="true" /> Copy m/z + intensity</button>
          <button type="button" className="secondary-button" disabled={!peaks.length} onClick={() => downloadTextFile(segmentSpectrumFilename(selected, decimals), text, "text/plain;charset=utf-8")}><Download size={16} aria-hidden="true" /> Download segment TXT</button>
        </div>
        <p>{peaks.length.toLocaleString()} masses · {selected.bruker?.scanCount.toLocaleString()} scans · Two tab-separated columns: m/z, intensity. No header.</p>
        <label className="segment-spectrum-preview">Spectrum list
          <textarea key={`${selected.id}-${decimals ?? "original"}`} ref={previewRef} readOnly value={text} rows={8} wrap="off" spellCheck={false} placeholder="This segment has no peaks." />
        </label>
        <p role="status">{copyStatus?.text === text ? copyStatus.message : ""}</p>
      </>}
    </section>
  );
}
