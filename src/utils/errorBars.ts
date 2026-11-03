import type { ProcessedRow, SpectrumFile, XAxisKey, YMode } from "../types";
import { metadataFields, plotYValue } from "../types";
import { axisNumericValue, isTimeAxis } from "./format";

export type ErrorBarFile = { included: boolean; group: string; unit: string; reason: string };
export type ErrorBarSettings = {
  version: 1;
  mode: "individual" | "acquisition-sd" | "unit-sem";
  files: Record<string, ErrorBarFile>;
  independence: { confirmed: boolean; reason: string; at: string };
};
export const defaultErrorBars = (): ErrorBarSettings => ({version:1, mode:"individual", files:{}, independence:{confirmed:false,reason:"",at:""}});
export const readErrorBars = (value: unknown): ErrorBarSettings => {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return defaultErrorBars();
  return structuredClone(value as ErrorBarSettings);
};
export function errorBarFile(file: SpectrumFile, settings: ErrorBarSettings): ErrorBarFile {
  const saved = settings.files[file.id];
  if (saved) return saved;
  const input = file.catalog?.input;
  const catalogGroup = input?.experiment.metadata.experimentGroup;
  // Catalog experiment names identify acquisitions, not curve groups.
  const group = input && file.metadata.experiment === input.experiment.name
    ? (typeof catalogGroup === "string" && catalogGroup.trim() ? catalogGroup : "Series 1")
    : file.metadata.experiment || (typeof catalogGroup === "string" ? catalogGroup : "Series 1");
  return {included:true,group,unit:input?.replication.status === "reviewed" ? input.replication.experimentalUnit ?? "" : "",reason:""};
}
const average = (values: number[]) => values.reduce((sum,value)=>sum+value,0)/values.length;

// Group labels are editable. Recorded conditions and intensity scales remain
// separate even if two labels match. Source snapshots are never overwritten.
function conditionKey(file: SpectrumFile, row: ProcessedRow, axis: XAxisKey) {
  const metadata = metadataFields.filter(f=>!["replicate","notes","experiment",axis,...(axis === "opticalPower" ? ["current"] : [])].includes(f.key))
    .map(f=>[f.key,isTimeAxis(f.key as XAxisKey) ? axisNumericValue(row.metadata[f.key],f.key as XAxisKey) ?? row.metadata[f.key] : row.metadata[f.key].trim()]);
  const input=file.catalog?.input, source=input?.experiment.metadata;
  const sourceKeys=["instrument","equipmentId","equipmentSnapshots","setupId","geometry","optics","distance","technique","led","concentration","concentrationUnit","solvent","additives","msLevel","polarity","precursor","collisionEnergy","collisionEnergyUnit","isolationWidth",
    ...(axis === "wavelength" ? [] : ["wavelength"]),
    ...(axis === "activationTime" || axis === "acqTime" ? [] : ["irradiationTime","exposureSetting"]),
    ...(axis === "current" || axis === "opticalPower" ? [] : ["current"]),
    ...(axis === "voltage" ? [] : ["voltage"])];
  const setup = source ? sourceKeys.map(key=>[key,key === "equipmentSnapshots" && source[key] && typeof source[key] === "object"
    ? Object.entries(source[key] as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([slot,snapshot])=>{
      if(!snapshot || typeof snapshot !== "object") return [slot,snapshot];
      // capturedAt is snapshot provenance, not a change in physical setup.
      const {capturedAt: _capturedAt,...configuration}=snapshot as Record<string,unknown>;
      return [slot,configuration];
    }) : source[key] ?? null]) : null;
  return [row.acquisitionKey ?? "",metadata,setup,input ? [input.intensity.state,input.intensity.unit,input.intensity.priorNormalization,input.intensity.scale,input.processing.recipe?.normalization] : null];
}

