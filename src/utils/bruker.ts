import { emptyMetadata, type Peak, type SpectrumFile } from "../types";
import { createId } from "./id";
import { inferMetadataFromFilename } from "./filenameMetadata";

export type BrukerImport = {
  files: SpectrumFile[];
  warnings: string[];
  totalScans: number;
  assignedScans: number;
};

export type BrukerOptions = { mzDecimals?: number; intervalSeconds?: number; channelId?: string };

const scanChannel = (fields: string[]) => {
  if (fields[2] !== "ESI" || !/^ms[1-9]\d*$/.test(fields[3] ?? "")) return undefined;
  const msLevel = Number(fields[3].slice(2));
  const precursor = msLevel > 1 ? fields[4] : "";
  const polarity = fields[1];
  return { id: JSON.stringify([msLevel, precursor, polarity]), msLevel, precursor, polarity,
    label: `ESI ${fields[3].toUpperCase()} (${polarity})${precursor ? ` · precursor m/z ${precursor}` : ""}` };
};

export function brukerChannels(ascii: string) {
  const channels = new Map<string, NonNullable<ReturnType<typeof scanChannel>> & { count: number }>();
  ascii.replace(/^\uFEFF/, "").split(/\r?\n/).forEach(line => {
    const channel = scanChannel(line.split(",").map(s => s.trim()));
    if (channel) channels.set(channel.id, { ...channel, count: (channels.get(channel.id)?.count ?? 0) + 1 });
  });
  return [...channels.values()];
}

export function wavelengthSequence(count: number, start: number, end: number, step: number, firstOff: boolean): string[] {
  if (![start, end, step].every(Number.isFinite) || start <= 0 || end <= 0 || step === 0) throw new Error("Enter positive wavelengths and a nonzero step.");
  const intervals = (end - start) / step;
  if (intervals < 0 || Math.abs(intervals - Math.round(intervals)) > 1e-8) throw new Error("The step must reach the final wavelength exactly. Use a negative step for decreasing wavelengths.");
  const expected = Math.round(intervals) + 1 + Number(firstOff);
  if (expected !== count) throw new Error(`This sequence needs ${expected} segments, but the export has ${count}. Check the step and whether the first segment is laser off.`);
  return Array.from({ length: count }, (_, i) => firstOff && i === 0 ? "off" : String(Number((start + (i - Number(firstOff)) * step).toPrecision(14))));
}

export function assignWavelengths(files: SpectrumFile[], values: string[]): SpectrumFile[] {
  if (values.length !== files.length) throw new Error("Assign a wavelength or reference label to every segment.");
  let numericCount = 0;
  const mapped = files.map((file, i) => {
    const value = values[i].trim();
    const off = value.toLowerCase() === "off";
    if (value && !off && (!/^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0)) throw new Error(`Segment ${file.bruker?.segment}: enter a positive wavelength, off, or leave blank.`);
    if (value && !off) numericCount++;
    return { ...file, metadata: { ...file.metadata, wavelength: off ? "" : value,
      condition: off ? "Laser off" : file.metadata.condition,
      notes: `${file.metadata.notes} Wavelength assignment: ${off ? "laser off (reference)" : value ? `${value} nm` : "unassigned reference"}.` } };
  });
  if (!numericCount) throw new Error("Assign at least one numeric wavelength before adding segments.");
  return mapped;
}

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
  const channels = brukerChannels(ascii);
  const channel = options.channelId ? channels.find(c => c.id === options.channelId) : channels.length === 1 ? channels[0] : undefined;
  if (!channel) throw new Error(channels.length > 1 ? "Multiple spectrum types found. Choose one spectrum type to avoid mixing precursors, polarities or MS levels." : "No supported ESI scans found for the selected spectrum type.");
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
  let roundedBoundaryScans = 0;
  const numeric = (value: string | undefined) => value?.trim() ? Number(value) : NaN;
  ascii.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    totalScans++;
    const fields = line.split(",").map(s => s.trim());
    const time = numeric(fields[0]) * (scanUnit === "min" ? 60 : 1);
    if (fields.length < 8 || !Number.isFinite(time) || time < 0) {
      throw new Error(`Invalid scan header on data.ascii row ${index + 1}.`);
    }
    if (scanChannel(fields)?.id !== channel.id) { skippedScans++; return; }
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
      if (!segment) {
        // ASCII scan times may have fewer decimals than Segments.txt. Only repair
        // a uniquely matching boundary within half the exported timestamp unit,
        // capped at 10 ms; never bridge real gaps or move an already assigned scan.
        const [mantissa, exponent = "0"] = fields[0].toLowerCase().split("e");
        const decimals = mantissa.split(".")[1]?.length ?? 0;
        const precision = 0.5 * 10 ** (Number(exponent) - decimals) * (scanUnit === "min" ? 60 : 1);
        const epsilon = Math.min(0.01, precision) + 1e-10;
        const candidates = segments.filter(s => time >= s.start - epsilon && time <= s.end + epsilon);
        if (candidates.length === 1) { segment = candidates[0]; roundedBoundaryScans++; }
      }
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
  if (!assignedScans) throw new Error("No selected scans fall inside the segments. Check both time units and the export files.");
  const warnings: string[] = [];
  if (expectedScans !== totalScans) warnings.push(`Segments.txt expects ${expectedScans} scans; data.ascii contains ${totalScans}. Check that these exports belong to the same run.`);
  if (skippedScans) warnings.push(`${skippedScans} scans excluded because they do not match ${channel.label}.`);
  if (roundedBoundaryScans) warnings.push(`${roundedBoundaryScans} scan${roundedBoundaryScans === 1 ? "" : "s"} matched a unique segment boundary within the rounding precision of the exported scan timestamp (at most 0.01 s). Original times and peaks are unchanged.`);
  if (outsideScans) warnings.push(`${outsideScans} selected scans lie outside the exported intervals and are excluded. Check gaps, timestamp precision and the last segment.`);
  const metadata = { ...emptyMetadata(), ...inferMetadataFromFilename(source.replace(/\.d$/i, "")) };
  // A filename's irradiation duration must not become the acquisition-time axis.
  metadata.acqTime = "";
  metadata.activationTime = "";
  if (channel.precursor && Number.isFinite(Number(channel.precursor))) metadata.parentIon = channel.precursor;
  segments.filter(s => !s.count).forEach(s => warnings.push(`Segment ${s.id} contains no scans.`));
  const runId = createId("run");
  const calculation = options.mzDecimals === undefined ? "Original m/z, tolerance window" : `m/z rounded to ${options.mzDecimals} decimals (ties to even), exact mass bin`;
  const files = segments.map(s => {
    const peaks = s.peaks;
    const segmentWarnings = s.count ? [] : ["No scans in this segment; exclude it from the plot if appropriate."];
    return {
      id: createId("bruker"), filename: `${source} — segment ${s.id}`,
      metadata: { ...metadata, segment: String(s.id), retentionTime: String(interval === undefined ? (s.start + s.end) / 2 : s.start),
        notes: `Bruker ${channel.label}: ${s.start}–${s.end} s; ${s.count} scans. ${calculation}; mean of observed intensities. ${interval === undefined ? "Exported boundaries, midpoint time." : `Fixed ${interval} s intervals, start time.`} Original peaks retained. ${warnings.join(" ")}` },
      peaks, validLineCount: peaks.length, invalidLineCount: 0, warnings: segmentWarnings,
      bruker: { source, segment: s.id, startSeconds: s.start, endSeconds: s.end, scanCount: s.count,
        msLevel: channel.msLevel, precursor: channel.precursor, polarity: channel.polarity,
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
