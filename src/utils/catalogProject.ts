import type { ProjectSnapshot, SpectrumFile, ProcessedRow } from "../types";
import { emptyMetadata } from "../types";
import type { ExchangePackage, ResultPackage, FileDescriptor, Json, TableDescription } from "./analysis-exchange";
import { parseSpectrumTxt } from "./parser";
import { createEmptyProject, validateProjectSnapshot } from "./project";
import { analyzePhoto, readPhotoState, photoCsv } from "./photodepletion";
import { escapeCsvValue } from "./csv";
import { readExchange, writeExchange, sha256, encodeBase64, decodeBase64 } from "./catalogCodec";
import { canonical, verifyReceipt } from "./catalogExchangeCore";

const parseCatalogTxt = (text: string) => parseSpectrumTxt(text.replace(/[;,]/g, "\t"));
const uuid = () => crypto.randomUUID();
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", {fatal: true});
const unique = <T>(items: T[]) => [...new Set(items)];
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, Json>;
export const APP_VERSION = "0.2.0-catalog.1";
export type CatalogPreview = {manifest: ExchangePackage; project: ProjectSnapshot};

export async function importCatalogPackage(bytes: Uint8Array): Promise<CatalogPreview> {
  const {manifest, entries, manifestText} = await readExchange(bytes);
  if (manifest.kind === "result") {
    if (manifest.result.editor.app !== "ms-plot" || manifest.result.artifacts.project.formatId !== "pd-ms-plot-project" || manifest.result.artifacts.project.formatVersion !== "1") throw Error("Este resultado pertence a outro editor/formato. Abra-o no editor indicado pelo catálogo.");
    const descriptor = manifest.files.find(f => f.id === manifest.result.artifacts.project.fileId)!;
    const project = validateProjectSnapshot(JSON.parse(decoder.decode(entries[descriptor.path])));
    if (!project.catalog || project.catalog.resultId !== manifest.result.resultId || project.catalog.versionId !== manifest.result.versionId) throw Error("Projeto e versão do manifesto não coincidem.");
    await verifyCatalogProject(project);
    if (project.catalog.selection.packageId !== manifest.selectionReceipt.packageId || await sha256(encoder.encode(project.catalog.selectionManifest)) !== manifest.selectionReceipt.manifestSha256) throw Error("Recibo da seleção não coincide com o resultado.");
    verifyReceipt(manifest, project.catalog.selection);
    for (const file of project.files) {
      const input = manifest.inputs.find(i => i.inputId === file.catalog?.input.inputId);
      if (!input || canonical(input) !== canonical(file.catalog!.input)) throw Error("Proveniência do projeto divergente do manifesto.");
      const binding = manifest.result.artifacts.project.datasetBindings.find(b => b.datasetId === file.id);
      if (!binding || binding.inputIds.length !== 1 || binding.inputIds[0] !== input.inputId) throw Error("Vínculo do dataset inválido.");
    }
    if (project.files.length !== manifest.inputs.length) throw Error("Entradas do projeto não coincidem com as entradas do pacote.");
    project.catalog.envelopeExtensions = structuredClone(manifest.extensions);
    project.catalog.resultExtensions = structuredClone(manifest.result.extensions);
    return {manifest, project};
  }
  if (manifest.selection.intendedEditor !== "ms-plot") throw Error("Esta seleção foi preparada para MS Generator. Exporte uma seleção para MS Plot no catálogo.");
  const files = manifest.selection.orderedInputIds.map(id => {
    const input = manifest.inputs.find(i => i.inputId === id)!;
    const descriptor = manifest.files.find(f => f.id === input.txtFileId)!;
    const bytes = entries[descriptor.path];
    const parsed = parseCatalogTxt(decoder.decode(bytes));
    if (!parsed.peaks.length || parsed.invalidLineCount) throw Error(`${descriptor.name}: TXT não contém exclusivamente linhas numéricas válidas. Revise a fonte no catálogo.`);
    return {id: input.inputId, filename: descriptor.name, fingerprint: input.storedTxt.sha256, metadata: {...emptyMetadata(), compound: input.molecule.name, experiment: input.experiment.name, notes: `MS Catalog · ${input.spectrum.name} · ${input.inputId}`}, ...parsed,
      catalog: {input: structuredClone(input), txtBase64: encodeBase64(bytes)}} satisfies SpectrumFile;
  });
  const project: ProjectSnapshot = {...createEmptyProject(), projectName: manifest.catalog.study.name, files, selectedFileIds: files.map(f => f.id), ions: [{id: uuid(), targetMz: "457", label: "precursor"}], ionDraft: "457 precursor", catalog: {selection: manifest, selectionManifest: manifestText}};
  // No filename-derived pairing, power, normalization or Photodepletion mode.
  return {manifest, project};
}

