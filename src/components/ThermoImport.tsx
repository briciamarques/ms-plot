import { useEffect, useRef, useState } from "react";
import type { Peak, SpectrumFile } from "../types";
import { emptyMetadata } from "../types";
import { inferMetadataFromFilename } from "../utils/filenameMetadata";
import { createId } from "../utils/id";
import { ThermoReaderHelp } from "./ThermoReaderHelp";

type Channel = { key: string; label: string; precursor: string; mode: string; instrument: string; scans: Array<{timeSeconds: number; peaks: Peak[]}> };
type Imported = { filename: string; fingerprint: string; channels: Channel[]; selected: string };

export function ThermoImport({ files, onImport }: { files: SpectrumFile[]; onImport: (files: SpectrumFile[]) => void }) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Imported[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const busy = useRef(false);
  const controller = useRef<AbortController>();
  const [readerStatus, setReaderStatus] = useState("");
  const check = async () => {
    if (!local) { setAvailable(false); setReaderStatus("Você está na versão online. Para importar RAW, abra a versão local usando as instruções abaixo."); return; }
    setAvailable(null);
    setReaderStatus("");
    try {
      const response = await fetch('/api/thermo/status', {signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('Reader unavailable');
      const data = await response.json();
      if (typeof data.available !== 'boolean' || (data.app !== 'PD-MS Plot Builder' && data.maxBytes !== 512 * 1024 * 1024)) throw new Error('Unexpected reader');
      setAvailable(data.available);
      setReaderStatus(data.available ? "Leitor RAW conectado. Você já pode escolher um ou vários arquivos." : "O leitor iniciou, mas não encontrou o ProteoWizard. Instale o ProteoWizard com suporte Thermo neste computador e reabra Start-PDMS.cmd.");
    } catch { setAvailable(false); setReaderStatus("O leitor não respondeu nesta página. Abra Start-PDMS.cmd e use a página que ele abrir automaticamente."); }
  };
  useEffect(() => { void check(); }, []);

  const read = async (uploads: File[]) => {
    if (busy.current) return;
    busy.current = true;
    controller.current = new AbortController();
    setMessages([]);
    const results: Imported[] = [];
    const errors: string[] = [];
    const known = new Set([...files.flatMap(file => file.thermo ? [file.thermo.fingerprint] : []), ...pending.map(file => file.fingerprint)]);
    try {
      for (const [index, file] of uploads.entries()) {
        if (controller.current.signal.aborted) break;
        setProgress(`Reading ${index + 1}/${uploads.length}: ${file.name}`);
        try {
          if (!/\.raw$/i.test(file.name)) throw new Error('Choose Thermo .raw files');
          if (file.size > 512 * 1024 * 1024) throw new Error('Maximum size is 512 MB per file');
          const response = await fetch('/api/thermo/convert', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal: controller.current.signal });
          if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) throw new Error('RAW reader unavailable. Open the site through the local reader.');
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? 'Could not read RAW');
          if (known.has(result.fingerprint)) throw new Error('Duplicate RAW content; already imported or selected');
          if (!result.channels?.length) throw new Error('No spectra returned');
          known.add(result.fingerprint);
          results.push({ filename: file.name, fingerprint: result.fingerprint, channels: result.channels, selected: result.channels.length === 1 ? result.channels[0].key : '' });
        } catch (error) { errors.push(`${file.name}: ${controller.current.signal.aborted ? 'Import cancelled; the local reader may finish its current conversion before accepting another.' : error instanceof Error ? error.message : 'Reader unavailable'}`); }
      }
      setPending(current => [...current, ...results]);
      setMessages(errors);
    } finally { busy.current = false; controller.current = undefined; setProgress(''); }
  };
  const add = () => {
    const imported = pending.map(item => {
      const channel = item.channels.find(channel => channel.key === item.selected)!;
      const metadata = { ...emptyMetadata(), ...inferMetadataFromFilename(item.filename), parentIon: channel.precursor || inferMetadataFromFilename(item.filename).parentIon || '' };
      const peaks = channel.scans.flatMap(scan => scan.peaks);
      return { id: createId('thermo'), filename: item.filename, metadata, peaks,
        validLineCount: peaks.length, invalidLineCount: 0, warnings: [],
        thermo: { fingerprint: item.fingerprint, channel: channel.key, instrument: channel.instrument, mode: channel.mode, scans: channel.scans, method: 'mean-scan-maximum' as const } };
    });
    onImport(imported);
    setPending([]);
    setMessages([`${imported.length} files added. Review current, voltage, condition and replicate in Files & metadata.`]);
  };
  return <section className="workspace-section">
    <div className="section-header"><div><p className="section-kicker">Importação de um ou vários arquivos</p><h2>Thermo RAW</h2></div>{local && <button className="secondary-button" disabled={available === null} onClick={() => void check()}>Verificar leitor</button>}</div>
    <p role="status" lang="pt-BR">{available === null ? 'Verificando leitor RAW…' : readerStatus}</p>
    <ThermoReaderHelp local={local} connected={available === true} />
    <label className="secondary-button">Choose Thermo RAW files<input aria-label="Choose Thermo RAW files" type="file" multiple accept=".raw" disabled={!!progress || !available} onChange={event => { void read(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
    <p>Extraction: highest intensity inside the ion tolerance in each scan, then mean across all scans in the selected spectrum type. Scans without signal contribute zero. No smoothing or normalization is applied during import.</p>
    <p>Condition, current, voltage and replicate are inferred from filenames and remain editable. LED OFF has no assumed current. Label 365LED is not assigned a wavelength automatically; enter nm in metadata if appropriate.</p>
    {progress && <p role="status">{progress} <button type="button" className="secondary-button" onClick={() => controller.current?.abort()}>Cancel RAW import</button></p>}
    {messages.length > 0 && <div role="status">{messages.map((message, index) => <p key={index}>{message}</p>)}</div>}
    {pending.length > 0 && <><div className="table-shell"><table><thead><tr><th>File</th><th>Spectrum type</th><th>Scans</th><th>Condition / current / replicate</th></tr></thead><tbody>{pending.map((item, index) => {
      const metadata = inferMetadataFromFilename(item.filename);
      return <tr key={item.fingerprint}><td>{item.filename}</td><td><select aria-label={`Spectrum type for ${item.filename}`} value={item.selected} onChange={event => setPending(current => current.map((file, i) => i === index ? {...file, selected: event.target.value} : file))}><option value="">Select spectrum type</option>{item.channels.map(channel => <option key={channel.key} value={channel.key}>{channel.label} · {channel.mode}</option>)}</select></td><td>{item.channels.find(c => c.key === item.selected)?.scans.length ?? '—'}</td><td>{metadata.condition || '—'} / {metadata.current ? `${metadata.current} mA` : '—'} / {metadata.replicate || '—'}</td></tr>;
    })}</tbody></table></div><div className="control-button-row"><button className="primary-button" disabled={!!progress || pending.some(file => !file.selected)} onClick={add}>Add {pending.length} files</button><button className="secondary-button" disabled={!!progress} onClick={() => setPending([])}>Clear preview</button></div></>}
  </section>;
}
