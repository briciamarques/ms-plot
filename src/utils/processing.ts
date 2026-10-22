import type {
  NumericIonTarget,
  Peak,
  ProcessedRow,
  SpectrumFile,
} from "../types";
import { roundMass } from "./bruker";
import { formatScanRanges } from "./thermoScans";

export type ExtractedIonIntensity = {
  foundMz: number | null;
  intensity: number;
  warning: string;
};

// Metadata and labels do not change extraction. Weak keys release old spectra.
const extractionCache = new WeakMap<object, {configuration: string; values: Map<number, ExtractedIonIntensity>}>();
function cachedExtraction(file: SpectrumFile, mass: number, tolerance: number): ExtractedIonIntensity {
  const source = file.thermo?.scans ?? file.peaks;
  const configuration = JSON.stringify([tolerance, file.bruker?.method, file.bruker?.mzDecimals, !!file.thermo, file.thermo?.scanRanges]);
  let cache = extractionCache.get(source);
  if (!cache || cache.configuration !== configuration) {
    cache = {configuration, values: new Map()}; extractionCache.set(source, cache);
  }
  const existing = cache.values.get(mass);
  if (existing) return existing;
  const extracted = file.thermo ? extractThermoIntensity(file, mass, tolerance)
    : file.bruker?.method === "exact-mz-window-observed-mean" || file.bruker?.method === "rounded-mz-observed-mean"
    ? extractBrukerIntensity(file.peaks, mass, tolerance, file.bruker.mzDecimals)
    : extractIonIntensity(file.peaks, mass, tolerance);
  if (cache.values.size >= 256) cache.values.clear();
  cache.values.set(mass, extracted);
  return extracted;
}

export const extractIonIntensity = (
  peaks: Peak[],
  targetMz: number,
  tolerance: number,
): ExtractedIonIntensity => {
  const safeTolerance = Math.max(0, tolerance);
  const matchingPeaks = peaks.filter(
    (peak) => Math.abs(peak.mz - targetMz) <= safeTolerance,
  );

  if (matchingPeaks.length === 0) {
    return {
      foundMz: null,
      intensity: 0,
      warning: "Peak not found",
    };
  }

  const mostIntensePeak = matchingPeaks.reduce((best, current) =>
    current.intensity > best.intensity ? current : best,
  );

  return {
    foundMz: mostIntensePeak.mz,
    intensity: mostIntensePeak.intensity,
    warning: "",
  };
};

export const normalizeIntensities = (
  rows: Omit<ProcessedRow, "relativeIntensity" | "selectedIonPercent">[],
): ProcessedRow[] => {
  const maxByIon = new Map<string, number>();
  const sumByFile = new Map<string, number>();

  rows.forEach((row) => {
    sumByFile.set(row.fileId, (sumByFile.get(row.fileId) ?? 0) + row.absoluteIntensity);
    const currentMax = maxByIon.get(row.ionId) ?? 0;
    if (row.absoluteIntensity > currentMax) {
      maxByIon.set(row.ionId, row.absoluteIntensity);
    }
  });

  return rows.map((row) => {
    const maxIntensity = maxByIon.get(row.ionId) ?? 0;
    const relativeIntensity =
      maxIntensity > 0 ? (row.absoluteIntensity / maxIntensity) * 100 : 0;

    return {
      ...row,
      relativeIntensity,
      selectedIonPercent: (sumByFile.get(row.fileId) ?? 0) > 0
        ? 100 * row.absoluteIntensity / sumByFile.get(row.fileId)! : 0,
    };
  });
};

export const extractBrukerIntensity = (
  peaks: Peak[], targetMz: number, tolerance: number, decimals?: number,
): ExtractedIonIntensity => {
  let count = 0;
  let intensitySum = 0;
  let mzSum = 0;
  for (const peak of peaks) {
    const mass = decimals === undefined ? peak.mz : roundMass(peak.mz, decimals);
    if (decimals === undefined ? Math.abs(mass - targetMz) <= Math.max(0, tolerance) : mass === roundMass(targetMz, decimals)) {
      count++;
      intensitySum += peak.intensity;
      mzSum += mass;
    }
  }
  return count ? { foundMz: mzSum / count, intensity: intensitySum / count, warning: "" }
    : { foundMz: null, intensity: 0, warning: "Peak not found" };
};