export async function verifyCatalogProject(project: ProjectSnapshot) {
  const context = project.catalog;
  if (!context || context.selection.format !== "ms-analysis-exchange" || context.selection.kind !== "selection" || context.selection.schemaVersion !== "1.0.0" || canonical(JSON.parse(context.selectionManifest)) !== canonical(context.selection)) throw Error("Recibo do catálogo inválido no projeto.");
  for (const file of project.files) {
    if (file.thermo || file.bruker || !file.catalog) throw Error("Pacote do catálogo aceita somente os TXT vinculados à seleção. Use um projeto separado para fontes locais/RAW.");
    const {input, txtBase64} = file.catalog;
    const selected = context.selection.inputs.find(i => i.inputId === input.inputId);
    if (!selected || canonical(selected) !== canonical(input)) throw Error(`${file.filename}: fonte divergente do recibo.`);
    const bytes = decodeBase64(txtBase64);
    if (bytes.length !== input.storedTxt.size || await sha256(bytes) !== input.storedTxt.sha256) throw Error(`${file.filename}: integridade do TXT original inválida.`);
    if (JSON.stringify(parseCatalogTxt(decoder.decode(bytes)).peaks) !== JSON.stringify(file.peaks)) throw Error(`${file.filename}: intensidades originais foram alteradas. Importe novamente a seleção.`);
  }
}

