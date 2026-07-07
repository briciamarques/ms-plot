import type { IonTarget, SpectrumFile } from "../types";
import { createId } from "./id";
import { formatMz } from "./format";

type PeakCluster = {
  mz: number;
  maxIntensity: number;
  totalIntensity: number;
  count: number;
};

const parseMz = (value: string): number | null => {
  const parsedValue = Number(value.trim());
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const clusterPeaks = (
  files: SpectrumFile[],
  tolerance: number,
): PeakCluster[] => {
  const clusterTolerance = Math.max(tolerance, 0.1);
  const clusters: PeakCluster[] = [];

  files.forEach((file) => {
    file.peaks.forEach((peak) => {
      if (!Number.isFinite(peak.mz) || !Number.isFinite(peak.intensity)) {
        return;
      }

      const matchingCluster = clusters.find(
        (cluster) => Math.abs(cluster.mz - peak.mz) <= clusterTolerance,
      );

      if (!matchingCluster) {
        clusters.push({
          mz: peak.mz,
          maxIntensity: peak.intensity,
          totalIntensity: peak.intensity,
          count: 1,
        });
        return;
      }

      matchingCluster.totalIntensity += peak.intensity;
      matchingCluster.count += 1;

      if (peak.intensity > matchingCluster.maxIntensity) {
        matchingCluster.mz = peak.mz;
        matchingCluster.maxIntensity = peak.intensity;
      }
    });
  });

  return clusters.sort((a, b) => b.totalIntensity - a.totalIntensity);
};

const mostCommonParentIon = (files: SpectrumFile[]): number | null => {
  const counts = new Map<string, { mz: number; count: number }>();

  files.forEach((file) => {
    const parentIon = parseMz(file.metadata.parentIon);
    if (parentIon === null) {
      return;
    }

    const key = formatMz(parentIon);
    const currentValue = counts.get(key);
    counts.set(key, {
      mz: parentIon,
      count: (currentValue?.count ?? 0) + 1,
    });
  });

  return (
    Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]?.mz ?? null
  );
};

const formatSuggestedMz = (targetMz: number, decimalPlaces: number): string => {
  const safeDecimalPlaces = Math.min(Math.max(decimalPlaces, 0), 4);

  return safeDecimalPlaces === 0
    ? Math.round(targetMz).toString()
    : targetMz.toFixed(safeDecimalPlaces);
};

const ionTarget = (
  targetMz: number,
  label: string,
  decimalPlaces: number,
): IonTarget => ({
  id: createId("ion"),
  targetMz: formatSuggestedMz(targetMz, decimalPlaces),
  label,
});

export const suggestIonTargets = (
  files: SpectrumFile[],
  tolerance: number,
  fragmentCount = 6,
  decimalPlaces = 0,
): IonTarget[] => {
  const clusters = clusterPeaks(files, tolerance);
  if (clusters.length === 0) {
    return [];
  }

  const parentIonFromMetadata = mostCommonParentIon(files);
  const parentIon =
    parentIonFromMetadata ?? clusters.sort((a, b) => b.maxIntensity - a.maxIntensity)[0].mz;
  const parentLabel =
    parentIonFromMetadata === null ? "candidate parent ion" : "parent ion";
  const exclusionTolerance = Math.max(tolerance, 0.5);
  const fragments = clusters
    .filter((cluster) => Math.abs(cluster.mz - parentIon) > exclusionTolerance)
    .slice(0, fragmentCount);

  const suggestions = [
    ionTarget(parentIon, parentLabel, decimalPlaces),
    ...fragments.map((cluster, index) =>
      ionTarget(cluster.mz, `fragment ${index + 1}`, decimalPlaces),
    ),
  ];
  const uniqueSuggestions = new Map<string, IonTarget>();

  suggestions.forEach((suggestion) => {
    if (!uniqueSuggestions.has(suggestion.targetMz)) {
      uniqueSuggestions.set(suggestion.targetMz, suggestion);
    }
  });

  return Array.from(uniqueSuggestions.values()).slice(0, fragmentCount + 1);
};
