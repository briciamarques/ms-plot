import type {
  NumericIonTarget,
  Peak,
  ProcessedRow,
  SpectrumFile,
} from "../types";

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
  rows: Omit<ProcessedRow, "relativeIntensity">[],
): ProcessedRow[] => {
  const maxByIon = new Map<string, number>();

  rows.forEach((row) => {
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
    };
  });
};

export const extractBrukerIntensity = (
  peaks: Peak[], targetMz: number, tolerance: number,
): ExtractedIonIntensity => {
  let count = 0;
  let intensitySum = 0;
  let mzSum = 0;
  for (const peak of peaks) {
    if (Math.abs(peak.mz - targetMz) <= Math.max(0, tolerance)) {
      count++;
      intensitySum += peak.intensity;
      mzSum += peak.mz;
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
      const extraction = file.bruker?.method === "exact-mz-window-observed-mean"
        ? extractBrukerIntensity(file.peaks, ion.targetMz, tolerance)
        : extractIonIntensity(file.peaks, ion.targetMz, tolerance);
      const fileWarning = file.peaks.length === 0 ? "File has no valid data" : "";
      const warning = [fileWarning || extraction.warning, ...file.warnings].filter(Boolean).join("; ");

      return {
        id: `${file.id}-${ion.id}`,
        fileId: file.id,
        ionId: ion.id,
        filename: file.filename,
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
