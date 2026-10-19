import type { IonTarget, ProjectSnapshot, SpectrumFile } from "../types";
import { emptyMetadata, xAxisOptions } from "../types";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid project: ${message}. Your current project was not replaced.`);
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function checkPeaks(peaks: unknown, path: string) {
  requireValue(Array.isArray(peaks), `${path} must contain a peak list`);
  for (const peak of peaks) requireValue(record(peak) && finite(peak.mz) && finite(peak.intensity), `${path} contains an invalid peak`);
}

export function validateProjectSnapshot(value: unknown): ProjectSnapshot {
  requireValue(record(value) && value.app === "PD-MS Plot Builder" && value.version === 1 && Array.isArray(value.files) && Array.isArray(value.ions), "unrecognized project format");
  const ids = new Set<string>();
  for (const file of value.files) {
    requireValue(record(file) && typeof file.id === "string" && file.id.length > 0 && typeof file.filename === "string", "invalid file identity");
    requireValue(!ids.has(file.id), "duplicate file IDs"); ids.add(file.id);
    if (file.fingerprint !== undefined) requireValue(typeof file.fingerprint === "string", "invalid content fingerprint");
    checkPeaks(file.peaks, file.filename);
    requireValue(record(file.metadata) && Object.values(file.metadata).every(item => typeof item === "string"), `${file.filename} has invalid metadata`);
    requireValue(Array.isArray(file.warnings) && file.warnings.every(item => typeof item === "string"), `${file.filename} has invalid warnings`);
    requireValue(Number.isInteger(file.validLineCount) && Number(file.validLineCount) >= 0 && Number.isInteger(file.invalidLineCount) && Number(file.invalidLineCount) >= 0, `${file.filename} has invalid row counts`);
    if (file.thermo !== undefined) {
      const thermo = file.thermo;
      requireValue(record(thermo) && thermo.method === "mean-scan-maximum" && typeof thermo.fingerprint === "string" && typeof thermo.channel === "string" && typeof thermo.instrument === "string" && typeof thermo.mode === "string" && Array.isArray(thermo.scans), `${file.filename} has invalid Thermo data`);
      for (const scan of thermo.scans) {
        requireValue(record(scan) && finite(scan.timeSeconds), `${file.filename} has an invalid scan`);
        checkPeaks(scan.peaks, `${file.filename} scan`);
      }
    }
    if (file.bruker !== undefined) {
      const b = file.bruker;
      requireValue(record(b) && typeof b.source === "string" && ["nominal-mz-observed-mean", "exact-mz-window-observed-mean", "rounded-mz-observed-mean"].includes(String(b.method)) && finite(b.startSeconds) && finite(b.endSeconds) && b.endSeconds >= b.startSeconds && finite(b.segment) && finite(b.scanCount), `${file.filename} has invalid Bruker data`);
      if (b.mzDecimals !== undefined) requireValue(Number.isInteger(b.mzDecimals) && Number(b.mzDecimals) >= 0 && Number(b.mzDecimals) <= 6, "invalid mass precision");
    }
  }
  ids.clear();
  for (const ion of value.ions) {
    requireValue(record(ion) && typeof ion.id === "string" && typeof ion.targetMz === "string" && typeof ion.label === "string", "invalid ion row");
    requireValue(!ids.has(ion.id), "duplicate ion IDs"); ids.add(ion.id);
  }
  if (value.tolerance !== undefined) requireValue(finite(value.tolerance) && value.tolerance >= 0, "tolerance must be finite and nonnegative");
  const settings = value.plotSettings;
  if (settings !== undefined) {
    requireValue(record(settings), "invalid plot settings");
    const enums: Record<string, readonly string[]> = {
      xAxis: xAxisOptions.map(option => option.key), yMode: ["absolute", "relative", "selectedSum"],
      curveMode: ["connect", "movingAverage", "polynomial", "exponential", "logistic", "auto"],
      legendPosition: ["insideTop", "auto", "right", "top", "bottom", "inside"], replicateMode: ["individual", "sd", "sem"],
    };
    for (const [key, options] of Object.entries(enums)) if (settings[key] !== undefined) requireValue(options.includes(String(settings[key])), `invalid ${key}`);
    for (const [key, item] of Object.entries(settings)) if (typeof item === "number") requireValue(Number.isFinite(item), `invalid ${key}`);
    for (const key of ["exportWidth", "exportHeight"]) if (settings[key] !== undefined) requireValue(finite(settings[key]) && settings[key] > 0 && settings[key] <= 20000, `${key} must be between 1 and 20000`);
    if (settings.movingAverageWindow !== undefined) requireValue(Number.isInteger(settings.movingAverageWindow) && Number(settings.movingAverageWindow) >= 3 && Number(settings.movingAverageWindow) <= 31 && Number(settings.movingAverageWindow) % 2 === 1, "invalid moving average window");
    if (settings.traceColors !== undefined) requireValue(record(settings.traceColors) && Object.values(settings.traceColors).every(item => typeof item === "string"), "invalid curve colors");
  }
  return normalizeProject(value as unknown as ProjectSnapshot);
}

export const createProjectSnapshot = (
  projectName: string,
  files: SpectrumFile[],
  ions: IonTarget[],
  tolerance: number,
  selectedFileIds: string[],
): ProjectSnapshot => ({
  app: "PD-MS Plot Builder",
  version: 1,
  savedAt: new Date().toISOString(),
  projectName: projectName.trim() || "pd-ms-project",
  files,
  ions,
  tolerance,
  selectedFileIds,
});

export const safeProjectFilename = (projectName: string): string => {
  const normalizedName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalizedName || "pd-ms-project"}.pdmsplot.json`;
};

export const parseProjectSnapshot = (content: string): ProjectSnapshot => {
  return validateProjectSnapshot(JSON.parse(content));
};

function normalizeProject(parsed: ProjectSnapshot): ProjectSnapshot {
  return {
    app: "PD-MS Plot Builder",
    version: 1,
    savedAt: String(parsed.savedAt ?? ""),
    projectName: String(parsed.projectName ?? "pd-ms-project"),
    files: parsed.files.map(file => ({
      ...file, metadata: { ...emptyMetadata(), ...file.metadata },
      warnings: file.bruker?.method === "nominal-mz-observed-mean"
        ? [...new Set([...file.warnings, "Legacy Bruker import: m/z was rounded to integers. Reimport the original exports to retain decimals."])]
        : file.warnings,
    })),
    ions: parsed.ions,
    ...(typeof parsed.ionDraft === "string" ? { ionDraft: parsed.ionDraft } : {}),
    tolerance:
      typeof parsed.tolerance === "number" && Number.isFinite(parsed.tolerance)
        ? parsed.tolerance
        : 0.5,
    selectedFileIds: Array.isArray(parsed.selectedFileIds)
      ? [...new Set(parsed.selectedFileIds.map(String))].filter(id => parsed.files.some(file => file.id === id))
      : [],
    plotSelectedOnly: parsed.plotSelectedOnly === true,
    plotSettings: parsed.plotSettings && typeof parsed.plotSettings === "object" && !Array.isArray(parsed.plotSettings)
      ? parsed.plotSettings : {},
  };
}
