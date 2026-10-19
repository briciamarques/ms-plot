import type { IonTarget, NumericIonTarget } from "../types";
import { roundMass } from "./bruker";

export function validMass(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
}

export function numericTargets(ions: IonTarget[]): NumericIonTarget[] {
  const seen = new Set<number>();
  return ions.flatMap(ion => {
    const mass = Number(ion.targetMz);
    if (!validMass(ion.targetMz) || seen.has(mass)) return [];
    seen.add(mass);
    return [{ id: ion.id, targetMz: mass, label: ion.label.trim() }];
  });
}

export function ionWarnings(ions: IonTarget[], tolerance: number, precisions: number[] = []): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();
  ions.forEach((ion, index) => {
    if (!validMass(ion.targetMz)) warnings.push(`Row ${index + 1}: enter a positive m/z. This row is excluded from calculations.`);
    else if (seen.has(Number(ion.targetMz))) warnings.push(`Duplicate m/z ${ion.targetMz}: only its first row is used.`);
    else seen.add(Number(ion.targetMz));
  });
  const masses = [...seen].sort((a, b) => a - b);
  for (let i = 1; i < masses.length; i++) {
    if (masses[i] - masses[i - 1] <= tolerance * 2) warnings.push(`Overlapping windows: ${masses[i - 1]} and ${masses[i]}. The same peak may contribute to both targets and their normalization sum.`);
  }
  for (const precision of precisions) {
    const bins = new Map<number, number>();
    for (const mass of masses) {
      const bin = roundMass(mass, precision);
      if (bins.has(bin)) warnings.push(`${bins.get(bin)} and ${mass} both round to ${bin} at ${precision} decimals. Rounded Bruker extraction counts this bin twice in the selected-ion sum; remove one target if unintended.`);
      else bins.set(bin, mass);
    }
  }
  return warnings;
}
