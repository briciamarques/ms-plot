import { metadataFields, plotYValue } from "../types";
import type { ProcessedRow, XAxisKey, YMode } from "../types";

export type ReplicateMode = "individual" | "sd" | "sem";

// Never pool different experimental conditions merely because x and m/z match.
export function aggregateReplicates(rows: ProcessedRow[], axis: XAxisKey, mode: YMode) {
  const groups = new Map<string, ProcessedRow[]>();
  const warnings: string[] = [];
  for (const row of rows) {
    const metadata = metadataFields.filter(f => !["replicate", "notes", axis].includes(f.key))
      .map(f => [f.key, (row.metadata[f.key] ?? "").trim()]);
    const series = JSON.stringify([row.ionId, row.acquisitionKey ?? "", metadata]);
    const rawX = row.metadata[axis].trim();
    const x = rawX !== "" && Number.isFinite(Number(rawX)) ? String(Number(rawX)) : rawX;
    const key = JSON.stringify([series, x]);
    groups.set(key, [...(groups.get(key) ?? []), { ...row, seriesId: series }]);
  }
  const result: ProcessedRow[] = [];
  for (const [key, group] of groups) {
    const labels = group.map(row => row.metadata.replicate.trim().replace(/^0+(?=\d)/, ""));
    if (labels.some(label => !label) || new Set(labels).size !== group.length || new Set(group.map(row => row.fileId)).size !== group.length) {
      warnings.push(`Cannot aggregate ${group[0].filename}: missing or repeated replicate IDs at this condition. Edit metadata or use individual files.`);
      continue;
    }
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const y = group.map(row => plotYValue(row, mode));
    const average = mean(y);
    const sd = group.length > 1 ? Math.sqrt(y.reduce((sum, v) => sum + (v - average) ** 2, 0) / (group.length - 1)) : null;
    if (sd === null) warnings.push(`${group[0].filename}: n=1; no error bar can be calculated.`);
    result.push({ ...group[0], id: key, fileId: key, filename: `${group.length} replicates: ${group.map(r => r.filename).join("; ")}`,
      metadata: { ...group[0].metadata, replicate: labels.join(", ") },
      absoluteIntensity: mean(group.map(r => r.absoluteIntensity)),
      relativeIntensity: mean(group.map(r => r.relativeIntensity)),
      selectedIonPercent: mean(group.map(r => r.selectedIonPercent)),
      statistics: { n: group.length, sd, sem: sd === null ? null : sd / Math.sqrt(group.length), files: group.map(r => r.filename) },
      warning: [...new Set(group.map(r => r.warning).filter(Boolean))].join("; "),
    });
  }
  return { rows: result, warnings: [...new Set(warnings)] };
}
