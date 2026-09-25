import type { Peak, SpectrumFile } from "../types";
import { roundMass } from "./bruker";

// Match the time-series importer: mean over observed peaks in each mass bin,
// not a sum or a scan mean with missing observations replaced by zero.
export function segmentSpectrum(file: SpectrumFile, decimals?: number): Peak[] {
  const bins = new Map<number, { sum: number; count: number }>();
  for (const peak of file.peaks) {
    const mz = decimals === undefined ? peak.mz : roundMass(peak.mz, decimals);
    const bin = bins.get(mz) ?? { sum: 0, count: 0 };
    bin.sum += peak.intensity;
    bin.count++;
    bins.set(mz, bin);
  }
  return [...bins].map(([mz, bin]) => ({ mz, intensity: bin.sum / bin.count }))
    .sort((a, b) => a.mz - b.mz);
}

export function spectrumToTxt(peaks: Peak[]): string {
  return peaks.map(peak => `${peak.mz}\t${peak.intensity}`).join("\n");
}

export function segmentSpectrumFilename(file: SpectrumFile, decimals?: number): string {
  const segment = file.bruker;
  const source = (segment?.source ?? file.filename).replace(/\.d$/i, "");
  const name = segment
    ? `${source}_segment-${segment.segment}_${segment.startSeconds}-${segment.endSeconds}s`
    : source;
  return `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}_mz-${decimals === undefined ? "original" : `${decimals}dp`}.txt`;
}
