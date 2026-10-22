import { useCallback, useState } from "react";
import type { ScanRange, SpectrumFile } from "../types";
import { ThermoScanSelection } from "./ThermoScanSelection";

export function ThermoPlotScanControls({files, tolerance, active, onChange}: {
  files: SpectrumFile[]; tolerance: number; active: boolean;
  onChange: (id: string, ranges: ScanRange[] | undefined, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const rawFiles = files.filter(file => file.thermo);
  const file = rawFiles.find(file => file.id === fileId) ?? rawFiles[0];
  const selectedId = file?.id;
  const apply = useCallback((ranges: ScanRange[] | undefined, reason: string) => {
    if (selectedId) onChange(selectedId, ranges, reason);
  }, [onChange, selectedId]);
  if (!file?.thermo) return null;
  return <details className="thermo-live-controls" lang="pt-BR" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Ajustar scans no gráfico</summary>
    {open && <>
      <label className="scan-live-file">Arquivo RAW
        <select value={file.id} onChange={event => setFileId(event.target.value)}>
          {rawFiles.map(item => <option key={item.id} value={item.id}>{item.filename}</option>)}
        </select>
      </label>
      <label className="scan-live-toggle"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />Atualizar automaticamente</label>
      <p>Atualiza a seleção do projeto. Use Undo para voltar ou desative para aplicar manualmente.</p>
      <ThermoScanSelection key={file.id} filename={file.filename} scans={file.thermo.scans} ranges={file.thermo.scanRanges}
        reason={file.thermo.scanSelectionReason} initialMz={file.metadata.parentIon} tolerance={tolerance}
        onApply={apply} autoApply={automatic} active={active} defaultOpen />
    </>}
  </details>;
}
