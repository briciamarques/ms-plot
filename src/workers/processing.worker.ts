import { processSpectra } from "../utils/processing";
import type { NumericIonTarget, SpectrumFile } from "../types";
const files = new Map<string, SpectrumFile>();
self.onmessage = (event: MessageEvent<{id: number; changed: SpectrumFile[]; ids: string[]; ions: NumericIonTarget[]; tolerance: number}>) => {
  const {id, changed, ids, ions, tolerance} = event.data;
  try {
    changed.forEach(file => files.set(file.id, file));
    const retained = new Set(ids);
    for (const key of files.keys()) if (!retained.has(key)) files.delete(key);
    self.postMessage({id, rows: processSpectra(ids.map(key => files.get(key)!), ions, tolerance)});
  } catch (error) { self.postMessage({id, error: error instanceof Error ? error.message : "Processing failed"}); }
};
