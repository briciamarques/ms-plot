import { unzipSync } from "fflate";
import type { SpectrumFile } from "../types";

export type PowerMeasurement = {
  filename: string;
  wavelengthNm: number;
  currentMa: number | null;
  intervalSeconds: number;
  replicate: string;
  powersW: number[];
  backgroundPhase?: "initial" | "final";
};
export type PowerCalibration = {
  measurements: PowerMeasurement[];
  wavelengthNm: number;
  intervalSeconds: number;
  backgroundIntervalSeconds: number;
  backgroundSource?: "initial" | "final" | "both";
  subtractBackground: boolean;
  interpolate: boolean;
  assumeWavelength: boolean;
  enabled: boolean;
};
export type PowerPoint = { currentMa: number; rawMw: number; powerMw: number; sdMw: number | null; n: number; samples: number };
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const sd = (values: number[]) => values.length < 2 ? null : Math.sqrt(values.reduce((sum, v) => sum + (v - mean(values)) ** 2, 0) / (values.length - 1));
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function csvCells(line: string, delimiter: string): string[] {
  const cells: string[] = []; let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (line[i] === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += line[i];
  }
  cells.push(value.trim()); return cells;
}

export function parsePowerCsv(filename: string, content: string): PowerMeasurement {
  const name = filename.split(/[\\/]/).pop()!;
  const match = name.match(/^(\d+(?:[p.]\d+)?)nm_(background|finalbackground|\d+(?:[p.]\d+)?mA)_(\d+(?:[p.]\d+)?)s_(\d+)\.csv$/i);
  if (!match) throw Error(`${name}: use nomes como 280nm_100mA_1s_1.csv ou 280nm_background_1s_1.csv.`);
  const numeric = (s: string) => Number(s.replace(/p/i, "."));
  const wavelengthNm = numeric(match[1]), intervalSeconds = numeric(match[3]);
  if (!positive(wavelengthNm) || !positive(intervalSeconds)) throw Error(`${name}: wavelength ou intervalo inválido.`);
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex(line => /Power\s*\(W\)/i.test(line) && /Samples/i.test(line));
  if (headerIndex < 0) throw Error(`${name}: não encontrei a coluna Power (W).`);
  const delimiter = lines[headerIndex].includes(";") ? ";" : ",";
  const header = csvCells(lines[headerIndex], delimiter);
  const powerIndex = header.findIndex(cell => /^Power\s*\(W\)$/i.test(cell));
  if (powerIndex < 0 || header.filter(cell => /^Power\s*\(W\)$/i.test(cell)).length !== 1) throw Error(`${name}: selecione um arquivo com um único canal Power (W).`);
  const intervalLine = lines.find(line => /^Sample Interval\s*[,;]/i.test(line));
  const reportedInterval = intervalLine && csvCells(intervalLine, delimiter)[1]?.match(/^([\d.]+)\s*s$/i);
  if (reportedInterval && Number(reportedInterval[1]) !== intervalSeconds) throw Error(`${name}: o intervalo no nome difere do Sample Interval.`);
  const wavelengthLine = lines.find(line => /^Wavelength\s*\/\s*Responsivity/i.test(line));
  const reportedWavelength = wavelengthLine && csvCells(wavelengthLine, delimiter)[1]?.match(/^([\d.]+)\s*nm$/i);
  if (reportedWavelength && Number(reportedWavelength[1]) !== wavelengthNm) throw Error(`${name}: wavelength no nome e no cabeçalho não coincidem.`);
  const powersW: number[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const cells = csvCells(line, delimiter);
    const value = cells[powerIndex]?.replace(",", ".");
    if (!/^\d+$/.test(cells[0]) || !value || !Number.isFinite(Number(value))) throw Error(`${name}: leitura de potência inválida na linha ${headerIndex + 2 + powersW.length}.`);
    powersW.push(Number(value));
  }
  if (!powersW.length) throw Error(`${name}: nenhuma leitura Power (W).`);
  const isBackground = /background$/i.test(match[2]);
  return {filename: name, wavelengthNm, intervalSeconds, currentMa: isBackground ? null : numeric(match[2].slice(0, -2)), replicate: String(Number(match[4])), powersW,
    ...(isBackground ? {backgroundPhase: /^final/i.test(match[2]) ? "final" as const : "initial" as const} : {})};
}

