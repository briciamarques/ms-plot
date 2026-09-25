// Solid curve colors sampled from the user's TRMS reference figure.
export const trmsColors = ["#0072bd", "#d95319", "#edb120", "#7e2f8e", "#77ac30", "#4dbeee", "#a2142f"];
export const trmsMassColors: Record<number, string> = Object.fromEntries(
  [751, 659, 617, 375, 283, 255, 241].map((mass, index) => [mass, trmsColors[index]]),
);
export const colorPalettes = [
  { id: "trms", name: "TRMS reference (default)", colors: trmsColors },
  { id: "classic", name: "Original site colors", colors: ["#000000", "#8a008a", "#0066cc", "#d7191c", "#1a9641", "#7b2ff7", "#a6761d", "#00a6a6"] },
  { id: "mono-magenta", name: "Black + magenta", colors: ["#000000", "#8a008a"] },
] as const;
export type ColorPaletteId = typeof colorPalettes[number]["id"];
export function readColorPalette(value: unknown): ColorPaletteId {
  return colorPalettes.some(palette => palette.id === value) ? value as ColorPaletteId : "trms";
}
export function paletteColor(paletteId: ColorPaletteId, mz: number, index: number): string {
  if (paletteId === "trms" && trmsMassColors[mz]) return trmsMassColors[mz];
  if (paletteId === "mono-magenta") return index === 0 ? "#000000" : "#8a008a";
  const palette = colorPalettes.find(palette => palette.id === paletteId) ?? colorPalettes[0];
  return palette.colors[index % palette.colors.length];
}
