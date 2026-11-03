import { useState } from "react";
import type { SpectrumFile } from "../types";
import type { PowerCalibration } from "../utils/powerCalibration";
import { downloadTextFile } from "../utils/csv";
import { changePhotoSource, newPhotoPair, parsePhotoTable, photoTemplate, preparePhotoPairs, compatiblePhotoControl, type PhotoAnalysis, type PhotoField, type PhotoPair, type PhotoState } from "../utils/photodepletion";
import { fillBlankMetadataFromSources } from "../utils/filenameMetadata";

const labels: Partial<Record<PhotoField, string>> = {
  condition: "Condição", replicate: "Réplica experimental", wavelength_nm: "Comprimento de onda (nm)", time: "Tempo ON (ex.: 1 s)", off_time: "Tempo OFF (vazio = mesmo tempo)", current: "Corrente (ex.: 100 mA)", power: "Potência medida (ex.: 10 µW)", off: "Intensidade OFF", on: "Intensidade ON", instrument: "Instrumento / lote", geometry: "Geometria óptica", off_id: "ID aquisição OFF / controle", on_id: "ID aquisição ON", exclude_reason: "Excluir manualmente — motivo",
};
const format = (value: number | null) => value === null ? "—" : Number(value.toPrecision(8)).toString();
const sourceLabel = (file: SpectrumFile) => [...new Set([file.filename, file.catalog?.input.spectrum.name, file.catalog ? file.catalog.input.rawSource?.name || "RAW não identificado" : "", file.metadata.condition, file.id].filter(Boolean))].join(" · ");
export function PhotodepletionControls({state, onChange, analysis, files, calibration, onCalibrationChange}: {state: PhotoState; onChange: (state: PhotoState) => void; analysis: PhotoAnalysis; files: SpectrumFile[]; calibration?: PowerCalibration; onCalibrationChange?: (calibration:PowerCalibration)=>void}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(state.pairs[0]?.id ?? "");
  const [page, setPage] = useState(0);
  const [commonOff,setCommonOff]=useState("");
  const [reviewNote,setReviewNote]=useState("");
  const [reviewed,setReviewed]=useState(false);
  const offFiles=files.filter(file=>fillBlankMetadataFromSources(file).condition.toUpperCase()==="LED OFF");
  const change = (patch: Partial<PhotoState>) => onChange({...state, ...patch});
  const edit = (id: string, patch: Partial<PhotoPair>) => change({pairs: state.pairs.map(pair => pair.id === id ? {...pair, ...patch} : pair)});
  const importText = (content: string) => {
    try {const pairs = parsePhotoTable(content, calibration); change({pairs: [...state.pairs, ...pairs]}); setSelected(pairs[0].id); setPage(Math.floor(state.pairs.length / 10)); setStatus(`${pairs.length} pares adicionados. Revise escala, unidades e associações.`);}
    catch (error) {setStatus(error instanceof Error ? error.message : "Falha ao importar");}
  };
  const pair = state.pairs.find(p => p.id === selected);
  const result = analysis.results.find(r => r.pair.id === selected);
  const lastPage = Math.max(0, Math.ceil(state.pairs.length / 10) - 1), currentPage = Math.min(page, lastPage);
  return <div className="photo-controls">
    <p><strong>Photodepletion — FMN</strong><br />Y = ln(I_OFF/I_ON), sem divisão pela potência. Eixos lineares; cada série mantém comprimento de onda, tempo, instrumento e geometria fixos.</p>
    {files.length>0 && <details className="plot-control-group" open><summary>Arquivos importados → Photodepletion</summary>
      <p>{state.pairs.filter(pair=>pair.on_file).length} linhas ON preparadas · {offFiles.length} arquivos LED OFF disponíveis. Os números dos nomes identificam aquisições; não confirmam repetições independentes.</p>
      <button type="button" className="secondary-button" onClick={()=>{const added=preparePhotoPairs(files,calibration,state.pairs);change({pairs:[...state.pairs,...added]});setSelected(added[0]?.id ?? selected);setStatus(`${added.length} linhas ON adicionadas; fontes já usadas não foram duplicadas.`);}}>Preparar novos arquivos ON</button>
      {!offFiles.length && <p role="status">Falta o controle LED OFF. Importe uma seleção do catálogo contendo ON e OFF, ou adicione o TXT OFF da mesma série. O gráfico de Photodepletion aguarda esse controle.</p>}
      {calibration && <label className="checkbox-label"><input type="checkbox" checked={state.pairs.some(pair=>pair.calibration) ? state.pairs.filter(pair=>pair.calibration).every(pair=>pair.calibration?.interpolate) : calibration.interpolate} onChange={event=>{const interpolate=event.target.checked;onCalibrationChange?.({...calibration,interpolate});change({pairs:state.pairs.map(pair=>pair.calibration ? {...pair,calibration:{...pair.calibration,interpolate}} : pair)});}} />Interpolar correntes intermediárias nesta análise (estimativa linear)</label>}
      <p>A potência usa a calibração de referência salva. Confira a geometria e o alinhamento; valores interpolados não são medições diretas.</p>
      {offFiles.length>0 && <>
        <label>Controle OFF comum<select value={commonOff} onChange={event=>{setCommonOff(event.target.value);setReviewed(false);}}><option value="">Selecione o controle da mesma série</option>{offFiles.map(file=><option key={file.id} value={file.id}>{sourceLabel(file)}</option>)}</select></label>
        <p>Aplicar um OFF comum compartilha a incerteza desse controle. Apenas linhas com tempo, wavelength e configuração compatíveis serão preenchidas; pares já associados permanecem como estão.</p>
        <label>Justificativa para os pares preenchidos<textarea value={reviewNote} onChange={event=>{setReviewNote(event.target.value);setReviewed(false);}} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} />Revisei o controle escolhido e confirmo intensidades OFF/ON comparáveis</label>
        <button type="button" disabled={!commonOff || !reviewed || !reviewNote.trim()} onClick={()=>{const off=offFiles.find(file=>file.id===commonOff);if(!off)return;let count=0;change({pairs:state.pairs.map(pair=>{if(pair.off_file || pair.off.trim() || !compatiblePhotoControl(pair,off,files))return pair;count++;return {...changePhotoSource(pair,"off",off.id),off_id:off.catalog?.input.rawSource?.sha256 || off.id,off_time:fillBlankMetadataFromSources(off).activationTime,scale:"comparable",scaleReview:reviewNote.trim()};})});setStatus(`${count} pares receberam o OFF e a revisão. Confira a tabela de resultados.`);}}>Aplicar OFF e revisão aos pares compatíveis</button>
      </>}
    </details>}
    <details className="plot-control-group" open><summary>1. Importar tabela</summary>
      <p>Use os cabeçalhos do modelo. Tempo, corrente e potência incluem unidade em cada célula. CSV, TSV e colagem são aceitos; linhas importadas são acrescentadas.</p>
      {calibration?.enabled && <p>A calibração salva é o padrão para novos pares. Informe corrente e comprimento de onda; não é preciso importar o powermeter. Na tabela, deixe <code>power</code> vazio para calcular, ou preencha uma potência medida para usá-la.</p>}
      <button type="button" className="secondary-button" onClick={() => downloadTextFile("photodepletion-modelo.tsv", photoTemplate, "text/tab-separated-values;charset=utf-8")}>Baixar modelo fictício</button>
      <label>Importar CSV/TSV<input type="file" accept=".csv,.tsv,.txt" onChange={async event => {const file = event.target.files?.[0]; if (file) {try {if (file.size > 5_000_000) throw Error("Limite de 5 MB por tabela."); importText(await file.text());} catch (error) {setStatus(String(error));}} event.target.value = "";}} /></label>
      <label>Tabela colada<textarea aria-label="Tabela Photodepletion" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={photoTemplate.split("\n")[0]} /></label>
      <div className="control-button-row"><button type="button" onClick={() => importText(text)}>Importar tabela colada</button><button type="button" className="secondary-button" onClick={() => {const p = newPhotoPair(calibration); change({pairs: [...state.pairs, p]}); setSelected(p.id); setPage(Math.floor(state.pairs.length / 10));}}>Novo par OFF/ON</button></div>
      <p role="status">{status}</p>
      <p>Declare <code>scale</code> como <code>comparable</code> somente para intensidades comparáveis, ou <code>basepeak</code> para espectros normalizados individualmente. <code>unknown</code> exige revisão. Nunca deduzimos a escala pelos números.</p>
    </details>
    <details className="plot-control-group" open><summary>2. Precursor e revisão dos pares ({state.pairs.length})</summary>
      <div className="style-grid"><label>Precursor m/z<input type="number" min="0" step="0.001" value={state.precursor} onChange={e => change({precursor: Number(e.target.value)})} /></label><label>Janela ± m/z<input type="number" min="0" step="0.01" value={state.tolerance} onChange={e => change({tolerance: Number(e.target.value)})} /></label></div>
      <p>Selecione os TXT OFF/ON importados abaixo. Cada TXT pode ser um average já salvo no catálogo; mantenha a identificação da aquisição e do average. Averages do mesmo RAW não são réplicas independentes. Projetos antigos preservam seus métodos: Thermo usa a média dos máximos por scan; Bruker sem scans individuais requer média validada na tabela.</p>
      <p role="status">{analysis.results.filter(r => !r.reasons.length).length} pares incluídos no gráfico · {analysis.results.filter(r => r.reasons.length).length} excluídos · {analysis.results.filter(r => r.warnings.length).length} com avisos. Pares excluídos permanecem no CSV.</p>
      <div className="photo-review-table"><table><thead><tr><th>Par / réplica</th><th>P ({state.unit})</th><th>Y</th><th>Revisão</th></tr></thead><tbody>{analysis.results.slice(currentPage * 10, currentPage * 10 + 10).map(r => <tr key={r.pair.id}><td><button type="button" className="secondary-button" onClick={() => setSelected(r.pair.id)}>{r.pair.condition || "Sem condição"} / {r.pair.replicate || "?"}</button></td><td>{format(r.power)}</td><td>{format(r.y)}</td><td>{r.reasons.length ? "Excluído" : r.warnings.length ? "Revisar" : "Válido"}{(r.reasons.length > 0 || r.warnings.length > 0) && <details><summary>Ver motivos e avisos</summary>{[...r.reasons, ...r.warnings].map((message, i) => <p key={i}>{message}</p>)}</details>}</td></tr>)}</tbody></table></div>
      {lastPage > 0 && <div className="control-button-row"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>{currentPage + 1}/{lastPage + 1}</span><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Próxima</button></div>}
      <label>Editar par<select value={pair?.id ?? ""} onChange={e => setSelected(e.target.value)}><option value="">Selecione um par para revisar</option>{state.pairs.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.condition} / {p.replicate}</option>)}</select></label>
      {pair && <div className="photo-pair-editor">
        <div className="style-grid">{Object.entries(labels).map(([field, label]) => <label key={field}>{label}<input value={pair[field as PhotoField]} disabled={(field === "off" && !!pair.off_file) || (field === "on" && !!pair.on_file) || (field === "power" && !!pair.calibration)} onChange={e => edit(pair.id, {[field]: e.target.value})} /></label>)}</div>
        <label>Escala das intensidades<select value={pair.scale} onChange={e => edit(pair.id, {scale: e.target.value})}><option value="unknown">Não verificada</option><option value="comparable">Confirmo: OFF/ON em escala comparável</option><option value="basepeak">Normalizadas ao próprio pico-base — insuficiente</option></select></label>
        <label>Justificativa de comparabilidade (obrigatória para TXT do catálogo)<textarea value={pair.scaleReview ?? ""} onChange={e => edit(pair.id, {scaleReview: e.target.value})} placeholder="Registre a verificação da escala, AGC/tempo de injeção, aquisição e unidade experimental." /></label>
        {(["off", "on"] as const).map(side => <label key={side}>Arquivo LED {side.toUpperCase()}<select value={pair[`${side}_file`]} onChange={e => {edit(pair.id, changePhotoSource(pair, side, e.target.value)); setStatus("Fonte alterada. Revise e confirme novamente a escala das intensidades deste par.");}}><option value="">Usar intensidade da tabela</option>{pair[`${side}_file`] && !files.some(f => f.id === pair[`${side}_file`]) && <option value={pair[`${side}_file`]}>Arquivo ausente ({pair[`${side}_file`]})</option>}{files.map(f => <option key={f.id} value={f.id}>{sourceLabel(f)}</option>)}</select></label>)}
        <p>Trocar a fonte OFF ou ON exige uma nova confirmação de escala e justificativa.</p>
        <p>OFF: {result?.offFile || "tabela"} → {format(result?.off ?? null)}<br />ON: {result?.onFile || "tabela"} → {format(result?.on ?? null)}</p>
        <label>Origem da potência<select value={pair.calibration ? "calibration" : "measured"} onChange={e => edit(pair.id, {calibration: e.target.value === "calibration" && calibration ? structuredClone(calibration) : undefined})}><option value="measured">Potência óptica medida na tabela</option><option value="calibration" disabled={!calibration?.enabled && !pair.calibration}>Calibração salva: corrente → potência</option></select></label>
        {pair.calibration && <p>Potência calculada: {format(result?.power ?? null)} {state.unit}</p>}
        {pair.calibration && <p>A cópia usada acompanha este par no projeto e no CSV. Alterar a calibração geral não modifica este par. Selecione potência medida e associe novamente para atualizar.</p>}
        {result && <><p role="status">{result.reasons.join("; ") || "Par válido"}</p>{result.warnings.map(w => <p className="validation-notice" key={w}>{w}</p>)}<details><summary>Proveniência da extração / calibração</summary><p>{result.provenance || "Intensidades e potência da tabela; uma linha por réplica experimental."}</p></details></>}
        <p>Para compartilhar OFF, selecione o mesmo arquivo ou repita o ID do controle. Documente exclusões no campo de motivo; todos os pares permanecem no export.</p>
      </div>}
    </details>
    <details className="plot-control-group" open><summary>3. Gráfico e ajuste linear</summary>
      <label>Unidade de potência<select value={state.unit} onChange={e => {const unit = e.target.value as PhotoState["unit"], factor = unit === "µW" ? 1000 : 0.001; change({unit, xMin: state.xMin ? String(Number(state.xMin) * factor) : "", xMax: state.xMax ? String(Number(state.xMax) * factor) : "", min: state.min ? String(Number(state.min) * factor) : "", max: state.max ? String(Number(state.max) * factor) : ""});}}><option>mW</option><option>µW</option></select></label>
      <label className="checkbox-label"><input type="checkbox" checked={state.means} onChange={e => change({means: e.target.checked})} />Mostrar média ± desvio-padrão amostral</label>
      <p>Os pontos de todas as réplicas válidas ficam visíveis. SD usa n−1; n=1 não tem barra de erro. Primeiro ln de cada par, depois média e SD. Scans não são réplicas.</p>
      <label className="checkbox-label"><input type="checkbox" checked={state.fit} onChange={e => change({fit: e.target.checked})} />Ajustar Y = aP + b por série</label>
      <label>Base do ajuste<select value={state.fitMeans ? "means" : "pairs"} onChange={e => change({fitMeans: e.target.value === "means"})}><option value="means">Médias por condição (padrão)</option><option value="pairs">Pares individuais</option></select></label>
      <div className="style-grid"><label>Potência mínima ({state.unit})<input type="number" placeholder="auto" value={state.min} onChange={e => change({min: e.target.value})} /></label><label>Potência máxima ({state.unit})<input type="number" placeholder="auto" value={state.max} onChange={e => change({max: e.target.value})} /></label></div>
      <label className="checkbox-label"><input type="checkbox" checked={state.origin} onChange={e => change({origin: e.target.checked})} />Forçar intercepto b = 0</label>
      <p>Ajuste descritivo sem pesos, separado por série. R² centrado; indefinido para Y constante. O intervalo limita apenas o ajuste. Não há classificação de mecanismo.</p>
      {analysis.rangeError && <p role="alert">{analysis.rangeError}</p>}
      {analysis.series.map(([key, label]) => <label key={key}>Legenda da série<input value={label} onChange={e => change({labels: {...state.labels, [key]: e.target.value}})} /></label>)}
      {state.fit && analysis.fits.map(f => <p key={f.series}><strong>{f.label}</strong><br />{f.reason || `a = ${format(f.a)} ${state.unit}⁻¹; b = ${format(f.b)}; R² = ${format(f.r2)}; n = ${f.n} ${state.fitMeans ? "médias por condição" : "pares"}`}</p>)}
      <details><summary>Médias e número de réplicas</summary>{analysis.means.map((m, i) => <p key={i}>{m.members[0].label} · {m.condition} · {format(m.power)} {state.unit}: média {format(m.y)}, n={m.n}, SD={format(m.sd)}</p>)}</details>
      <p>Use Style para fontes, cores, espessura, dimensões e presets de publicação. Export oferece PNG/SVG e CSV/TXT com pares originais, cálculos, unidades, exclusões e calibração.</p>
    </details>
  </div>;
}
