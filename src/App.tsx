import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataSources } from "./components/DataSources";
import { CatalogExchange } from "./components/CatalogExchange";
import { FileUpload } from "./components/FileUpload";
import { IonSelectionPanel, formatIonText } from "./components/IonSelectionPanel";
import { WorkspacePanelBoundary } from "./components/WorkspacePanelBoundary";
import { MetadataTable } from "./components/MetadataTable";
import { ProjectPanel } from "./components/ProjectPanel";
import { WorkspaceNavigation, type WorkspaceTab } from "./components/WorkspaceNavigation";
import { ProcessedDataTable } from "./components/ProcessedDataTable";
import { SegmentSpectrumExport } from "./components/SegmentSpectrumExport";
import type { IonTarget, MetadataField, SpectrumFile } from "./types";
import { emptyMetadata } from "./types";
import { createId } from "./utils/id";
import { normalizeIntensities } from "./utils/processing";
import { calibratedFiles } from "./utils/powerCalibration";
import { withSavedPowerCalibration } from "./utils/savedPowerCalibration";
import { createEmptyProject, createProjectSnapshot, parseProjectSnapshot, safeProjectFilename } from "./utils/project";
import { downloadTextFile } from "./utils/csv";
import { fillBlankMetadataFromFilename, inferMetadataFromFilename } from "./utils/filenameMetadata";
import { suggestIonTargets } from "./utils/ionSuggestions";
import { numericTargets } from "./utils/ions";
import { readTxt } from "./utils/readTxt";
import { useProjectSession } from "./hooks/useProjectSession";
import { useProcessedRows } from "./hooks/useProcessedRows";

declare global {
  interface Window {
    MSCloudAdapter?: {
      getCurrentProject: () => unknown;
      loadProject: (project: unknown) => void;
      getSavedProjects: () => unknown[];
      getPresets: () => unknown;
      loadPresets: (data: unknown) => void;
    };
    MSCloudPresets: { read: () => unknown; restore: (data: unknown) => void };
  }
}

const PlotBuilder = lazy(() => import("./components/PlotBuilder").then(module => ({default: module.PlotBuilder})));
const initialIons: IonTarget[] = [751, 659, 617, 375, 283, 255, 241].map(mass => ({id: createId("ion"), targetMz: String(mass), label: mass === 751 ? "parent ion" : mass === 659 ? "fragment 1" : mass === 617 ? "fragment 2" : mass === 241 ? "main fragment" : ""}));
const initial = withSavedPowerCalibration({...createProjectSnapshot("pd-ms-project", [], initialIons, 0.5, []), ionDraft: formatIonText(initialIons)});