export async function readPowerUploads(files: File[]): Promise<PowerMeasurement[]> {
  const records: PowerMeasurement[] = [];
  let totalBytes = 0, count = 0;
  const limit = (size: number) => {
    totalBytes += size; count++;
    if (size > 5_000_000 || totalBytes > 25_000_000 || count > 2000) throw Error("Importe até 2000 CSVs, 5 MB por CSV e 25 MB no total.");
  };
  for (const file of files) {
    if (file.size > 25_000_000) throw Error(`${file.name}: limite de 25 MB.`);
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {filter: entry => {
        if (!/\.csv$/i.test(entry.name) || entry.name.startsWith("__MACOSX/")) return false;
        limit(entry.originalSize); return true;
      }});
      for (const [name, data] of Object.entries(entries)) records.push(parsePowerCsv(name, new TextDecoder().decode(data)));
    } else if (/\.csv$/i.test(file.name)) {
      limit(file.size); records.push(parsePowerCsv(file.name, await file.text()));
    } else throw Error(`${file.name}: escolha CSV ou ZIP.`);
  }
  if (!records.length) throw Error("Nenhum CSV de powermeter encontrado.");
  assertUniqueMeasurements(records);
  return records;
}

function assertUniqueMeasurements(records: PowerMeasurement[]) {
  const keys = new Set<string>();
  for (const r of records) {
    const key = JSON.stringify([r.wavelengthNm, r.intervalSeconds, r.currentMa, r.replicate, r.currentMa === null ? r.backgroundPhase ?? "initial" : ""]);
    if (keys.has(key)) throw Error(`${r.filename}: repetição duplicada para a mesma corrente, wavelength e intervalo. Importe uma campanha de calibração por vez.`);
    keys.add(key);
  }
}

export function defaultPowerCalibration(measurements: PowerMeasurement[]): PowerCalibration {
  const groups = new Map<string, {first: PowerMeasurement; currents: Set<number>}>();
  for (const m of measurements) {
    if (m.currentMa === null) continue;
    const key = JSON.stringify([m.wavelengthNm, m.intervalSeconds]);
    const group = groups.get(key) ?? {first: m, currents: new Set<number>()};
    group.currents.add(m.currentMa); groups.set(key, group);
  }
  // Prefer a current sweep over a single-current sampling-interval experiment.
  const first = [...groups.values()].sort((a, b) => b.currents.size - a.currents.size || a.first.wavelengthNm - b.first.wavelengthNm || a.first.intervalSeconds - b.first.intervalSeconds)[0]?.first;
  if (!first) throw Error("Importe também medições com corrente, além do background.");
  return {measurements, wavelengthNm: first.wavelengthNm, intervalSeconds: first.intervalSeconds, backgroundIntervalSeconds: first.intervalSeconds, backgroundSource: "initial", subtractBackground: true, interpolate: false, assumeWavelength: false, enabled: false};
}

export function importPowerCalibration(previous: PowerCalibration | undefined, incoming: PowerMeasurement[]): PowerCalibration {
  const wavelengths = new Set(incoming.map(m => m.wavelengthNm));
  const measurements = [...(previous?.measurements.filter(m => !wavelengths.has(m.wavelengthNm)) ?? []), ...incoming];
  if (measurements.length > 2000) throw Error("Limite de 2000 CSVs por projeto. Use projetos separados para campanhas maiores.");
  assertUniqueMeasurements(measurements);
  return {...defaultPowerCalibration(incoming), measurements};
}

export function selectPowerWavelength(config: PowerCalibration, wavelengthNm: number): PowerCalibration {
  const defaults = defaultPowerCalibration(config.measurements.filter(m => m.wavelengthNm === wavelengthNm));
  return {...config, wavelengthNm, intervalSeconds: defaults.intervalSeconds, backgroundIntervalSeconds: defaults.backgroundIntervalSeconds, assumeWavelength: false, enabled: false};
}

export function summarizePower(config: PowerCalibration) {
  const measured = config.measurements.filter(m => m.wavelengthNm === config.wavelengthNm && m.intervalSeconds === config.intervalSeconds && m.currentMa !== null);
  const availableBackgrounds = config.measurements.filter(m => m.wavelengthNm === config.wavelengthNm && m.intervalSeconds === config.backgroundIntervalSeconds && m.currentMa === null);
  const initialBackgrounds = availableBackgrounds.filter(m => (m.backgroundPhase ?? "initial") === "initial");
  const finalBackgrounds = availableBackgrounds.filter(m => m.backgroundPhase === "final");
  const source = config.backgroundSource ?? "initial";
  const backgrounds = source === "both" ? availableBackgrounds : source === "final" ? finalBackgrounds : initialBackgrounds;
  const backgroundMw = backgrounds.length ? mean(backgrounds.map(m => mean(m.powersW) * 1000)) : null;
  const error = config.subtractBackground && (backgroundMw === null || source === "both" && (!initialBackgrounds.length || !finalBackgrounds.length)) ? "Não há background da origem escolhida para este wavelength e intervalo. Escolha uma origem e intervalo disponíveis ou use a leitura bruta." : !measured.length ? "Não há medições de corrente nesta série." : "";
  const points: PowerPoint[] = [...new Set(measured.map(m => m.currentMa!))].sort((a, b) => a - b).map(currentMa => {
    const group = measured.filter(m => m.currentMa === currentMa);
    const means = group.map(m => mean(m.powersW) * 1000);
    const rawMw = mean(means);
    return {currentMa, rawMw, powerMw: rawMw - (config.subtractBackground ? backgroundMw ?? 0 : 0), sdMw: sd(means), n: means.length, samples: group.reduce((n, r) => n + r.powersW.length, 0)};
  });
  return {points, backgroundMw, backgroundN: backgrounds.length, initialBackgroundMw: initialBackgrounds.length ? mean(initialBackgrounds.map(m => mean(m.powersW) * 1000)) : null, finalBackgroundMw: finalBackgrounds.length ? mean(finalBackgrounds.map(m => mean(m.powersW) * 1000)) : null, error};
}

