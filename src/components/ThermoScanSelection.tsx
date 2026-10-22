import { useEffect, useId, useMemo, useState } from "react";
import type { ScanRange, SpectrumFile } from "../types";
import { extractIonIntensity } from "../utils/processing";
import { formatScanRanges, parseScanRanges, scanIsSelected } from "../utils/thermoScans";

type Props = {
  filename: string;
  scans: NonNullable<SpectrumFile["thermo"]>["scans"];
  ranges?: ScanRange[];
  reason?: string;
  initialMz: string;
  tolerance: number;
  onApply: (ranges: ScanRange[] | undefined, reason: string) => void;
  onDraftChange?: (pending: boolean) => void;
  autoApply?: boolean;
  active?: boolean;
  defaultOpen?: boolean;
};

export function ThermoScanSelection({filename, scans, ranges, reason = "", initialMz, tolerance, onApply, onDraftChange, autoApply = false, active = true, defaultOpen = false}: Props) {
  const id = useId();
  const [draft, setDraft] = useState(formatScanRanges(ranges));
  const [note, setNote] = useState(reason);
  const [mz, setMz] = useState(initialMz);
  const [page, setPage] = useState(0);
  const [inspect, setInspect] = useState(false);
  useEffect(() => { setDraft(formatScanRanges(ranges)); setNote(reason); }, [ranges, reason]);
  const parsed = useMemo(() => {
    try { return {ranges: parseScanRanges(draft, scans.length), error: ""}; }
    catch (error) { return {ranges: undefined, error: (error as Error).message}; }
  }, [draft, scans.length]);
  const selectedCount = parsed.error ? 0 : parsed.ranges?.reduce((sum, range) => sum + range.end - range.start + 1, 0) ?? scans.length;
  const pending = formatScanRanges(parsed.ranges) !== formatScanRanges(ranges) || note !== reason;
  useEffect(() => {
    if (!active || !autoApply || !pending || parsed.error || !selectedCount) return;
    const timer = window.setTimeout(() => onApply(parsed.ranges, note), 300);
    return () => window.clearTimeout(timer);
  }, [active, autoApply, pending, parsed, selectedCount, note, onApply]);
  const reportDraft = (text: string, nextNote: string) => {
    try { onDraftChange?.(formatScanRanges(parseScanRanges(text, scans.length)) !== formatScanRanges(ranges) || nextNote !== reason); }
    catch { onDraftChange?.(true); }
  };
  const validMz = mz.trim() !== "" && Number.isFinite(Number(mz)) && Number(mz) > 0;
  const values = useMemo(() => inspect && validMz
    ? scans.map(scan => extractIonIntensity(scan.peaks, Number(mz), tolerance).intensity) : [], [scans, mz, tolerance, inspect, validMz]);
  const selectedSum = values.reduce((sum, value, index) => scanIsSelected(index + 1, parsed.ranges) ? sum + value : sum, 0);
  const pageCount = Math.max(1, Math.ceil(scans.length / 50));
  const displayPage = Math.min(page, pageCount - 1);
  const format = (value: number) => value.toLocaleString("pt-BR", {maximumSignificantDigits: 6});
  const appliedCount = ranges?.reduce((sum, range) => sum + range.end - range.start + 1, 0) ?? scans.length;
  return <details className="thermo-scan-selection" lang="pt-BR" open={defaultOpen}>
    <summary>Intervalos de scans · {appliedCount}/{scans.length} usados</summary>
    <p>Posições de 1 a {scans.length} dentro do tipo de espectro selecionado, em ordem de aquisição (não são os números globais do RAW). Limites inclusivos.</p>
    <div className="scan-range-fields">
      <label htmlFor={`${id}-ranges`}>Scans para a média — {filename}
        <input id={`${id}-ranges`} value={draft} placeholder="Todos (ex.: 20-80, 100-140)" aria-invalid={!!parsed.error}
          aria-describedby={`${id}-status`} onChange={event => { setDraft(event.target.value); reportDraft(event.target.value, note); }} />
      </label>
      <label htmlFor={`${id}-reason`}>Motivo da seleção (opcional)
        <input id={`${id}-reason`} value={note} placeholder="Ex.: trecho estável após estabilização" onChange={event => { setNote(event.target.value); reportDraft(draft, event.target.value); }} />
      </label>
    </div>
    <p id={`${id}-status`} role="status">{parsed.error || `${selectedCount} de ${scans.length} scans na prévia. ${pending ? autoApply ? "Atualização automática após terminar de digitar…" : "Alterações ainda não aplicadas." : "Seleção aplicada."}`}</p>
    <div className="control-button-row">
      <button type="button" className="primary-button" disabled={!!parsed.error || !selectedCount || !pending}
        onClick={() => { setDraft(formatScanRanges(parsed.ranges)); onApply(parsed.ranges, note); }}>Aplicar intervalos</button>
      <button type="button" className="secondary-button" disabled={!scans.length}
        onClick={() => { setDraft(""); setNote(""); onApply(undefined, ""); }}>Usar todos os scans</button>
    </div>
    <details onToggle={event => setInspect(event.currentTarget.open)}>
      <summary>Inspecionar intensidade por scan</summary>
      {inspect && <>
        <label className="scan-preview-ion">m/z para inspecionar
          <input type="number" min="0" step="any" value={mz} aria-invalid={!validMz} onChange={event => setMz(event.target.value)} />
        </label>
        <p>Tolerância atual: ±{tolerance} m/z. Máximo na janela em cada scan; ausência de sinal conta como zero. Este campo só muda a prévia.</p>
        {validMz && !parsed.error && selectedCount > 0 && <p><strong>Média da seleção: {format(selectedSum / selectedCount)}</strong> · Todos os scans: {format(values.reduce((sum, value) => sum + value, 0) / scans.length)}</p>}
        <div className="table-shell scan-preview-table"><table>
          <thead><tr><th>Posição</th><th>Tempo (s)</th><th>Intensidade</th><th>Na prévia</th></tr></thead>
          <tbody>{scans.slice(displayPage * 50, (displayPage + 1) * 50).map((scan, index) => {
            const position = displayPage * 50 + index + 1;
            return <tr key={position}><td>{position}</td><td>{format(scan.timeSeconds)}</td><td>{validMz ? format(values[position - 1]) : "Informe m/z"}</td><td>{parsed.error ? "—" : scanIsSelected(position, parsed.ranges) ? "Incluído" : "Excluído"}</td></tr>;
          })}</tbody>
        </table></div>
        <div className="control-button-row">
          <button type="button" className="secondary-button" disabled={displayPage === 0} onClick={() => setPage(displayPage - 1)}>Anterior</button>
          <span>Página {displayPage + 1} de {pageCount}</span>
          <button type="button" className="secondary-button" disabled={displayPage + 1 >= pageCount} onClick={() => setPage(displayPage + 1)}>Próxima</button>
        </div>
      </>}
    </details>
  </details>;
}
