import type { ScanRange } from "../types";

export function formatScanRanges(ranges?: ScanRange[]): string {
  return ranges?.map(({start, end}) => start === end ? String(start) : `${start}-${end}`).join(", ") ?? "";
}

export function validScanRanges(value: unknown, total: number): value is ScanRange[] {
  if (!Array.isArray(value) || !value.length) return false;
  let previousEnd = 0;
  return value.every(range => {
    if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start <= previousEnd || range.end < range.start || range.end > total) return false;
    previousEnd = range.end;
    return true;
  });
}

export function parseScanRanges(text: string, total: number): ScanRange[] | undefined {
  if (!text.trim()) return undefined;
  const ranges = text.split(",").map(part => {
    const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error("Use intervalos como 20-80, 100-140 ou deixe vazio para todos.");
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > total)
      throw new Error(`Use posições entre 1 e ${total}, com início menor ou igual ao fim.`);
    return {start, end};
  }).sort((a, b) => a.start - b.start);
  const merged: ScanRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
    else merged.push({...range});
  }
  return merged;
}

export function scanIsSelected(position: number, ranges?: ScanRange[]): boolean {
  return ranges === undefined || ranges.some(range => position >= range.start && position <= range.end);
}

export function selectedThermoScans<T>(scans: T[], ranges?: ScanRange[]): T[] {
  return ranges === undefined ? scans : scans.filter((_, index) => scanIsSelected(index + 1, ranges));
}
