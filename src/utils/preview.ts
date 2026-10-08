/** Fit a full-resolution export into the viewport without changing its aspect ratio. */
export function fitExportPreview(width: number, height: number, availableWidth: number, availableHeight: number) {
  const positive = (value: number) => Number.isFinite(value) && value > 0 ? value : 1;
  const scale = Math.min(1, positive(availableWidth) / positive(width), positive(availableHeight) / positive(height));
  return { scale, width: positive(width) * scale, height: positive(height) * scale };
}
