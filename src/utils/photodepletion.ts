import type { SpectrumFile } from "../types";
import { emptyMetadata } from "../types";
import { processSpectra } from "./processing";
import { calibratedFiles, type PowerCalibration } from "./powerCalibration";
import { escapeCsvValue } from "./csv";
import type { PlotTrace } from "./plot";
import { paletteColor, type ColorPaletteId } from "./colorPalettes";

export const photoFields = ["condition", "replicate", "wavelength_nm", "time", "current", "power", "off", "on", "off_time", "instrument", "geometry", "off_id", "on_id", "off_file", "on_file", "scale", "exclude_reason"] as const;
export type PhotoField = typeof photoFields[number];
export type PhotoPair = Record<PhotoField, string> & { id: string; original?: Record<string, string>; calibration?: PowerCalibration; scaleReview?: string };
export type PhotoState = { pairs: PhotoPair[]; precursor: number; tolerance: number; unit: "mW" | "µW"; means: boolean; fit: boolean; fitMeans: boolean; origin: boolean; min: string; max: string; labels: Record<string, string>; xMin: string; xMax: string; yMin: string; yMax: string };
export const defaultPhotoState = (): PhotoState => ({pairs: [], precursor: 457, tolerance: 0.5, unit: "mW", means: true, fit: true, fitMeans: true, origin: false, min: "", max: "", labels: {}, xMin: "", xMax: "", yMin: "", yMax: ""});
export const newPhotoPair = (): PhotoPair => ({...Object.fromEntries(photoFields.map(key => [key, ""])), id: crypto.randomUUID(), scale: "unknown"} as PhotoPair);
export function readPhotoState(value: unknown): PhotoState {
  if (!value || typeof value !== "object") return defaultPhotoState();
  const v = value as PhotoState;
  if (!Array.isArray(v.pairs) || !v.pairs.every(p => p && typeof p.id === "string" && photoFields.every(k => typeof p[k] === "string"))) throw Error("Photodepletion: dados salvos inválidos.");
  return {...defaultPhotoState(), ...v};
}

// Explicit units only. Values are converted to seconds, mA and mW.
export function quantity(raw: string, kind: "time" | "current" | "power"): number | null {
  const match = raw.trim().replace(/μ/g, "µ").match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(\S+)$/i);
  if (!match) return null;
  const units: Record<string, number> = kind === "time" ? {s: 1, ms: 0.001, "µs": 0.000001, us: 0.000001, min: 60}
    : kind === "current" ? {A: 1000, mA: 1, "µA": 0.001, uA: 0.001}
    : {W: 1000, mW: 1, "µW": 0.001, uW: 0.001, nW: 0.000001};
  const factor = units[match[2]];
  const value = Number(match[1].replace(",", ".")) * factor;
  return Number.isFinite(value) ? value : null;
}
const number = (raw: string) => raw.trim() && Number.isFinite(Number(raw.replace(",", "."))) ? Number(raw.replace(",", ".")) : null;

/** CSV/TSV including quoted delimiters/newlines; no silent row dropping. */
export function parsePhotoTable(text: string): PhotoPair[] {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const records: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') {cell += '"'; i++;} else quoted = !quoted; }
    else if (!quoted && c === delimiter) {row.push(cell.trim()); cell = "";}
    else if (!quoted && (c === "\n" || c === "\r")) {row.push(cell.trim()); if (row.some(Boolean)) records.push(row); row = []; cell = ""; if (c === "\r" && text[i + 1] === "\n") i++;}
    else cell += c;
  }
  if (quoted) throw Error("Aspas não fechadas na tabela.");
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row);
  const headers = records.shift()?.map(h => h.toLowerCase());
  const required = photoFields.slice(0, 8);
  if (!headers || required.some(h => !headers.includes(h))) throw Error(`Use os cabeçalhos do modelo: ${required.join(", ")}.`);
  if (new Set(headers).size !== headers.length) throw Error("Cabeçalhos duplicados.");
  if (!records.length) throw Error("A tabela não contém pares.");
  return records.map((cells, i) => {
    if (cells.length !== headers.length) throw Error(`Linha ${i + 2}: número de colunas incompatível.`);
    const original = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    return {...newPhotoPair(), ...Object.fromEntries(photoFields.filter(k => k in original).map(k => [k, original[k]])), ...(original.comparability_review ? {scaleReview: original.comparability_review} : {}), original};
  });
}
export const photoTemplate = "condition\treplicate\twavelength_nm\ttime\tcurrent\tpower\toff\ton\toff_time\tinstrument\tgeometry\toff_id\ton_id\tscale\nP1\t1\t365\t1 s\t100 mA\t10 µW\t1000\t500\t1 s\tInstrument A\tGeometry A\tcontrol-1\ton-1\tunknown";