function App() {
  const session = useProjectSession(initial, withSavedPowerCalibration);
  const {project, patch, currentRef} = session;
  const {files, ions, tolerance, projectName, plotSelectedOnly = false} = project;
  const selectedIds = useMemo(() => new Set(project.selectedFileIds), [project.selectedFileIds]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("files");
  const [plotVisited, setPlotVisited] = useState(false);
  const [plotExpanded, setPlotExpanded] = useState(false);
  const [plotRevision, setPlotRevision] = useState(0);
  const plotSettingsRef = useRef<Record<string, unknown>>(project.plotSettings ?? {});
  const [projectStatus, setProjectStatus] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [importMessages, setImportMessages] = useState<string[]>([]);
  const importController = useRef<AbortController>();
  const importEpoch = useRef(0);
  const numericIons = useMemo(() => numericTargets(ions), [ions]);
  const filesWithPower = useMemo(() => calibratedFiles(files, project.powerCalibration), [files, project.powerCalibration]);
  const processing = useProcessedRows(filesWithPower, numericIons, tolerance);
  const plottedFiles = useMemo(() => plotSelectedOnly ? filesWithPower.filter(file => selectedIds.has(file.id)) : filesWithPower, [filesWithPower, plotSelectedOnly, selectedIds]);
  const plottedRows = useMemo(() => plotSelectedOnly ? normalizeIntensities(processing.displayRows.filter(row => selectedIds.has(row.fileId))) : processing.displayRows, [processing.displayRows, plotSelectedOnly, selectedIds]);
  const selectTab = (tab: WorkspaceTab) => { if (tab === "plot") setPlotVisited(true); else setPlotExpanded(false); setActiveWorkspaceTab(tab); };
  useEffect(() => {
    if (!plotExpanded) return;
    const exitExpandedView = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setPlotExpanded(false);
        document.getElementById("plot-expand-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", exitExpandedView);
    return () => window.removeEventListener("keydown", exitExpandedView);
  }, [plotExpanded]);
  const updateIons = (next: IonTarget[]) => patch({ions: next, ionDraft: formatIonText(next)}, "ions");
  const onPlotSettingsChange = useCallback((settings: Record<string, unknown>) => {
    if (JSON.stringify(currentRef.current.plotSettings ?? {}) !== JSON.stringify(settings)) patch({plotSettings: settings}, "plot");
  }, [currentRef, patch]);
  const historyAction = (direction: "undo" | "redo") => { session[direction](); setPlotRevision(value => value + 1); setProjectStatus(direction === "undo" ? "Change undone" : "Change restored"); };

  const handleFilesSelected = async (uploads: FileList | File[]) => {
    if (importController.current) return;
    const controller = new AbortController(); importController.current = controller;
    const epoch = importEpoch.current;
    const loaded: SpectrumFile[] = [], messages: string[] = [];
    const known = new Set(currentRef.current.files.map(file => `${file.filename}\u0000${file.fingerprint}`));
    const fingerprints = new Set(currentRef.current.files.map(file => file.fingerprint).filter(Boolean));
    const chosen = Array.from(uploads);
    setImportMessages([]);
    try {
      for (let index = 0; index < chosen.length; index++) {
        if (controller.signal.aborted) break;
        const file = chosen[index]; setImportProgress(`Reading ${index + 1}/${chosen.length}: ${file.name}`);
        try {
          if (!file.name.toLowerCase().endsWith(".txt")) throw new Error("Choose a TXT spectrum");
          if (file.size > 128 * 1024 * 1024) throw new Error("TXT files must be at most 128 MB");
          const parsed = await readTxt(file, controller.signal);
          if (!parsed.peaks.length) throw new Error(parsed.warnings.join(" "));
          const identity = `${file.name}\u0000${parsed.fingerprint}`;
          if (known.has(identity)) throw new Error("Este TXT, com o mesmo nome e conteúdo, já foi importado");
          known.add(identity);
          if (fingerprints.has(parsed.fingerprint)) parsed.warnings.push("Conteúdo idêntico a outro TXT; arquivo preservado separadamente. Revise a aquisição de origem antes de contar como réplica.");
          fingerprints.add(parsed.fingerprint);
          loaded.push({id: createId("file"), filename: file.name, metadata: {...emptyMetadata(), ...inferMetadataFromFilename(file.name)}, ...parsed});
        } catch (error) {
          if (controller.signal.aborted) break;
          messages.push(`${file.name}: ${error instanceof Error ? error.message : "Read failed"}`);
        }
      }
      if (epoch !== importEpoch.current) return;
      if (loaded.length) {
        const latest = currentRef.current;
        patch({files: [...latest.files, ...loaded], selectedFileIds: [...latest.selectedFileIds, ...loaded.map(file => file.id)]});
      }
      setImportMessages([`${loaded.length} files added${controller.signal.aborted ? "; remaining import cancelled" : ""}.`, ...messages]);
    } finally { if (importController.current === controller) { importController.current = undefined; setImportProgress(""); } }
  };
  const loadExamples = async () => {
    const epoch = importEpoch.current;
    try {
      const examples = import.meta.glob("../example-data/*.txt", {query: "?raw", import: "default"});
      const samples = await Promise.all(Object.entries(examples).map(async ([path, load]) => new File([String(await load())], path.split("/").pop()!, {type: "text/plain"})));
      if (epoch === importEpoch.current) await handleFilesSelected(samples);
    } catch (error) { setProjectStatus(error instanceof Error ? error.message : "Could not load examples"); }
  };
  const updateMetadata = (fileId: string, field: MetadataField, value: string) => patch({files: files.map(file => file.id === fileId ? {...file, metadata: {...file.metadata, [field]: value}} : file)}, `metadata:${fileId}:${field}`);
  const saveProject = () => {
    downloadTextFile(safeProjectFilename(projectName), JSON.stringify({...project, savedAt: new Date().toISOString()}, null, 2), "application/json;charset=utf-8");
    session.markSaved(); setProjectStatus("Project download requested");
  };
  const resetImports = () => {
    importEpoch.current++; importController.current?.abort(); importController.current = undefined;
    setImportProgress(""); setImportMessages([]);
  };
  const newProject = () => {
    resetImports();
    session.restore(createEmptyProject());
    plotSettingsRef.current = {};
    setPlotRevision(value => value + 1); setPlotVisited(false); selectTab("files");
    setProjectStatus("Novo projeto criado. Use Undo para voltar ao trabalho anterior antes de fechar a página.");
    window.dispatchEvent(new Event("ms-project-new"));
  };
  const restoreProjectContent = (content: string) => {
    const snapshot = parseProjectSnapshot(content);
    resetImports();
    session.restore(snapshot); setPlotRevision(value => value + 1);
    setProjectStatus("Project opened. Undo returns to the previous project.");
  };
  const loadProject = async (file: File) => {
    const epoch = importEpoch.current;
    try { const content = await file.text(); if (epoch === importEpoch.current) restoreProjectContent(content); }
    catch (error) { setProjectStatus(error instanceof Error ? error.message : "Could not open project"); }
  };
  useEffect(() => {
    if (!session.ready) return;
    window.MSCloudAdapter = {
      getCurrentProject: () => ({...currentRef.current, savedAt: new Date().toISOString()}),
      loadProject: data => restoreProjectContent(JSON.stringify(data)),
      getSavedProjects: () => [],
      getPresets: () => window.MSCloudPresets.read(),
      loadPresets: data => window.MSCloudPresets.restore(data),
    };
    return () => { delete window.MSCloudAdapter; };
  });
  if (!session.ready) return <main className="loading-screen" role="status">Restoring your workspace…</main>;
  return <div className={`app-shell ${activeWorkspaceTab === "plot" ? "plot-view-active" : ""} ${activeWorkspaceTab === "plot" && plotExpanded ? "plot-focus-active" : ""}`}>
    <header className="app-header compact-header">
      <h1>PD-MS <span>Plot Builder</span></h1>
      <ProjectPanel projectName={projectName} status={projectStatus} dirty={session.dirty} backupStatus={session.backupStatus} canUndo={session.canUndo} canRedo={session.canRedo} onUndo={() => historyAction("undo")} onRedo={() => historyAction("redo")} onProjectNameChange={value => patch({projectName: value}, "name")} onSaveProject={saveProject} onLoadProject={loadProject} onNewProject={newProject} />
      <WorkspaceNavigation activeTab={activeWorkspaceTab} onSelect={selectTab} fileCount={files.length} ionCount={numericIons.length} rowCount={processing.rows.length} />
    </header>
    <main className="app-main">
      <div className="workspace-tab-panel active-panel">
        {processing.busy && <div className="processing-status" role="status">Processing spectra in the background… <button type="button" onClick={processing.cancel}>Cancel processing</button></div>}
        {processing.error && <div className="validation-notice" role="alert">{processing.error} <button type="button" onClick={processing.retry}>Retry processing</button></div>}
        <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={activeWorkspaceTab !== "files"}>
          <CatalogExchange project={project} onOpen={snapshot => {resetImports(); session.restore(snapshot); setPlotRevision(value => value + 1); setPlotVisited(false); setProjectStatus("Pacote do catálogo aberto; Undo recupera o projeto anterior.");}} />
          <DataSources hasFiles={files.length > 0} hasLegacyFiles={files.some(file => file.thermo || file.bruker)} loading={!!importProgress} onExamples={() => void loadExamples()} onPhotodepletion={() => {
            patch({plotSettings: {...currentRef.current.plotSettings, analysisMode: "photodepletion"}}, "plot");
            setPlotRevision(value => value + 1); selectTab("plot");
          }} />
          <FileUpload onFilesSelected={handleFilesSelected} isLoading={!!importProgress} />
          {importProgress && <div role="status" className="processing-status">{importProgress} <button onClick={() => importController.current?.abort()}>Cancel import</button></div>}
          {importMessages.length > 0 && <div className="validation-notice" role="status">{importMessages.map(message => <p key={message}>{message}</p>)}</div>}
          {files.length > 0 && <MetadataTable files={files} selectedIds={selectedIds} plotSelectedOnly={plotSelectedOnly}
            onToggleFile={(id, checked) => patch({selectedFileIds: checked ? [...selectedIds, id] : [...selectedIds].filter(value => value !== id)}, "selection")}
            onToggleAll={checked => patch({selectedFileIds: checked ? files.map(file => file.id) : []})}
            onPlotSelectedOnlyChange={value => patch({plotSelectedOnly: value})}
            onInferFilenameMetadata={() => patch({files: files.map(file => !selectedIds.size || selectedIds.has(file.id) ? {...file, metadata: fillBlankMetadataFromFilename(file.metadata, file.filename)} : file)})}
            onUpdateMetadata={updateMetadata} onApplyBulkMetadata={(field, value) => patch({files: files.map(file => selectedIds.has(file.id) ? {...file, metadata: {...file.metadata, [field]: value}} : file)})}
            onRemoveSelected={() => patch({files: files.filter(file => !selectedIds.has(file.id)), selectedFileIds: []})} />}
        </div>
        <div id="panel-ions" role="tabpanel" aria-labelledby="tab-ions" hidden={activeWorkspaceTab !== "ions"}><WorkspacePanelBoundary name="Ions">{() => <IonSelectionPanel ions={ions} ionText={project.ionDraft ?? formatIonText(ions)} onIonTextChange={value => patch({ionDraft: value}, "ionDraft")} tolerance={tolerance} roundingPrecisions={[...new Set(files.flatMap(file => file.bruker?.mzDecimals === undefined ? [] : [file.bruker.mzDecimals]))]} canSuggestIons={files.some(file => file.peaks.length > 0)} onIonsChange={updateIons} onToleranceChange={value => patch({tolerance: value}, "tolerance")} onSuggestIons={decimals => {
          const suggestions = suggestIonTargets(selectedIds.size ? files.filter(file => selectedIds.has(file.id)) : files, tolerance, 6, decimals); if (suggestions.length) updateIons(suggestions);
        }} />}</WorkspacePanelBoundary></div>
        <div id="panel-plot" role="tabpanel" aria-labelledby="tab-plot" className="plot-panel-host" hidden={activeWorkspaceTab !== "plot"}>{plotVisited && <WorkspacePanelBoundary key={plotRevision} name="Plot">{() => <Suspense fallback={<p role="status">Loading plot tools…</p>}><PlotBuilder getProject={() => currentRef.current} onCatalogExport={catalog => patch({catalog})} powerCalibration={project.powerCalibration} onPowerCalibrationChange={powerCalibration => patch({powerCalibration})} processingBusy={processing.busy} expanded={plotExpanded} onExpandedChange={setPlotExpanded} initialSettings={project.plotSettings ?? {legendPosition: "top"}} settingsRef={plotSettingsRef} onSettingsChange={onPlotSettingsChange} projectName={projectName} files={plottedFiles} photoFiles={files} rows={plottedRows} isActive={activeWorkspaceTab === "plot"} /></Suspense>}</WorkspacePanelBoundary>}</div>
        <div id="panel-data" role="tabpanel" aria-labelledby="tab-data" hidden={activeWorkspaceTab !== "data"}><SegmentSpectrumExport files={files} isActive={activeWorkspaceTab === "data"} /><ProcessedDataTable rows={processing.rows} projectName={projectName} /></div>
      </div>
    </main>
  </div>;
}
export default App;