export function summarizeErrorBars(rows: ProcessedRow[], files: SpectrumFile[], axis: XAxisKey, yMode: YMode, settings: ErrorBarSettings) {
  const byId=new Map(files.map(file=>[file.id,file]));
  const warnings=new Set<string>();
  const included=rows.filter(row=>{
    const file=byId.get(row.fileId);
    if(!file) return false;
    const choice=errorBarFile(file,settings);
    if(!choice.included && !choice.reason.trim()) warnings.add(`Add an exclusion reason for ${file.filename}.`);
    return choice.included;
  });
  if(settings.mode === "individual") return {rows:included,warnings:[...warnings]};
  if(settings.mode === "unit-sem" && (!settings.independence.confirmed || !settings.independence.reason.trim() || !settings.independence.at)) {
    return {rows:included,warnings:[...warnings,"SEM needs identified independent experimental units and a review note. Showing individual files until that review is complete."]};
  }
  const groups=new Map<string,{series:string; rows:ProcessedRow[]}>();
  for(const row of included) {
    const file=byId.get(row.fileId)!, choice=errorBarFile(file,settings);
    const x=axisNumericValue(row.metadata[axis],axis);
    if(x===null || !choice.group.trim()) {
      warnings.add(`${file.filename}: add a group and a numeric x value before calculating error bars.`);
      continue;
    }
    const series=JSON.stringify([row.ionId,choice.group.trim(),conditionKey(file,row,axis)]);
    const key=JSON.stringify([series,x]);
    const group=groups.get(key) ?? {series,rows:[]}; group.rows.push(row); groups.set(key,group);
  }
  const result:ProcessedRow[]=[];
  for(const [key,group] of groups) {
    const sourceRows=group.rows;
    const sourceIds=sourceRows.map(row=>{
      const file=byId.get(row.fileId)!;
      return file.catalog?.input.rawSource?.sha256 || file.thermo?.fingerprint || file.id;
    });
    if(new Set(sourceIds).size!==sourceIds.length) {
      warnings.add(`${sourceRows[0].filename}: more than one average from the same acquisition. Exclude the alternative averages; individual files are shown for this group.`);
      result.push(...sourceRows); continue;
    }
    const units=new Map<string,ProcessedRow[]>();
    let missingUnit=false;
    sourceRows.forEach((row,index)=>{
      const unit=settings.mode === "unit-sem" ? errorBarFile(byId.get(row.fileId)!,settings).unit.trim() : sourceIds[index];
      if(!unit) missingUnit=true;
      units.set(unit,[...(units.get(unit) ?? []),row]);
    });
    if(missingUnit) {
      warnings.add(`${sourceRows[0].filename}: identify the experimental unit for every file to calculate SEM. Individual files are shown for this group.`);
      result.push(...sourceRows); continue;
    }
    const unitRows=[...units.values()];
    const values=unitRows.map(members=>average(members.map(row=>plotYValue(row,yMode))));
    const mean=average(values), n=values.length;
    const sd=n>1 ? Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(n-1)) : null;
    if(n===1) warnings.add(`${sourceRows[0].filename}: n=1; no error bar.`);
    const unitMean=(field:"absoluteIntensity"|"relativeIntensity"|"selectedIonPercent")=>average(unitRows.map(members=>average(members.map(row=>row[field]))));
    const first=sourceRows[0], file=byId.get(first.fileId)!;
    result.push({...first,id:key,fileId:key,seriesId:group.series,filename:`${n} ${settings.mode === "unit-sem" ? "experimental units" : "acquisitions"}: ${sourceRows.map(row=>row.filename).join("; ")}`,
      metadata:{...first.metadata,experiment:errorBarFile(file,settings).group},
      absoluteIntensity:unitMean("absoluteIntensity"),relativeIntensity:unitMean("relativeIntensity"),selectedIonPercent:unitMean("selectedIonPercent"),
      statistics:{n,sd,sem:settings.mode === "unit-sem" && sd!==null ? sd/Math.sqrt(n) : null,
        basis:settings.mode === "unit-sem" ? "between-experimental-units" : "between-acquisitions",errorType:settings.mode === "unit-sem" ? "sem" : "sd",
        sourceCount:sourceRows.length,unitIds:[...units.keys()],files:sourceRows.map(row=>row.filename),fileIds:sourceRows.map(row=>row.fileId),
        observations:sourceRows.map((row,index)=>({fileId:row.fileId,acquisitionId:sourceIds[index],unitId:settings.mode === "unit-sem" ? errorBarFile(byId.get(row.fileId)!,settings).unit.trim() : null,y:plotYValue(row,yMode),absoluteIntensity:row.absoluteIntensity,normalizationFactor:yMode === "absolute" ? 1 : row.absoluteIntensity!==0 ? plotYValue(row,yMode)/row.absoluteIntensity : null}))},
      warning:[...new Set(sourceRows.map(row=>row.warning).filter(Boolean))].join("; "),
      ...(sourceRows.some(row=>row.thermoScanSelections) ? {thermoScanSelections:sourceRows.flatMap(row=>row.thermoScanSelections ?? [])} : {}),
    });
  }
  return {rows:result,warnings:[...warnings]};
}
