import { useEffect, useMemo, useRef, useState } from "react";
import { emptyMetadata, type NumericIonTarget, type ProcessedRow, type SpectrumFile, type ThermoSelectionUpdate } from "../types";
import { normalizeIntensities } from "../utils/processing";

export function useProcessedRows(files: SpectrumFile[], ions: NumericIonTarget[], tolerance: number) {
  const worker = useRef<Worker>();
  const sources = useRef(new Map<string, SpectrumFile>());
  const lastKey = useRef("");
  const request = useRef(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ProcessedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ionKey = JSON.stringify(ions.map(ion => [ion.id, ion.targetMz]));
  useEffect(() => {
    const instance = new Worker(new URL("../workers/processing.worker.ts", import.meta.url), {type: "module"});
    worker.current = instance;
    sources.current.clear(); lastKey.current = "";
    instance.onmessage = event => {
      if (event.data.id !== request.current) return;
      setBusy(false); setError(event.data.error ?? ""); setResult(event.data.rows ?? []);
    };
    instance.onerror = () => { setBusy(false); setError("Processing interrupted. Retry, or save the project and reopen it."); setResult([]); };
    return () => instance.terminate();
  }, [revision]);
  useEffect(() => {
    if (!worker.current) return;
    const selections: ThermoSelectionUpdate[] = [];
    const changed = files.filter(file => {
      const old = sources.current.get(file.id);
      if (old?.thermo && file.thermo && old.peaks === file.peaks && old.bruker === file.bruker
        && old.thermo.scans === file.thermo.scans && old.thermo.fingerprint === file.thermo.fingerprint
        && old.thermo.channel === file.thermo.channel && old.thermo.mode === file.thermo.mode
        && old.thermo.instrument === file.thermo.instrument && old.thermo.method === file.thermo.method) {
        if (old.thermo !== file.thermo) selections.push({id: file.id, scanRanges: file.thermo.scanRanges, scanSelectionReason: file.thermo.scanSelectionReason});
        return false;
      }
      return !old || old.peaks !== file.peaks || old.bruker !== file.bruker || old.thermo !== file.thermo;
    });
    const key = JSON.stringify([files.map(file => file.id), ionKey, tolerance]);
    if (!changed.length && !selections.length && key === lastKey.current) return;
    lastKey.current = key; sources.current = new Map(files.map(file => [file.id, file]));
    setBusy(true); setError("");
    const numeric = (JSON.parse(ionKey) as [string, number][]).map(([id, targetMz]) => ({id, targetMz, label: ""}));
    worker.current?.postMessage({id: ++request.current, ids: files.map(file => file.id), ions: numeric, tolerance, selections,
      changed: changed.map(file => ({...file, metadata: emptyMetadata()}))});
  }, [files, ionKey, tolerance, revision]);
  const rows = useMemo(() => {
    const byFile = new Map(files.map(file => [file.id, file]));
    const byIon = new Map(ions.map(ion => [ion.id, ion]));
    return normalizeIntensities(result.flatMap(row => {
      const file = byFile.get(row.fileId), ion = byIon.get(row.ionId);
      if (!file || !ion) return [];
      return [{...row, filename: file.filename, metadata: file.metadata, label: ion.label,
        ...(file.thermo ? {seriesId: JSON.stringify([file.thermo.channel, file.metadata.compound, file.metadata.concentration, file.metadata.condition, file.metadata.experiment, file.metadata.replicate])} : {})}];
    }));
  }, [result, files, ions]);
  return {rows: busy || error ? [] : rows, displayRows: error ? [] : rows, busy, error,
    cancel: () => { worker.current?.terminate(); worker.current = undefined; request.current++; setBusy(false); setResult([]); setError("Processing cancelled. Retry when ready."); },
    retry: () => setRevision(value => value + 1)};
}
