import { useState } from "react";
import type { ProjectSnapshot } from "../types";
import { importCatalogPackage, type CatalogPreview } from "../utils/catalogProject";

export function CatalogExchange({project, onOpen}: {project: ProjectSnapshot; onOpen: (project: ProjectSnapshot) => void}) {
  const [preview, setPreview] = useState<CatalogPreview>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="workspace-section">
    <h2>Pacotes do MS Catalog</h2>
    <p>No estudo do catálogo, exporte uma seleção para MS Plot. Abra o ZIP aqui, confira os averages e escolha a análise. Em Plot, baixe o resultado para importar de volta no estudo.</p>
    <label className="primary-file-button">Abrir pacote do catálogo<input type="file" accept=".zip" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setBusy(true); setPreview(undefined); setStatus("Verificando pacote, integridade e vínculos…");
      try {if (file.size > 100 * 1024 * 1024) throw Error("Pacote excede 100 MiB."); const next = await importCatalogPackage(new Uint8Array(await file.arrayBuffer())); setPreview(next); setStatus("Pacote válido. Confira as fontes antes de abrir.");}
      catch (error) {setStatus(error instanceof Error ? error.message : "Falha ao abrir pacote");}
      finally {setBusy(false);}
    }} /></label>
    <p role="status">{status}</p>
    {preview && <div>
      <h3>{preview.manifest.catalog.study.name}</h3>
      <p>{preview.manifest.kind === "selection" ? "Nova seleção" : "Reabrir versão editável"} · {preview.project.files.length} TXT · estudo {preview.manifest.catalog.study.id}</p>
      <SourceList project={preview.project} />
      <button type="button" className="primary-button" onClick={() => {onOpen(preview.project); setPreview(undefined); setStatus("Pacote aberto. Undo recupera o projeto anterior. Revise metadados e selecione os pares explicitamente.");}}>Abrir este projeto após revisar</button>
      <button type="button" className="secondary-button" onClick={() => {setPreview(undefined); setStatus("Revisão cancelada; projeto atual preservado.");}}>Cancelar</button>
      <p>Abrir troca o projeto em edição. Nenhum arquivo será enviado à conta do catálogo por esta ação.</p>
    </div>}
    {project.catalog && <details><summary>Fontes vinculadas: {project.catalog.selection.catalog.study.name}</summary><SourceList project={project} /><p>Versão de origem: {project.catalog.versionId || "seleção inicial"}. Em Plot, exporte PNG + CSV + projeto no mesmo pacote. Depois importe o ZIP no catálogo para salvar a versão.</p></details>}
  </section>;
}

function SourceList({project}: {project: ProjectSnapshot}) {
  return <div className="photo-review-table"><table><thead><tr><th>TXT / average</th><th>Experimento / RAW</th><th>Escala e proveniência</th></tr></thead><tbody>{project.files.map(file => {
    const input = file.catalog?.input;
    return <tr key={file.id}><td>{file.filename}{input && input.spectrum.name !== file.filename && <><br />{input.spectrum.name}</>}<br /><small>{input?.inputId || "Arquivo local sem vínculo"}</small></td><td>{input?.experiment.name}<br />{input?.rawSource?.name || "RAW não identificado"}</td><td>{input?.intensity.state || "unknown"}<br />{input?.intensity.evidence}<details><summary>Ver receita, scans e metadados</summary><pre style={{whiteSpace: "pre-wrap", maxWidth: 600}}>{JSON.stringify(input, null, 2)}</pre></details></td></tr>;
  })}</tbody></table></div>;
}
