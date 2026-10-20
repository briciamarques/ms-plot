import { useEffect, useMemo, useRef, useState } from "react";
import type { SpectrumFile } from "../types";
import { downloadTextFile } from "../utils/csv";
import { defaultPowerCalibration, matchPower, readPowerUploads, summarizePower, type PowerCalibration, type PowerPoint } from "../utils/powerCalibration";

type Props = {
  files: SpectrumFile[];
  calibration?: PowerCalibration;
  onChange: (calibration: PowerCalibration | undefined) => void;
  onPlot: (calibration: PowerCalibration) => void;
};
const formatPower = (value: number | null) => value === null ? "—" : value.toLocaleString("en-GB", {maximumSignificantDigits: 6});

function CalibrationPreview({points}: {points: PowerPoint[]}) {
  if (!points.length) return null;
  const maxX = Math.max(1, ...points.map(p => p.currentMa));
  const minY = Math.min(0, ...points.map(p => p.powerMw)), maxY = Math.max(...points.map(p => p.powerMw), minY + 0.001);
  const x = (v: number) => 105 + 530 * v / maxX, y = (v: number) => 220 - 180 * (v - minY) / (maxY - minY);
  return <svg className="power-calibration-preview" viewBox="0 0 680 275" role="img" aria-label="Curva de calibração: potência média em mW em função da corrente em mA">
    <path d="M105 35V220H635" fill="none" stroke="currentColor" />
    {[0, .25, .5, .75, 1].map(f => <g key={f}>
      <text x={x(maxX * f)} y={240} textAnchor="middle">{formatPower(maxX * f)}</text>
      <text x={95} y={y(minY + (maxY - minY) * f) + 4} textAnchor="end">{formatPower(minY + (maxY - minY) * f)}</text>
    </g>)}
    <polyline points={points.map(p => `${x(p.currentMa)},${y(p.powerMw)}`).join(" ")} fill="none" stroke="#0072b2" strokeWidth="2" />
    {points.map(p => <circle key={p.currentMa} cx={x(p.currentMa)} cy={y(p.powerMw)} r="4" fill="#0072b2"><title>{p.currentMa} mA: {formatPower(p.powerMw)} mW</title></circle>)}
    <text x="370" y="267" textAnchor="middle">Current (mA)</text><text transform="translate(16 128) rotate(-90)" textAnchor="middle">Optical power (mW)</text>
  </svg>;
}

