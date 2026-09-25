import { emptyMetadata, type Peak, type SpectrumFile } from "../types";
import { createId } from "./id";
import { inferMetadataFromFilename } from "./filenameMetadata";

export type BrukerImport = {
  files: SpectrumFile[];
  warnings: string[];
  totalScans: number;
  assignedScans: number;
};

export type BrukerOptions = { mzDecimals?: number; intervalSeconds?: number };

export const roundMass = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const lower = Math.floor(scaled);
  // Preserve the lab Python script's ties-to-even rule, including integer masses.
  return (scaled - lower === 0.5 ? lower + lower % 2 : Math.round(scaled)) / factor;
};

export function parseBrukerExport(
  ascii: string,
  segmentText: string,
  source: string,
  scanUnit: "min" | "s" = "min",
  segmentUnit: "min" | "s" = "s",
  options: BrukerOptions = {},
): BrukerImport {
  const interval = options.intervalSeconds;
  if (interval !== undefined && (!Number.isFinite(interval) || interval <= 0)) throw new Error("Segment duration must be positive.");
  if (options.mzDecimals !== undefined && (!Number.isInteger(options.mzDecimals) || options.mzDecimals < 0 || options.mzDecimals > 6)) throw new Error("Choose 0–6 m/z decimals or original precision.");
  const lines = segmentText.replace(/^\uFEFF/, "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const expectedScans = Number(lines.shift());
  if (!Number.isInteger(expectedScans) || expectedScans <= 0 || !lines.length) {
    throw new Error("Segments.txt must start with the scan count, followed by segment / start / end rows.");
  }
  const exportedSegments = lines.map((line, index) => {
    const cells = line.split(/\s+/);
    const [id, rawStart, rawEnd] = cells.map(Number);
    const factor = segmentUnit === "min" ? 60 : 1;
    const start = rawStart * factor;
    const end = rawEnd * factor;
    if (cells.length !== 3 || !Number.isInteger(id) || id <= 0 ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new Error(`Invalid segment on row ${index + 2} of Segments.txt.`);
    }
    return { id, start, end, count: 0, peaks: [] as Peak[] };
  });
  const ids = new Set<number>();
  exportedSegments.forEach((segment, index) => {
    if (ids.has(segment.id) || (index > 0 && segment.start < exportedSegments[index - 1].end)) {
      throw new Error("Segments must have unique IDs and ordered, non-overlapping time intervals.");
    }
    ids.add(segment.id);
  });
  const segments = interval === undefined ? exportedSegments : [] as typeof exportedSegments;
  let totalScans = 0;
  let assignedScans = 0;
  let skippedScans = 0;
  let outsideScans = 0;
  const numeric = (value: string | undefined) => value?.trim() ? Number(value) : NaN;
  ascii.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    totalScans++;
    const fields = line.split(",").map(s => s.trim());
    const time = numeric(fields[0]) * (scanUnit === "min" ? 60 : 1);
    if (fields.length < 8 || !Number.isFinite(time) || time < 0) {
      throw new Error(`Invalid scan header on data.ascii row ${index + 1}.`);
    }
    if (fields[2] !== "ESI" || fields[3] !== "ms1") { skippedScans++; return; }
    if (fields[5] !== "line") throw new Error("Export line spectra (daLine), not profile spectra, from DataAnalysis.");
    const expectedPeaks = numeric(fields[7]);
    const pairs = fields.slice(8);
    if (pairs[pairs.length - 1] === "") pairs.pop();
    if (!Number.isInteger(expectedPeaks) || expectedPeaks < 0 || pairs.length !== expectedPeaks) {
      throw new Error(`Peak count mismatch on data.ascii row ${index + 1}.`);
    }
    let segment: typeof exportedSegments[number] | undefined;
    if (interval !== undefined) {
      // Work in the source time unit to match the old Python binning operation.
      const bin = Math.floor(numeric(fields[0]) / (interval / (scanUnit === "min" ? 60 : 1)));
      if (bin > 100000) throw new Error("Too many segments. Check the time unit and interval.");
      while (segments.length <= bin) {
        const i = segments.length;
        segments.push({ id: i + 1, start: i * interval, end: (i + 1) * interval, count: 0, peaks: [] });
      }
      segment = segments[bin];
    } else {
      segment = segments.find((s, i) => time >= s.start &&
        (time < s.end || (i === segments.length - 1 && time === s.end)));
    }
    // Validate even out-of-range rows, so damaged exports cannot pass silently.
    pairs.forEach(pair => {
      const values = pair.trim().split(/\s+/);
      const [mz, intensity] = values.map(Number);
      if (values.length !== 2 || !Number.isFinite(mz) || mz <= 0 || !Number.isFinite(intensity) || intensity < 0) {
        throw new Error(`Invalid m/z–intensity pair on data.ascii row ${index + 1}.`);
      }
      if (segment) {
        segment.peaks.push({ mz, intensity });
      }
    });
    if (segment) { segment.count++; assignedScans++; } else outsideScans++;
  });
  if (!assignedScans) throw new Error("No ESI ms1 scans fall inside the segments. Check both time units and the export files.");
  const warnings: string[] = [];
  if (expectedScans !== totalScans) warnings.push(`Segments.txt expects ${expectedScans} scans; data.ascii contains ${totalScans}. Check that these exports belong to the same run.`);
  if (skippedScans) warnings.push(`${skippedScans} scans excluded because they are not ESI ms1.`);
  if (outsideScans) warnings.push(`${outsideScans} ESI ms1 scans lie outside the exported intervals and are excluded. The original Bruker script truncates boundaries to whole seconds; check gaps and the last segment.`);
  const metadata = { ...emptyMetadata(), ...inferMetadataFromFilename(source.replace(/\.d$/i, "")) };
  // A filename's irradiation duration must not become the acquisition-time axis.
  metadata.acqTime = "";
  metadata.activationTime = "";
  segments.filter(s => !s.count).forEach(s => warnings.push(`Segment ${s.id} contains no scans.`));
  const runId = createId("run");
  const calculation = options.mzDecimals === undefined ? "Original m/z, tolerance window" : `m/z rounded to ${options.mzDecimals} decimals (ties to even), exact mass bin`;
  const files = segments.map(s => {
    const peaks = s.peaks;
    const segmentWarnings = s.count ? [] : ["No scans in this segment; exclude it from the plot if appropriate."];
    return {
      id: createId("bruker"), filename: `${source} — segment ${s.id}`,
      metadata: { ...metadata, segment: String(s.id), retentionTime: String(interval === undefined ? (s.start + s.end) / 2 : s.start),
        notes: `Bruker: ${s.start}–${s.end} s; ${s.count} scans. ${calculation}; mean of observed intensities. ${interval === undefined ? "Exported boundaries, midpoint time." : `Fixed ${interval} s intervals, start time.`} Original peaks retained. ${warnings.join(" ")}` },
      peaks, validLineCount: peaks.length, invalidLineCount: 0, warnings: segmentWarnings,
      bruker: { source, segment: s.id, startSeconds: s.start, endSeconds: s.end, scanCount: s.count,
        method: options.mzDecimals === undefined ? "exact-mz-window-observed-mean" as const : "rounded-mz-observed-mean" as const,
        ...(options.mzDecimals === undefined ? {} : { mzDecimals: options.mzDecimals }),
        ...(interval === undefined ? {} : { intervalSeconds: interval }), runId },
    };
  });
  return { files, warnings, totalScans, assignedScans };
}

export function findBrukerFiles(files: File[]) {
  const candidates = files.filter(f => /^(data\.ascii|segments\.txt)$/i.test(f.name));
  const ascii = candidates.filter(f => f.name.toLowerCase() === "data.ascii");
  const segments = candidates.filter(f => f.name.toLowerCase() === "segments.txt");
  if (ascii.length !== 1 || segments.length !== 1) {
    throw new Error("Select one .d folder containing exactly one data.ascii and one Segments.txt, or select those two files together. Run the export method in DataAnalysis first.");
  }
  const parent = (f: File) => f.webkitRelativePath?.split("/").slice(0, -1).join("/") ?? "";
  if (parent(ascii[0]) !== parent(segments[0])) throw new Error("Both export files must be in the same folder.");
  return { ascii: ascii[0], segments: segments[0], source: parent(ascii[0]).split("/").pop() || "Bruker run" };
}