function metadataNumber(text: string, unit: string): number | null {
  const match = text.trim().match(new RegExp(`^([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)\\s*(?:${unit})?$`, "i"));
  return match && Number.isFinite(Number(match[1])) ? Number(match[1]) : null;
}

export function matchPower(file: SpectrumFile, config: PowerCalibration, summary = summarizePower(config)):
  {powerMw: number; method: string} | {reason: string} {
  if (summary.error) return {reason: summary.error};
  const wavelength = metadataNumber(file.metadata.wavelength, "nm");
  if (wavelength === null && !(config.assumeWavelength && !file.metadata.wavelength.trim())) return {reason: "Wavelength ausente ou inválido"};
  if (wavelength !== null && wavelength !== config.wavelengthNm) return {reason: "Wavelength diferente da calibração"};
  const current = metadataNumber(file.metadata.current, "mA");
  if (current === null || current < 0) return {reason: "Corrente ausente ou inválida (LED OFF não recebe zero automaticamente)"};
  const exact = summary.points.find(p => Math.abs(p.currentMa - current) < 1e-9);
  if (exact) return {powerMw: exact.powerMw, method: "measured-current"};
  if (!config.interpolate) return {reason: "Corrente sem medição exata"};
  const low = [...summary.points].reverse().find(p => p.currentMa < current), high = summary.points.find(p => p.currentMa > current);
  if (!low || !high) return {reason: "Corrente fora da faixa calibrada; sem extrapolação"};
  return {powerMw: low.powerMw + (high.powerMw - low.powerMw) * (current - low.currentMa) / (high.currentMa - low.currentMa), method: "linear-interpolation"};
}

export function calibratedFiles(files: SpectrumFile[], config?: PowerCalibration): SpectrumFile[] {
  if (!config?.enabled) return files;
  const summary = summarizePower(config);
  return files.map(file => {
    const match = matchPower(file, config, summary);
    const provenance = `${config.wavelengthNm} nm; sample interval ${config.intervalSeconds} s; ${config.subtractBackground ? `background ${summary.backgroundMw} mW (${config.backgroundIntervalSeconds} s, ${config.backgroundSource ?? "initial"})` : "raw power"}; ${"method" in match ? match.method : match.reason}${!file.metadata.wavelength.trim() && config.assumeWavelength ? "; wavelength assumed by user" : ""}`;
    return {...file, metadata: {...file.metadata, opticalPower: "powerMw" in match ? String(match.powerMw) : "", powerCalibration: provenance}};
  });
}

export function validatePowerCalibration(value: unknown): PowerCalibration {
  if (!value || typeof value !== "object") throw Error("Invalid power calibration");
  const c = value as PowerCalibration;
  if (c.backgroundSource !== undefined && !["initial", "final", "both"].includes(c.backgroundSource)) throw Error("Invalid background source");
  if (![c.wavelengthNm, c.intervalSeconds, c.backgroundIntervalSeconds].every(positive) ||
    !["subtractBackground", "interpolate", "assumeWavelength", "enabled"].every(key => typeof c[key as keyof PowerCalibration] === "boolean") ||
    !Array.isArray(c.measurements) || !c.measurements.length || c.measurements.length > 2000) throw Error("Invalid power calibration settings");
  for (const r of c.measurements) {
    if (r?.backgroundPhase !== undefined && (r.currentMa !== null || !["initial", "final"].includes(r.backgroundPhase))) throw Error("Invalid background phase");
    if (!r || typeof r.filename !== "string" || typeof r.replicate !== "string" || !r.replicate ||
      !positive(r.wavelengthNm) || !positive(r.intervalSeconds) ||
      !(r.currentMa === null || typeof r.currentMa === "number" && Number.isFinite(r.currentMa) && r.currentMa >= 0) ||
      !Array.isArray(r.powersW) || !r.powersW.length || !r.powersW.every(v => typeof v === "number" && Number.isFinite(v))) throw Error("Invalid power measurement");
  }
  assertUniqueMeasurements(c.measurements);
  return c;
}