export function PowerCalibrationPanel({files, calibration, onChange, onPlot}: Props) {
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  // Discard a pending upload when New/Open/Undo replaces this project's calibration.
  useEffect(() => { generation.current++; setLoading(false); }, [calibration]);
  const summary = useMemo(() => calibration ? summarizePower(calibration) : undefined, [calibration]);
  const matches = useMemo(() => calibration && summary ? files.map(file => ({file, result: matchPower(file, calibration, summary)})) : [], [files, calibration, summary]);
  const matched = matches.filter(m => "powerMw" in m.result);
  const update = (patch: Partial<PowerCalibration>) => calibration && onChange({...calibration, ...patch});
  const importFiles = async (uploads: File[]) => {
    const epoch = ++generation.current; setLoading(true); setError("");
    try {
      const next = defaultPowerCalibration(await readPowerUploads(uploads));
      if (generation.current === epoch) onChange(next);
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Não foi possível importar."); }
    finally { if (generation.current === epoch) setLoading(false); }
  };
  const exportTable = () => {
    if (!summary || !calibration) return;
    const header = "wavelength_nm,sample_interval_s,current_mA,raw_mean_mW,background_mean_mW,background_interval_s,power_mW,SD_between_file_means_mW,n_files,n_samples,background_subtracted";
    downloadTextFile("power-calibration.csv", [header, ...summary.points.map(p => [calibration.wavelengthNm, calibration.intervalSeconds, p.currentMa, p.rawMw, summary.backgroundMw ?? "", calibration.backgroundIntervalSeconds, summary.error ? "" : p.powerMw, p.sdMw ?? "", p.n, p.samples, calibration.subtractBackground].join(","))].join("\n"), "text/csv;charset=utf-8");
  };
  return <section className="workspace-section power-calibration" lang="pt-BR">
    <div className="section-header"><div><p className="section-kicker">Powermeter</p><h2>Corrente → potência óptica</h2></div></div>
    <p>Importe o ZIP ou selecione todos os CSVs de uma campanha. O site usa a corrente nos nomes dos arquivos e a coluna <strong>Power (W)</strong> para calcular a potência em mW. A coluna Current (A) do powermeter não é usada como corrente do driver.</p>
    <label className="primary-file-button">Importar calibração CSV / ZIP<input aria-label="Importar calibração CSV / ZIP" type="file" accept=".csv,.zip" multiple disabled={loading} onChange={e => {const uploads = Array.from(e.target.files ?? []); e.target.value = ""; if (uploads.length) void importFiles(uploads);}} /></label>
    <p className="help-text">Exemplo de nome: 280nm_100mA_1s_1.csv. Background: 280nm_background_1s_1.csv. Uma nova importação substitui a calibração atual; Undo recupera a anterior. Os arquivos são lidos neste navegador.</p>
    {loading && <p role="status">Lendo calibração…</p>}{error && <p role="alert" className="validation-notice">{error}</p>}
    {calibration && summary && <>
      <div className="power-controls">
        <label>Wavelength da calibração<select value={calibration.wavelengthNm} onChange={e => update({wavelengthNm: Number(e.target.value)})}>{[...new Set(calibration.measurements.map(m => m.wavelengthNm))].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n} nm</option>)}</select></label>
        <label>Intervalo de leitura<select value={calibration.intervalSeconds} onChange={e => update({intervalSeconds: Number(e.target.value)})}>{[...new Set([calibration.intervalSeconds, ...calibration.measurements.filter(m => m.wavelengthNm === calibration.wavelengthNm && m.currentMa !== null).map(m => m.intervalSeconds)])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n} s</option>)}</select></label>
        <label>Potência utilizada<select value={calibration.subtractBackground ? "corrected" : "raw"} onChange={e => update({subtractBackground: e.target.value === "corrected"})}><option value="corrected">Subtrair background</option><option value="raw">Leitura bruta</option></select></label>
        {calibration.subtractBackground && <label>Intervalo do background<select value={calibration.backgroundIntervalSeconds} onChange={e => update({backgroundIntervalSeconds: Number(e.target.value)})}>{[...new Set([calibration.backgroundIntervalSeconds, ...calibration.measurements.filter(m => m.wavelengthNm === calibration.wavelengthNm && m.currentMa === null).map(m => m.intervalSeconds)])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n} s</option>)}</select></label>}
      </div>
      <p className="help-text">“1 s” e “10 s” são o Sample Interval do powermeter, não o tempo de irradiação do espectro. As séries ficam separadas. Se escolher um background de outro intervalo, essa escolha fica registrada no projeto.</p>
      <div className="power-options">
        <label className="checkbox-label"><input type="checkbox" checked={calibration.interpolate} onChange={e => update({interpolate: e.target.checked})} />Interpolar linearmente correntes intermediárias (sem extrapolar)</label>
        <label className="checkbox-label"><input type="checkbox" checked={calibration.assumeWavelength} onChange={e => update({assumeWavelength: e.target.checked})} />Aplicar {calibration.wavelengthNm} nm também aos espectros sem wavelength preenchido</label>
      </div>
      <p>Média das leituras de cada CSV → média das repetições por corrente{calibration.subtractBackground ? " − média dos arquivos de background" : ""}. Background: <strong>{formatPower(summary.backgroundMw)} mW</strong> ({summary.backgroundN} arquivos). Valores negativos após subtração são preservados.</p>
      <p className="help-text">O SD abaixo mede a dispersão entre médias dos arquivos. Não inclui incerteza do background, calibração do sensor ou interpolação. As barras verticais do gráfico de íons continuam representando a dispersão do sinal dos espectros.</p>
      {summary.error ? <p className="validation-notice" role="alert">{summary.error}</p> : <CalibrationPreview points={summary.points} />}
      <div className="table-shell"><table className="data-table"><thead><tr><th>Corrente (mA)</th><th>Média bruta (mW)</th><th>{calibration.subtractBackground ? "Potência − background" : "Potência"} (mW)</th><th>SD entre arquivos (mW)</th><th>Arquivos</th><th>Leituras</th></tr></thead><tbody>{summary.points.map(p => <tr key={p.currentMa}><td>{p.currentMa}</td><td>{formatPower(p.rawMw)}</td><td>{summary.error ? "—" : formatPower(p.powerMw)}</td><td>{formatPower(p.sdMw)}</td><td>{p.n}</td><td>{p.samples}</td></tr>)}</tbody></table></div>
      <div className="control-button-row">
        <button className="secondary-button" onClick={exportTable}>Baixar tabela de calibração</button>
        <button className="primary-button" disabled={!!summary.error || !matched.length} onClick={() => onPlot({...calibration, enabled: true})}>Aplicar e plotar por potência</button>
        {calibration.enabled && <button className="secondary-button" onClick={() => update({enabled: false})}>Desativar calibração</button>}
      </div>
      <p role="status">{calibration.measurements.length} CSVs importados. {matched.length} de {files.length} espectros com potência correspondente. {calibration.enabled ? "Calibração ativa: mudanças nesta seção ou na corrente dos espectros atualizam a potência automaticamente." : "Confira as correspondências e clique em Aplicar."}</p>
      {!files.length && <p>Importe os espectros em Files & metadata ou Thermo RAW. Depois volte aqui para aplicar a calibração.</p>}
      {!!matches.length && <details><summary>Ver correspondências dos espectros ({matches.length})</summary><div className="table-shell"><table className="data-table"><thead><tr><th>Espectro</th><th>Corrente (mA)</th><th>Wavelength</th><th>Potência (mW)</th><th>Método / pendência</th></tr></thead><tbody>{matches.map(({file, result}) => <tr key={file.id}><td>{file.filename}</td><td>{file.metadata.current || "—"}</td><td>{file.metadata.wavelength || "—"}</td><td>{"powerMw" in result ? formatPower(result.powerMw) : "—"}</td><td>{"method" in result ? result.method === "measured-current" ? "Corrente medida" : "Interpolação linear" : result.reason}</td></tr>)}</tbody></table></div></details>}
      <p className="help-text">No Plot, escolha o parent ion na legenda/lista de íons e use X axis = Optical power. A intensidade absoluta mostra o sinal; “Each ion's own maximum = 100%” normaliza pelo máximo observado, não calcula perda em relação a LED OFF. A calibração e suas escolhas são salvas no arquivo de projeto e na recuperação automática.</p>
    </>}
  </section>;
}