export type ResultExport = {bytes: Uint8Array; project: ProjectSnapshot; manifest: ResultPackage};
export async function exportCatalogResult(source: ProjectSnapshot, png: Uint8Array, displayedRows: ProcessedRow[], csv: string): Promise<ResultExport> {
  if (!source.catalog) throw Error("Importe uma seleção do MS Catalog antes de exportar um resultado vinculado.");
  const project = structuredClone(source);
  const context = project.catalog!;
  const photoMode = project.plotSettings?.analysisMode === "photodepletion";
  const photo = readPhotoState(project.plotSettings?.photodepletion);
  const analysis = analyzePhoto(photo, project.files);
  const ids = photoMode ? unique(photo.pairs.flatMap(p => [p.off_file, p.on_file])) : unique(displayedRows.flatMap(r => r.statistics?.fileIds ?? [r.fileId]));
  if (!ids.length || ids.includes("")) throw Error("Todos os pares exportados devem estar ligados a TXT OFF/ON do catálogo. Intensidades somente da tabela podem ser exportadas pelo CSV normal.");
  // Aggregated rows carry source file IDs in their statistics.
  if (ids.some(id => !project.files.some(f => f.id === id))) throw Error("Há uma fonte sem vínculo inequívoco. Exporte pontos individuais ou revise os arquivos.");
  project.files = project.files.filter(f => ids.includes(f.id));
  project.selectedFileIds = project.selectedFileIds.filter(id => ids.includes(id));
  await verifyCatalogProject(project);
  const previousVersionId = context.versionId ?? null;
  context.resultId ??= uuid(); context.versionId = uuid();
  const now = new Date().toISOString(); project.savedAt = now;
  const inputByFile = new Map(project.files.map(f => [f.id, f.catalog!.input.inputId]));
  const inputs = project.files.map(f => f.catalog!.input);
  const usedInputIds = inputs.map(i => i.inputId);
  const entries: Record<string, Uint8Array> = {};
  const files: FileDescriptor[] = [];
  for (const file of project.files) {
    const descriptor = context.selection.files.find(f => f.id === file.catalog!.input.txtFileId)!;
    files.push(descriptor); entries[descriptor.path] = decodeBase64(file.catalog!.txtBase64);
  }
  const transformationId = uuid();
  const seriesMap = new Map<string, string>();
  const series = (photoMode ? analysis.series.map(([key, label]) => ({key, label, inputIds: unique(analysis.results.filter(r => r.series === key).flatMap(r => [inputByFile.get(r.pair.off_file)!, inputByFile.get(r.pair.on_file)!]))}))
    : unique(displayedRows.map(r => JSON.stringify([r.ionId, r.seriesId ?? ""]))).map(key => ({key, label: displayedRows.find(r => JSON.stringify([r.ionId, r.seriesId ?? ""]) === key)!.label, inputIds: unique(displayedRows.filter(r => JSON.stringify([r.ionId, r.seriesId ?? ""]) === key).flatMap(r => (r.statistics?.fileIds ?? [r.fileId]).map(id => inputByFile.get(id)!)))})))
    .map(s => {const seriesId = uuid(); seriesMap.set(s.key, seriesId); return {seriesId, label: s.label || "Íon", inputIds: s.inputIds, transformationIds: [transformationId]};});
  const lineage = photoMode ? analysis.results.map(r => [seriesMap.get(r.series)!, JSON.stringify(unique([inputByFile.get(r.pair.off_file), inputByFile.get(r.pair.on_file)]))])
    : displayedRows.map(r => [seriesMap.get(JSON.stringify([r.ionId, r.seriesId ?? ""]))!, JSON.stringify((r.statistics?.fileIds ?? [r.fileId]).map(id => inputByFile.get(id)))]);
  const table = addLineage(photoMode ? photoCsv(analysis, photo) : csv, lineage, photoMode ? photo.unit : null);
  const add = async (role: FileDescriptor["role"], name: string, mime: string, bytes: Uint8Array) => {
    const id = uuid(), path = `${role === "project" ? "project" : "outputs"}/${id}.${name.split(".").pop()}`;
    files.push({id, path, name, role, mime, size: bytes.length, sha256: await sha256(bytes)}); entries[path] = bytes; return id;
  };
  const pngId = await add("figure", "figure.png", "image/png", png);
  const csvId = await add("table", "analysis.csv", "text/csv", encoder.encode(table.text));
  const projectId = await add("project", "analysis.pdmsplot.json", "application/json", encoder.encode(JSON.stringify(project)));
  const limitations = ["Pacote local; importar e revisar no estudo do catálogo para salvar. Não enviado automaticamente.", "Revisões e independência experimental devem ser verificadas pelo pesquisador."];
  if (inputs.some(i => i.intensity.state !== "original")) limitations.push("Há TXT com escala original desconhecida ou transformada; consulte a revisão de comparabilidade de cada par.");
  const result: ResultPackage = {
    format: "ms-analysis-exchange", schemaVersion: "1.0.0", kind: "result", packageId: uuid(), createdAt: now, producer: {app: "ms-plot", version: APP_VERSION}, catalog: context.selection.catalog, requiredFeatures: [], inputs, files, extensions: structuredClone(context.envelopeExtensions ?? context.selection.extensions),
    selectionReceipt: {packageId: context.selection.packageId, manifestSha256: await sha256(encoder.encode(context.selectionManifest))},
    result: {resultId: context.resultId, versionId: context.versionId, previousVersionId, derivedFrom: null, title: project.projectName, analysisType: photoMode ? "photodepletion" : "other", editor: {app: "ms-plot", version: APP_VERSION}, status: "exploratory-unvalidated", usedInputIds,
      method: {id: photoMode ? "ln-off-on-v1" : "ion-window-maximum-v1", version: "1", definition: photoMode ? "ln(I_OFF/I_ON); acquisition average TXT; log each pair before condition mean and sample SD; independent per-series OLS" : "Maximum intensity in target m/z window of each original TXT; figure transformations recorded in plotSettings", parameters: asJson({tolerance: project.tolerance, ions: project.ions, plotSettings: project.plotSettings, powerCalibration: project.powerCalibration})},
      transformations: [{id: transformationId, order: 1, scope: "calculation", inputIds: usedInputIds, method: photoMode ? "precursor-window-maximum/log-pair/condition-mean-sample-SD/OLS" : "ion-window-maximum/plot-recipe", methodVersion: "1", parameters: asJson({plotSettings: project.plotSettings})}], series,
      photodepletion: photoMode ? {pairs: analysis.results.map(r => ({pairId: r.pair.id, offInputId: inputByFile.get(r.pair.off_file)!, onInputId: inputByFile.get(r.pair.on_file)!, status: r.reasons.length ? "rejected" : "accepted", review: {reviewer: "local-user", at: now, reason: r.reasons.join("; ") || r.pair.scaleReview || "Explicit pair selection and comparable-scale declaration"}})), formula: "Math.log(I_OFF / I_ON)", extraction: {method: "maximum within m/z window of acquisition-average TXT", window: {precursorMz: photo.precursor, halfWindowMz: photo.tolerance}, unit: null}, independentAxis: {name: "measured optical power or explicitly associated calibration", unit: photo.unit}, invalidSignalPolicy: "Exclude missing/nonpositive OFF/ON with reasons; preserve negative logarithms; no epsilon substitution", experimentalUnit: "user-declared acquisition / experimental replicate; never individual scans", comparability: {status: "unreviewed", review: null, limitations: analysis.results.flatMap(r => [...r.reasons, ...r.warnings])}} : null,
      artifacts: {figureFileIds: [pngId], tables: [{fileId: csvId, delimiter: ",", encoding: "utf-8", header: true, missingValue: "", formulaSafety: "Text cells beginning with =,+,-,@,tab or CR are prefixed with apostrophe; finite numeric cells preserved.", columns: table.columns, lineageColumns: {seriesId: "catalog_series_id", inputIds: "catalog_input_ids"}}], project: {fileId: projectId, editor: "ms-plot", formatId: "pd-ms-plot-project", formatVersion: "1", datasetBindings: project.files.map(f => ({datasetId: f.id, inputIds: [f.catalog!.input.inputId]}))}}, limitations, extensions: structuredClone(context.resultExtensions ?? {})}
  };
  return {bytes: await writeExchange(result, entries), project, manifest: result};
}

