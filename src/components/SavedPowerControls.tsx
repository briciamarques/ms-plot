import {useMemo, useState} from "react";
import {savedPowerCalibration} from "../data/powerMeasurements";
import {selectPowerWavelength, summarizePower, type PowerCalibration} from "../utils/powerCalibration";

export function SavedPowerControls({calibration, onChange}: {
  calibration: PowerCalibration;
  onChange: (calibration: PowerCalibration) => void;
}) {
  const [view, setView] = useState(calibration.wavelengthNm);
  const wavelengths = [...new Set(calibration.measurements.filter(m => m.currentMa !== null).map(m => m.wavelengthNm))].sort((a, b) => a - b);
  const wavelength = wavelengths.includes(view) ? view : calibration.wavelengthNm;
  const profile = useMemo(() => wavelength === calibration.wavelengthNm ? calibration : selectPowerWavelength(calibration, wavelength), [calibration, wavelength]);
  const summary = useMemo(() => summarizePower(profile), [profile]);
  const format = (value: number) => value.toLocaleString("en-GB", {maximumSignificantDigits: 6});
  return <details className="plot-control-group plot-accordion">
    <summary>Saved power calibration</summary>
    <div className="plot-accordion-content">
      <p>As medições ficam salvas no site. Para usá-las, escolha <strong>x axis → Optical power</strong> e preencha corrente e wavelength nos espectros.</p>
      <label className="checkbox-label"><input type="checkbox" checked={calibration.enabled} onChange={e => onChange({...calibration, enabled: e.target.checked})} />Usar calibração salva neste projeto</label>
      <p className="help-text">{calibration.automaticWavelength ? "O wavelength de cada espectro seleciona sua calibração automaticamente." : `Este projeto usa a calibração de ${calibration.wavelengthNm} nm.`} {profile.subtractBackground ? `Background ${profile.backgroundSource === "final" ? "final" : profile.backgroundSource === "both" ? "inicial + final" : "inicial"} subtraído.` : "Potência bruta."}</p>
      <label className="saved-power-select">Ver medições<select value={wavelength} onChange={e => setView(Number(e.target.value))}>{wavelengths.map(w => <option key={w} value={w}>{w} nm</option>)}</select></label>
      <p className="help-text">Leituras de {profile.intervalSeconds} s · {summary.points.length} correntes medidas. {calibration.interpolate ? "Interpolação linear ativada." : "Somente correntes medidas, sem interpolação."}</p>
      {summary.error ? <p role="alert">{summary.error}</p> : <div className="table-shell"><table className="data-table"><thead><tr><th>mA</th><th>mW</th></tr></thead><tbody>{summary.points.map(point => <tr key={point.currentMa}><td>{point.currentMa}</td><td>{format(point.powerMw)}</td></tr>)}</tbody></table></div>}
      <details><summary>Atualizar a calibração deste projeto</summary><p className="help-text">Projetos mantêm as medições com que foram salvos. Use este botão para adotar as medições atuais do site: 280 e 365 nm, leitura de 1 s, background inicial.</p><button type="button" className="secondary-button" onClick={() => onChange(savedPowerCalibration)}>Usar medições atuais do site</button></details>
    </div>
  </details>;
}
