import type { IonTarget } from "../types";
import { paletteColor, type ColorPaletteId } from "./colorPalettes";

// Store palette slots on targets, so deleting/reordering rows cannot shift colors.
export function withIonColorIndices(ions: IonTarget[]): IonTarget[] {
  const used = new Set(ions.flatMap(ion => ion.colorIndex === undefined ? [] : [ion.colorIndex]));
  let next = 0;
  return ions.map(ion => {
    if (ion.colorIndex !== undefined) return ion;
    while (used.has(next)) next++;
    const colorIndex = next++;
    used.add(colorIndex);
    return { ...ion, colorIndex };
  });
}

export function reconcileIonTargets(previous: IonTarget[], next: IonTarget[]): IonTarget[] {
  const old = withIonColorIndices(previous);
  const used = new Set<string>();
  let nextIndex = old.reduce((max, ion) => Math.max(max, ion.colorIndex!), -1) + 1;
  return next.map(ion => {
    const match = old.find(item => !used.has(item.id) && item.id === ion.id)
      ?? old.find(item => !used.has(item.id) && Number(ion.targetMz) > 0 && Number(item.targetMz) === Number(ion.targetMz));
    if (match) {
      used.add(match.id);
      return { ...match, ...ion, id: match.id, colorIndex: match.colorIndex };
    }
    return { ...ion, colorIndex: nextIndex++ };
  });
}

export function ionColors(ions: IonTarget[], palette: ColorPaletteId, overrides: Record<string, string>): Record<string, string> {
  return Object.fromEntries(withIonColorIndices(ions).map(ion => [ion.id,
    overrides[ion.id] ?? paletteColor(palette, Number(ion.targetMz), ion.colorIndex!)]));
}
