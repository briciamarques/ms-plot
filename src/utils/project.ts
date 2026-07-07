import type { IonTarget, ProjectSnapshot, SpectrumFile } from "../types";

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
  const parsed = JSON.parse(content) as Partial<ProjectSnapshot>;

  if (
    parsed.app !== "PD-MS Plot Builder" ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.files) ||
    !Array.isArray(parsed.ions)
  ) {
    throw new Error("This does not look like a PD-MS Plot Builder project file.");
  }

  return {
    app: "PD-MS Plot Builder",
    version: 1,
    savedAt: String(parsed.savedAt ?? ""),
    projectName: String(parsed.projectName ?? "pd-ms-project"),
    files: parsed.files,
    ions: parsed.ions,
    tolerance:
      typeof parsed.tolerance === "number" && Number.isFinite(parsed.tolerance)
        ? parsed.tolerance
        : 0.5,
    selectedFileIds: Array.isArray(parsed.selectedFileIds)
      ? parsed.selectedFileIds.map(String)
      : [],
  };
};
