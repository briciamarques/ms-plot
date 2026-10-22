import { processSpectra } from "../utils/processing";
import type { NumericIonTarget, SpectrumFile, ThermoSelectionUpdate } from "../types";
import { validScanRanges } from "../utils/thermoScans";
const files = new Map<string, SpectrumFile>();
self.onmessage = (event: MessageEvent<{id: number; changed: SpectrumFile[]; ids: string[]; ions: NumericIonTarget[]; tolerance: number; selections?: ThermoSelectionUpdate[]}>) => {
  const {id, changed, ids, ions, tolerance, selections = []} = event.data;
  try {
    changed.forEach(file => files.set(file.id, file));
    for (const selection of selections) {
      const file = files.get(selection.id);
      if (!file?.thermo) throw new Error("Thermo source unavailable; retry processing");
      if (selection.scanRanges !== undefined && !validScanRanges(selection.scanRanges, file.thermo.scans.length)) throw new Error("Invalid Thermo scan ranges");
      files.set(file.id, {...file, thermo: {...file.thermo, scanRanges: selection.scanRanges, scanSelectionReason: selection.scanSelectionReason}});
    }
    const retained = new Set(ids);
    for (const key of files.keys()) if (!retained.has(key)) files.delete(key);
    self.postMessage({id, rows: processSpectra(ids.map(key => files.get(key)!), ions, tolerance)});
  } catch (error) { self.postMessage({id, error: error instanceof Error ? error.message : "Processing failed"}); }
};
