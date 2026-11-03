import { useMemo, useState } from "react";
import type { SpectrumFile } from "../types";
import { errorBarFile, type ErrorBarSettings, type ErrorBarFile } from "../utils/errorBars";
import { TableTools } from "./TableTools";

type Props = {files:SpectrumFile[];settings:ErrorBarSettings;onChange:(settings:ErrorBarSettings)=>void;warnings:string[];pointCount:number};
export function ErrorBarControls({files,settings,onChange,warnings,pointCount}:Props) {
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const [bulkGroup,setBulkGroup]=useState("");
  const matching=useMemo(()=>files.filter(file=>`${file.filename} ${errorBarFile(file,settings).group}`.toLowerCase().includes(query.toLowerCase())),[files,settings,query]);
  const safePage=Math.min(page,Math.max(0,Math.ceil(matching.length/50)-1));
  const included=files.filter(file=>errorBarFile(file,settings).included).length;
  const unavailable=Object.entries(settings.files).filter(([id,choice])=>!choice.included && !files.some(file=>file.id===id)).length;
  const update=(file:SpectrumFile,patch:Partial<ErrorBarFile>)=>onChange({...settings,files:{...settings.files,[file.id]:{...errorBarFile(file,settings),...patch}}});
  const snapshot=()=>({...settings.files,...Object.fromEntries(files.map(file=>[file.id,errorBarFile(file,settings)]))});
  return <details className="plot-control-group plot-accordion">
    <summary>Error bars</summary>
    <div className="plot-accordion-content">
      <label>Error bars<select aria-label="Error bars" value={settings.mode} onChange={event=>onChange({...settings,mode:event.target.value as ErrorBarSettings["mode"],files:snapshot()})}>
        <option value="individual">Individual files — no error bars</option>
        <option value="acquisition-sd">Mean ± SD between acquisitions</option>
        <option value="unit-sem">Mean ± SEM of independent units</option>
      </select></label>
      <p>{included} of {files.length} files included · {pointCount} plotted points across all ions.</p>
      {unavailable>0 && <p role="status">{unavailable} previously excluded files are recorded in this result but their TXT data are not included. Reimport the original catalog selection to include those files again.</p>}
      {settings.mode === "acquisition-sd" && <p>One value per acquisition. Bars show descriptive spread (sample SD), not uncertainty from independent experiments. Each acquisition has equal weight; n=1 has no bar.</p>}
      {settings.mode === "unit-sem" && <>
        <p>Repeated acquisitions of one experimental unit are averaged first. Each independent unit then has equal weight. n counts units, never scans.</p>
        <label className="checkbox-label"><input type="checkbox" checked={settings.independence.confirmed} onChange={event=>onChange({...settings,independence:{...settings.independence,confirmed:event.target.checked,at:event.target.checked ? new Date().toISOString() : ""}})} />I have reviewed that the identified experimental units are independent</label>
        <label>Review note<input aria-label="Independence review note" value={settings.independence.reason} onChange={event=>onChange({...settings,independence:{...settings.independence,reason:event.target.value}})} placeholder="What was independently repeated?" /></label>
      </>}
      <details><summary>Files, groups and exclusions</summary>
        <p>Suggested groups come from the catalog or Experiment group. Files at the same x value and matching recorded conditions form one point. Different recorded conditions and intensity scales stay separate.</p>
        <label>Group for listed files<input aria-label="Group for listed files" value={bulkGroup} onChange={event=>setBulkGroup(event.target.value)} /></label>
        <button type="button" className="secondary-button" disabled={!bulkGroup.trim() || !matching.length} onClick={()=>onChange({...settings,files:{...snapshot(),...Object.fromEntries(matching.map(file=>[file.id,{...errorBarFile(file,settings),group:bulkGroup.trim()}]))}})}>Apply group to listed files</button>
        <TableTools query={query} onQuery={setQuery} count={matching.length} page={safePage} onPage={setPage} />
        <div className="table-shell"><table className="data-table"><thead><tr><th>Use</th><th>File</th><th>Group</th>{settings.mode === "unit-sem" && <th>Experimental unit</th>}<th>Exclusion reason</th></tr></thead><tbody>
          {matching.slice(safePage*50,(safePage+1)*50).map(file=>{const choice=errorBarFile(file,settings);return <tr key={file.id}>
            <td><input type="checkbox" aria-label={`Include ${file.filename} (${file.id})`} checked={choice.included} onChange={event=>update(file,{included:event.target.checked})} /></td>
            <td title={file.id}>{file.filename}</td>
            <td><input aria-label={`Error bar group for ${file.filename} (${file.id})`} value={choice.group} onChange={event=>update(file,{group:event.target.value})} /></td>
            {settings.mode === "unit-sem" && <td><input aria-label={`Experimental unit for ${file.filename} (${file.id})`} value={choice.unit} onChange={event=>update(file,{unit:event.target.value})} placeholder="Same unit → same ID" /></td>}
            <td><input aria-label={`Exclusion reason for ${file.filename} (${file.id})`} value={choice.reason} disabled={choice.included} onChange={event=>update(file,{reason:event.target.value})} /></td>
          </tr>;})}
        </tbody></table></div>
      </details>
      <p>Scan variability is a different measurement. It requires matching per-scan statistics for the selected ion and extraction method; it is not substituted for acquisition error bars.</p>
      {warnings.length>0 && <details open><summary>Error bar review ({warnings.length})</summary>{warnings.map(warning=><p role="status" key={warning}>{warning}</p>)}</details>}
    </div>
  </details>;
}