/** Parse the existing export, keeping multiline/quoted cells, then add row-level lineage. */
function addLineage(csv: string, lineage: string[][], powerUnit: string | null) {
  const records: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {if (quoted && csv[i + 1] === '"') {cell += c; i++;} else quoted = !quoted;}
    else if (!quoted && c === ",") {row.push(cell); cell = "";}
    else if (!quoted && c === "\n") {row.push(cell); records.push(row); row = []; cell = "";}
    else cell += c;
  }
  row.push(cell); records.push(row);
  if (quoted || records.length !== lineage.length + 1) throw Error("CSV e fontes não correspondem linha a linha; exportação interrompida.");
  const headers = [...records[0], "catalog_series_id", "catalog_input_ids"];
  const units: Record<string, string | null> = {wavelength_nm: "nm", precursor_mz: "m/z", mz_half_window: "m/z", power_value: powerUnit, time_s: "s", I_OFF: null, I_ON: null, ln_OFF_ON: "1", n: "1", mean_Y: "1", sample_SD: "1", slope: powerUnit ? `${powerUnit}^-1` : null, intercept: "1", R2_centered: "1", fit_n: "1"};
  const columns: TableDescription["columns"] = headers.map(name => ({name, type: name in units && name !== "wavelength_nm" ? "number" : "text", unit: units[name] ?? null, description: name}));
  const safe = (value: string) => escapeCsvValue(/^\s*[=+\-@\t\r]/.test(value) && !(value.trim() && Number.isFinite(Number(value))) ? `'${value}` : value);
  const text = [headers, ...records.slice(1).map((r, i) => [...r, ...lineage[i]])].map(r => r.map(safe).join(",")).join("\n");
  return {text, columns};
}

export function downloadPackage(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: "application/zip"}));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