export const processSpectra = (
  files: SpectrumFile[],
  ions: NumericIonTarget[],
  tolerance: number,
): ProcessedRow[] => {
  const rows = files.flatMap((file) =>
    ions.map((ion) => {
      const extraction = cachedExtraction(file, ion.targetMz, tolerance);
      const fileWarning = file.peaks.length === 0 ? "File has no valid data" : "";
      const warning = [fileWarning || extraction.warning, ...file.warnings].filter(Boolean).join("; ");

      return {
        id: `${file.id}-${ion.id}`,
        fileId: file.id,
        ionId: ion.id,
        filename: file.filename,
        ...(file.bruker ? { seriesId: file.bruker.runId ?? file.bruker.source } : {}),
        ...(file.thermo ? { acquisitionKey: file.thermo.channel,
          thermoScanSelections: [{filename: file.filename, channel: file.thermo.channel,
            ranges: formatScanRanges(file.thermo.scanRanges) || "all",
            selected: file.thermo.scanRanges?.reduce((sum, range) => sum + range.end - range.start + 1, 0) ?? file.thermo.scans.length,
            total: file.thermo.scans.length, reason: file.thermo.scanSelectionReason ?? ""}],
          seriesId: JSON.stringify([file.thermo.channel, file.metadata.compound, file.metadata.concentration, file.metadata.condition, file.metadata.experiment, file.metadata.replicate]) } : {}),
        metadata: file.metadata,
        targetMz: ion.targetMz,
        foundMz: extraction.foundMz,
        label: ion.label,
        absoluteIntensity: extraction.intensity,
        warning,
      };
    }),
  );

  return normalizeIntensities(rows);
};

// Keep per-scan extraction independent of range selection. Weak keys release
// removed acquisitions; bounded entries avoid retaining every inspected m/z.
const thermoScanCache = new WeakMap<object, {tolerance: number; values: Map<number, {intensity: Float64Array; mz: Float64Array}>}>();
export function extractThermoIntensity(file: SpectrumFile, targetMz: number, tolerance: number): ExtractedIonIntensity {
  const {scans, scanRanges} = file.thermo!;
  if (!scans.length) return { foundMz: null, intensity: 0, warning: "No scans" };
  let cache = thermoScanCache.get(scans);
  if (!cache || cache.tolerance !== tolerance) {
    cache = {tolerance, values: new Map()}; thermoScanCache.set(scans, cache);
  }
  let values = cache.values.get(targetMz);
  if (!values) {
    values = {intensity: new Float64Array(scans.length), mz: new Float64Array(scans.length)};
    scans.forEach((scan, index) => {
      const extracted = extractIonIntensity(scan.peaks, targetMz, tolerance);
      values!.intensity[index] = extracted.intensity;
      values!.mz[index] = extracted.foundMz ?? NaN;
    });
    if (cache.values.size >= 64) cache.values.delete(cache.values.keys().next().value!);
    cache.values.set(targetMz, values);
  }
  let count = 0, found = 0, sum = 0, mzSum = 0;
  // Sum selected values directly rather than subtracting prefix sums: small
  // signals after a very large excluded peak must retain their precision.
  for (const range of scanRanges ?? [{start: 1, end: scans.length}]) {
    for (let index = range.start - 1; index < range.end; index++) {
      count++; sum += values.intensity[index];
      if (values.intensity[index] > 0 && Number.isFinite(values.mz[index])) { found++; mzSum += values.mz[index]; }
    }
  }
  if (!count) return {foundMz: null, intensity: 0, warning: "No scans"};
  return {
    foundMz: found ? mzSum / found : null,
    intensity: sum / count,
    warning: found < count ? `${count - found}/${count} scans without positive signal in the target window; included as zero` : "",
  };
}
