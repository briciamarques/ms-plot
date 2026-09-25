import type {
  NumericIonTarget,
  Peak,
  ProcessedRow,
  SpectrumFile,
} from "../types";
import { roundMass } from "./bruker";

export type ExtractedIonIntensity = {
  foundMz: number | null;
  intensity: number;
  warning: string;
};

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
      const extraction = file.bruker?.method === "exact-mz-window-observed-mean" || file.bruker?.method === "rounded-mz-observed-mean"
        ? extractBrukerIntensity(file.peaks, ion.targetMz, tolerance, file.bruker.mzDecimals)
        : extractIonIntensity(file.peaks, ion.targetMz, tolerance);
      const fileWarning = file.peaks.length === 0 ? "File has no valid data" : "";
      const warning = [fileWarning || extraction.warning, ...file.warnings].filter(Boolean).join("; ");

      return {
        id: `${file.id}-${ion.id}`,
        fileId: file.id,
        ionId: ion.id,
        filename: file.filename,
        ...(file.bruker ? { seriesId: file.bruker.runId ?? file.bruker.source } : {}),
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