export type PhotoResult = { pair: PhotoPair; power: number | null; time: number | null; wavelength: number | null; off: number | null; on: number | null; y: number | null; series: string; label: string; reasons: string[]; warnings: string[]; provenance: string; offFile: string; onFile: string; acquisition: string };
export type PhotoMean = { series: string; condition: string; power: number; y: number; n: number; sd: number | null; members: PhotoResult[] };
export type PhotoFit = { series: string; label: string; a: number | null; b: number | null; r2: number | null; n: number; min: number | null; max: number | null; reason: string; points: Array<{x: number; y: number}> };

function catalogSetup(file?: SpectrumFile) {
  const metadata = file?.catalog?.input.experiment.metadata;
  const equipment = metadata?.equipmentSnapshots;
  const setup = equipment && typeof equipment === "object" && !Array.isArray(equipment) ? equipment.setupId : null;
  const data = setup && typeof setup === "object" && !Array.isArray(setup) ? setup.data : null;
  const values = data && typeof data === "object" && !Array.isArray(data) ? data : metadata;
  const text = (key: string) => typeof values?.[key] === "string" ? String(values[key]) : "";
  return {instrument: [text("instrument"), text("equipmentId")].filter(Boolean).join(" / "), geometry: [text("geometry"), text("optics"), text("distance")].filter(Boolean).join(" / "), setup: setup && typeof setup === "object" && !Array.isArray(setup) ? JSON.stringify([setup.id, setup.revision]) : ""};
}

export function analyzePhoto(state: PhotoState, files: SpectrumFile[]) {
  const byId = new Map(files.map(f => [f.id, f]));
  const results: PhotoResult[] = state.pairs.map(pair => {
    const reasons: string[] = [], warnings: string[] = [], provenance: string[] = [];
    const offFile = byId.get(pair.off_file), onFile = byId.get(pair.on_file);
    const time = quantity(pair.time, "time"), wavelength = number(pair.wavelength_nm), current = quantity(pair.current, "current");
    let power = quantity(pair.power, "power");
    if (!pair.condition.trim() || !pair.replicate.trim()) reasons.push("Condição e réplica são obrigatórias");
    if (time === null || time < 0) reasons.push("Tempo de irradiação inválido; informe unidade");
    if (wavelength === null || wavelength <= 0) reasons.push("Comprimento de onda inválido (nm)");
    if (current === null || current < 0) reasons.push("Corrente inválida; informe unidade (é metadado)");
    if (pair.off_time && (quantity(pair.off_time, "time") === null || quantity(pair.off_time, "time") !== time)) reasons.push("Tempos OFF/ON incompatíveis");
    if (pair.scale !== "comparable") reasons.push(pair.scale === "basepeak" ? "Intensidades relativas ao pico-base de cada espectro são insuficientes" : "Confirme que as intensidades OFF/ON estão em escala comparável");
    if (!Number.isFinite(state.precursor) || state.precursor <= 0 || !Number.isFinite(state.tolerance) || state.tolerance < 0) reasons.push("Precursor ou janela m/z inválidos");
    if (pair.calibration) {
      const source: SpectrumFile = {id: pair.id, filename: pair.id, metadata: {...emptyMetadata(), current: current === null ? "" : String(current), wavelength: wavelength === null ? "" : String(wavelength)}, peaks: [], warnings: [], validLineCount: 0, invalidLineCount: 0};
      const calibrated = calibratedFiles([source], {...pair.calibration, assumeWavelength: false})[0];
      power = number(calibrated.metadata.opticalPower);
      provenance.push(calibrated.metadata.powerCalibration || "Calibração desativada ou indisponível");
    }
    if (power === null) reasons.push("Potência óptica ausente/inválida; use unidade ou associe calibração explicitamente");
    else if (power < 0) warnings.push("Potência negativa preservada; revisar correção de fundo");
    const extract = (side: "off" | "on", file: SpectrumFile | undefined) => {
      if (!pair[`${side}_file`]) return number(pair[side]);
      if (!file) {reasons.push(`Arquivo ${side.toUpperCase()} não encontrado`); return null;}
      if (file.catalog) {
        const input = file.catalog.input;
        provenance.push(`${side.toUpperCase()} catálogo: ${JSON.stringify(input)}`);
        if (input.intensity.state === "base-peak-relative") reasons.push(`${side.toUpperCase()}: catálogo registra normalização individual ao pico-base; insuficiente para Photodepletion`);
        if (!pair.scaleReview?.trim()) reasons.push("Registre a justificativa de comparabilidade dos TXT do catálogo");
      }
      // Bruker retains peaks without scan boundaries: cannot reconstruct acquisition means.
      if (file.bruker) {reasons.push(`Arquivo ${side.toUpperCase()} Bruker: não há scans individuais para a média por aquisição; forneça intensidade média validada na tabela`); return null;}
      const extracted = processSpectra([file], [{id: "photo", targetMz: state.precursor, label: ""}], state.tolerance)[0];
      provenance.push(`${side.toUpperCase()}: ${file.filename}; ${file.thermo ? "média dos máximos por scan" : "máximo na janela; TXT deve representar uma aquisição"}; ${JSON.stringify(extracted.thermoScanSelections ?? [])}`);
      if (extracted.warning) warnings.push(`${side.toUpperCase()}: ${extracted.warning}`);
      const fileTime = file.metadata.activationTime;
      if (fileTime && (quantity(fileTime, "time") === null || quantity(fileTime, "time") !== time)) reasons.push(`Tempo ${side.toUpperCase()} do arquivo incompatível com o par`);
      return extracted.absoluteIntensity;
    };
    const off = extract("off", offFile), on = extract("on", onFile);
    for (const [name, value] of [["OFF", off], ["ON", on]] as const) if (value === null || value <= 0) reasons.push(`Intensidade ${name} ausente, zero ou negativa`);
    const ratio = off !== null && on !== null && off > 0 && on > 0 ? off / on : null;
    const y = ratio === null ? null : Number.isFinite(ratio) && ratio > 0 ? Math.log(ratio) : Math.log(off!) - Math.log(on!);
    if (y !== null && y < 0) warnings.push("ON > OFF: Y negativo preservado; revisar");
    if (pair.exclude_reason.trim()) reasons.push(`Exclusão manual: ${pair.exclude_reason}`);
    const offSetup = catalogSetup(offFile), onSetup = catalogSetup(onFile);
    const instruments = [...new Set([pair.instrument, offFile?.thermo?.instrument, onFile?.thermo?.instrument, offSetup.instrument, onSetup.instrument].filter(Boolean))];
    const geometries = [...new Set([pair.geometry, offSetup.geometry, onSetup.geometry].filter(Boolean))];
    if ((offSetup.instrument && onSetup.instrument && offSetup.instrument !== onSetup.instrument) || (offSetup.setup && onSetup.setup && offSetup.setup !== onSetup.setup)) reasons.push("Instrumentos ou configurações ópticas OFF/ON do catálogo incompatíveis; revise as fontes");
    if (offFile?.thermo && onFile?.thermo && (offFile.thermo.instrument !== onFile.thermo.instrument || offFile.thermo.channel !== onFile.thermo.channel)) reasons.push("Instrumentos ou canais OFF/ON incompatíveis");
    const series = JSON.stringify([wavelength, time, instruments, geometries.join(" / "), offFile?.thermo?.channel ?? "", onFile?.thermo?.channel ?? "", ...(offSetup.setup || onSetup.setup ? [offSetup.setup, onSetup.setup] : [])]);
    const label = `${wavelength ?? "?"} nm · ${time ?? "?"} s${instruments.length ? ` · ${instruments.join(" / ")}` : ""}${geometries.length ? ` · ${geometries.join(" / ")}` : ""}`;
    return {pair, power: power === null ? null : power * (state.unit === "µW" ? 1000 : 1), time, wavelength, off, on, y, series, label: state.labels[series] || label, reasons, warnings, provenance: provenance.join("; "), offFile: offFile?.filename ?? "", onFile: onFile?.filename ?? "", acquisition: pair.on_file || pair.on_id};
  });
  const duplicate = (key: (r: PhotoResult) => string, message: string, warning = false) => {
    const groups = new Map<string, PhotoResult[]>();
    for (const r of results) {if (!warning && r.pair.exclude_reason.trim()) continue; const k = key(r); if (k) groups.set(k, [...(groups.get(k) ?? []), r]);}
    for (const group of groups.values()) if (group.length > 1) for (const r of group) (warning ? r.warnings : r.reasons).push(message);
  };
  duplicate(r => JSON.stringify([r.series, r.pair.condition, r.power, r.pair.replicate]), "Réplica duplicada na condição; revise a associação");
  duplicate(r => r.acquisition, "Aquisição ON reutilizada; não é réplica independente");
  duplicate(r => r.pair.on_id, "ID de aquisição ON reutilizado; não é réplica independente");
  duplicate(r => {
    const input = byId.get(r.pair.on_file)?.catalog?.input;
    const source = input?.rawSource?.sha256 || input?.replication.experimentalUnit;
    return source ? JSON.stringify([source, r.series, r.pair.condition, r.power]) : "";
  }, "Averages da mesma aquisição na condição; selecione um average e exclua os demais com motivo, sem contar como réplicas");
  duplicate(r => r.pair.off_file || r.pair.off_id, "Controle OFF compartilhado: resultados compartilham a incerteza do controle", true);
  duplicate(r => byId.get(r.pair.off_file)?.catalog?.input.rawSource?.sha256 || "", "Averages OFF da mesma fonte: resultados compartilham a incerteza do controle", true);
  for (const r of results) {
    if (r.pair.off_file && r.pair.off_file === r.pair.on_file) r.reasons.push("Mesmo arquivo selecionado para OFF e ON");
    if (r.pair.off_id && r.pair.off_id === r.pair.on_id) r.reasons.push("Mesmo ID de aquisição para OFF e ON");
  }
  const groups = new Map<string, PhotoResult[]>();
  for (const r of results.filter(r => !r.reasons.length)) {const key = JSON.stringify([r.series, r.pair.condition, r.power]); groups.set(key, [...(groups.get(key) ?? []), r]);}
  const means: PhotoMean[] = [...groups.values()].map(members => {
    const y = members.reduce((sum, r) => sum + r.y!, 0) / members.length;
    return {series: members[0].series, condition: members[0].pair.condition, power: members[0].power!, y, n: members.length, sd: members.length > 1 ? Math.sqrt(members.reduce((sum, r) => sum + (r.y! - y) ** 2, 0) / (members.length - 1)) : null, members};
  });
  const min = state.min.trim() ? number(state.min) : -Infinity, max = state.max.trim() ? number(state.max) : Infinity;
  const rangeError = min === null || max === null || min > max ? "Intervalo de ajuste inválido" : "";
  const series = [...new Map(results.map(r => [r.series, r.label])).entries()];
  const fits: PhotoFit[] = series.map(([key, label]) => {
    const points = (state.fitMeans ? means.filter(m => m.series === key).map(m => ({x: m.power, y: m.y})) : results.filter(r => r.series === key && !r.reasons.length).map(r => ({x: r.power!, y: r.y!}))).filter(p => !rangeError && p.x >= min! && p.x <= max!);
    const n = points.length, mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
    const denominator = points.reduce((s, p) => s + (state.origin ? p.x ** 2 : (p.x - mx) ** 2), 0);
    const reason = rangeError || (n < 2 || new Set(points.map(p => p.x)).size < 2 || denominator === 0 ? "Necessárias duas potências distintas" : "");
    const a = reason ? null : points.reduce((s, p) => s + (state.origin ? p.x * p.y : (p.x - mx) * (p.y - my)), 0) / denominator;
    const b = a === null ? null : state.origin ? 0 : my - a * mx;
    const sst = points.reduce((s, p) => s + (p.y - my) ** 2, 0);
    const r2 = a === null || sst === 0 ? null : 1 - points.reduce((s, p) => s + (p.y - (a * p.x + b!)) ** 2, 0) / sst;
    return {series: key, label, a, b, r2, n, min: n ? Math.min(...points.map(p => p.x)) : null, max: n ? Math.max(...points.map(p => p.x)) : null, reason, points};
  });
  return {results, means, fits, series, rangeError};
}
export type PhotoAnalysis = ReturnType<typeof analyzePhoto>;
export function photoTraces(analysis: PhotoAnalysis, state: PhotoState, colors: Record<string, string>, palette: ColorPaletteId, markerSize: number, lineWidth: number, legend: boolean): PlotTrace[] {
  return analysis.series.flatMap(([series, label], index) => {
    const color = colors[series] ?? paletteColor(palette, -1, index);
    const rows = analysis.results.filter(r => r.series === series && !r.reasons.length);
    if (!rows.length) return [];
    const base: PlotTrace = {type: "scatter", mode: "markers", x: rows.map(r => r.power!), y: rows.map(r => r.y!), name: label, text: rows.map(r => `${r.pair.condition} · réplica ${r.pair.replicate}`), hovertemplate: "%{text}<br>P=%{x}<br>ln(OFF/ON)=%{y}<extra></extra>", marker: {size: markerSize, color}, line: {width: lineWidth, color, shape: "linear"}, showlegend: legend, legendgroup: series, meta: {ionId: series}};
    const traces = [base];
    if (state.means) {
      const means = analysis.means.filter(m => m.series === series);
      // Plotly may coerce null errors to zero; n=1 must have no error-bar trace.
      for (const group of [means.filter(m => m.sd === null), means.filter(m => m.sd !== null)]) {
        if (!group.length) continue;
        traces.push({...base, name: `${label} · média${group[0].sd === null ? "" : " ± SD"}`, x: group.map(m => m.power), y: group.map(m => m.y), text: group.map(m => `${m.condition}; n=${m.n}${m.n === 1 ? "; SD não estimado" : `; SD=${m.sd}`}`), marker: {size: markerSize * 1.5, color}, showlegend: false, ...(group[0].sd !== null ? {error_y: {type: "data" as const, array: group.map(m => m.sd), visible: true, color, thickness: lineWidth, width: 5}} : {})});
      }
    }
    const fit = analysis.fits.find(f => f.series === series)!;
    if (state.fit && fit.a !== null) traces.push({...base, mode: "lines", name: `${label} · ajuste`, x: [fit.min!, fit.max!], y: [fit.a * fit.min! + fit.b!, fit.a * fit.max! + fit.b!], text: ["Ajuste linear", "Ajuste linear"], showlegend: false, line: {...base.line, dash: "dash"}});
    return traces;
  });
}
export function photoCsv(analysis: PhotoAnalysis, state: PhotoState, delimiter = ",") {
  const headers = [...photoFields, "pair_id", "original_json", "off_filename", "on_filename", "precursor_mz", "mz_half_window", "power_value", "power_unit", "time_s", "I_OFF", "I_ON", "ln_OFF_ON", "series", "status", "exclusion_reasons", "warnings", "n", "mean_Y", "sample_SD", "fit_used", "fit_basis", "fit_min", "fit_max", "force_origin", "slope", "intercept", "R2_centered", "fit_n", "fit_exclusion", "provenance", "calibration_json", "comparability_review"];
  const rows = analysis.results.map(r => {
    const mean = analysis.means.find(m => m.members.includes(r)), fit = analysis.fits.find(f => f.series === r.series)!;
    const fitUsed = state.fit && !r.reasons.length && fit.a !== null && r.power! >= fit.min! && r.power! <= fit.max!;
    return [...photoFields.map(k => r.pair[k]), r.pair.id, JSON.stringify(r.pair.original ?? {}), r.offFile, r.onFile, state.precursor, state.tolerance, r.power, state.unit, r.time, r.off, r.on, r.y, r.label, r.reasons.length ? "excluded" : "valid", r.reasons.join("; "), r.warnings.join("; "), mean?.n ?? null, mean?.y ?? null, mean?.sd ?? null, String(fitUsed), state.fitMeans ? "condition means" : "pairs", state.min, state.max, String(state.origin), state.fit ? fit.a : null, state.fit ? fit.b : null, state.fit ? fit.r2 : null, state.fit ? fit.n : 0, fitUsed ? "" : !state.fit ? "Fit disabled" : r.reasons.join("; ") || fit.reason || "Outside fit interval", r.provenance, r.pair.calibration ? JSON.stringify(r.pair.calibration) : ""];
  });
  return [headers, ...rows.map((row, i) => [...row, analysis.results[i].pair.scaleReview ?? ""])].map(row => row.map(escapeCsvValue).join(delimiter)).join("\n");
}
