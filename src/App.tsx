import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrukerImport } from "./components/BrukerImport";
import { ThermoImport } from "./components/ThermoImport";
import { FileUpload } from "./components/FileUpload";
import { IonSelectionPanel, formatIonText } from "./components/IonSelectionPanel";
import { WorkspacePanelBoundary } from "./components/WorkspacePanelBoundary";
import { MetadataTable } from "./components/MetadataTable";
import { ProjectPanel } from "./components/ProjectPanel";
import { PowerCalibrationPanel } from "./components/PowerCalibrationPanel";
import { ProcessedDataTable } from "./components/ProcessedDataTable";
import { SegmentSpectrumExport } from "./components/SegmentSpectrumExport";
import type { IonTarget, MetadataField, SpectrumFile } from "./types";
import { emptyMetadata } from "./types";
import { createId } from "./utils/id";
import { defaultPlotAppearance } from "./utils/plot";
import { normalizeIntensities } from "./utils/processing";
import { calibratedFiles } from "./utils/powerCalibration";
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
type WorkspaceTab = "files" | "bruker" | "thermo" | "power" | "ions" | "plot" | "data";
const workspaceTabs: {key: WorkspaceTab; label: string}[] = [
  {key: "files", label: "1 · Files & metadata"}, {key: "bruker", label: "Bruker files"},
  {key: "thermo", label: "Thermo RAW"}, {key: "power", label: "Power calibration"}, {key: "ions", label: "2 · Ions"},
  {key: "plot", label: "3 · Plot"}, {key: "data", label: "4 · Data"},
];
const initialIons: IonTarget[] = [751, 659, 617, 375, 283, 255, 241].map(mass => ({id: createId("ion"), targetMz: String(mass), label: mass === 751 ? "parent ion" : mass === 659 ? "fragment 1" : mass === 617 ? "fragment 2" : mass === 241 ? "main fragment" : ""}));
const initial = {...createProjectSnapshot("pd-ms-project", [], initialIons, 0.5, []), ionDraft: formatIonText(initialIons)};

function App() {
  const session = useProjectSession(initial);
  const {project, patch, currentRef} = session;
  const {files, ions, tolerance, projectName, plotSelectedOnly = false} = project;
  const selectedIds = useMemo(() => new Set(project.selectedFileIds), [project.selectedFileIds]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("files");
  const [plotVisited, setPlotVisited] = useState(false);
  const [plotExpanded, setPlotExpanded] = useState(false);
  const [plotRevision, setPlotRevision] = useState(0);
  const [importRevision, setImportRevision] = useState(0);
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
  const plottedRows = useMemo(() => plotSelectedOnly ? normalizeIntensities(processing.rows.filter(row => selectedIds.has(row.fileId))) : processing.rows, [processing.rows, plotSelectedOnly, selectedIds]);
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
  const changePlot = (settings: Record<string, unknown>) => { patch({plotSettings: settings}, "import"); setPlotRevision(value => value + 1); };

  const handleFilesSelected = async (uploads: FileList | File[]) => {
    if (importController.current) return;
    const controller = new AbortController(); importController.current = controller;
    const epoch = importEpoch.current;
    const loaded: SpectrumFile[] = [], messages: string[] = [];
    const known = new Set(currentRef.current.files.map(file => file.fingerprint).filter(Boolean));
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
          if (known.has(parsed.fingerprint)) throw new Error("Duplicate content; already imported or selected");
          known.add(parsed.fingerprint);
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
    setImportProgress(""); setImportMessages([]); setImportRevision(value => value + 1);
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
    <header className="app-header"><div><p className="eyebrow">PD-MS · v0.2.0</p><h1>PD-MS Plot Builder</h1></div><div className="header-stats"><span>{files.length} files</span><span>{numericIons.length} ions</span><span>{processing.rows.length} rows</span></div></header>
    <nav className="workspace-tabs" role="tablist" aria-label="Workspace">{workspaceTabs.map((tab, index) => <button key={tab.key} id={`tab-${tab.key}`} role="tab" type="button" aria-controls={`panel-${tab.key}`} tabIndex={activeWorkspaceTab === tab.key ? 0 : -1} aria-selected={activeWorkspaceTab === tab.key} className={`workspace-tab-button ${activeWorkspaceTab === tab.key ? "active" : ""}`} onClick={() => selectTab(tab.key)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % workspaceTabs.length : event.key === "ArrowLeft" ? (index + workspaceTabs.length - 1) % workspaceTabs.length : event.key === "Home" ? 0 : event.key === "End" ? workspaceTabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); selectTab(workspaceTabs[next].key); document.getElementById(`tab-${workspaceTabs[next].key}`)?.focus(); }
    }}>{tab.label}</button>)}</nav>
    <main className="app-main">
      <ProjectPanel projectName={projectName} status={projectStatus} dirty={session.dirty} backupStatus={session.backupStatus} canUndo={session.canUndo} canRedo={session.canRedo} onUndo={() => historyAction("undo")} onRedo={() => historyAction("redo")} onProjectNameChange={value => patch({projectName: value}, "name")} onSaveProject={saveProject} onLoadProject={loadProject} onNewProject={newProject} />
      <div className="workspace-tab-panel active-panel">
        {processing.busy && <div className="processing-status" role="status">Processing spectra in the background… <button type="button" onClick={processing.cancel}>Cancel processing</button></div>}
        {processing.error && <div className="validation-notice" role="alert">{processing.error} <button type="button" onClick={processing.retry}>Retry processing</button></div>}
        <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={activeWorkspaceTab !== "files"}>
          {files.length === 0 && <section className="workspace-section welcome-panel"><p className="section-kicker">Start your analysis</p><h2>From spectra to a publication figure</h2><p>Import spectra, review metadata, choose ions, then build and export your plot. TXT and Bruker exports stay in your browser; Thermo RAW uses the reader on this computer.</p><div className="welcome-actions"><button className="secondary-button" onClick={() => selectTab("bruker")}>Import Bruker exports</button><button className="secondary-button" onClick={() => selectTab("thermo")}>Import Thermo RAW</button><button className="secondary-button" disabled={!!importProgress} onClick={() => void loadExamples()}>Try sample data</button></div></section>}
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
        <div id="panel-thermo" role="tabpanel" aria-labelledby="tab-thermo" hidden={activeWorkspaceTab !== "thermo"}><ThermoImport key={importRevision} files={files} onImport={imported => {
          const nextIons = files.length === 0 ? [...new Set(imported.map(file => file.metadata.parentIon).filter(Boolean))].map(mz => ({id: createId("ion"), targetMz: mz, label: "precursor"})) : ions;
          patch({files: [...files, ...imported], selectedFileIds: imported.map(file => file.id), plotSelectedOnly: true, ions: nextIons, ionDraft: formatIonText(nextIons)}, "import");
          changePlot({...project.plotSettings, xAxis: "current", xTitle: "Current", xUnit: "mA", xValueScale: "raw", xValueMultiplier: 1, replicateMode: "sd", curveMode: "connect", xMin: "", xMax: "", yMin: "0", yMax: ""}); selectTab("ions");
          setProjectStatus("RAW files added. Review ions and metadata. Mean ± SD is enabled.");
        }} /></div>
        <div id="panel-bruker" role="tabpanel" aria-labelledby="tab-bruker" hidden={activeWorkspaceTab !== "bruker"}><BrukerImport key={importRevision} onImport={(imported, originPreset, axis) => {
          patch({files: [...files, ...imported], selectedFileIds: [...selectedIds, ...imported.map(file => file.id)]}, "import");
          if (originPreset) {
            const nextIons = [241, 255, 751, 311, 617, 375, 163, 271, 283].map(mass => ({id: createId("ion"), targetMz: String(mass), label: ""}));
            patch({ions: nextIons, ionDraft: formatIonText(nextIons), selectedFileIds: imported.map(file => file.id), plotSelectedOnly: true}, "import");
            changePlot({xAxis: "retentionTime", xTitle: "Time", xUnit: "min", xValueScale: "secondsToMinutes", xValueMultiplier: 1 / 60, yMode: "selectedSum", yTitle: "Relative intensity", yUnit: "%", yMin: "0", yMax: "100", xMin: "0", ...defaultPlotAppearance, curveMode: "movingAverage", movingAverageWindow: 5, lineShape: "linear", colorPalette: "trms", traceColors: {}}); selectTab("plot");
          } else if (axis === "wavelength") {
            patch({selectedFileIds: imported.map(file => file.id), plotSelectedOnly: true}, "import");
            changePlot({...project.plotSettings, xAxis: "wavelength", xTitle: "Wavelength", xUnit: "nm", xValueScale: "raw", xValueMultiplier: 1, xMin: "", xMax: ""}); selectTab("ions");
          } else if (!files.length) changePlot({xAxis: "retentionTime", xTitle: "Acquisition time", xUnit: "s"});
        }} /></div>
        <div id="panel-power" role="tabpanel" aria-labelledby="tab-power" hidden={activeWorkspaceTab !== "power"}><PowerCalibrationPanel key={importRevision} files={files} calibration={project.powerCalibration} onChange={powerCalibration => patch({powerCalibration})} onPlot={powerCalibration => {
          patch({powerCalibration, plotSettings: {...project.plotSettings, xAxis: "opticalPower", xTitle: "Optical power", xUnit: "mW", xValueScale: "raw", xValueMultiplier: 1, xMin: "", xMax: ""}});
          setPlotRevision(value => value + 1); selectTab("plot");
        }} /></div>
        <div id="panel-ions" role="tabpanel" aria-labelledby="tab-ions" hidden={activeWorkspaceTab !== "ions"}><WorkspacePanelBoundary name="Ions">{() => <IonSelectionPanel ions={ions} ionText={project.ionDraft ?? formatIonText(ions)} onIonTextChange={value => patch({ionDraft: value}, "ionDraft")} tolerance={tolerance} roundingPrecisions={[...new Set(files.flatMap(file => file.bruker?.mzDecimals === undefined ? [] : [file.bruker.mzDecimals]))]} canSuggestIons={files.some(file => file.peaks.length > 0)} onIonsChange={updateIons} onToleranceChange={value => patch({tolerance: value}, "tolerance")} onSuggestIons={decimals => {
          const suggestions = suggestIonTargets(selectedIds.size ? files.filter(file => selectedIds.has(file.id)) : files, tolerance, 6, decimals); if (suggestions.length) updateIons(suggestions);
        }} />}</WorkspacePanelBoundary></div>
        <div id="panel-plot" role="tabpanel" aria-labelledby="tab-plot" className="plot-panel-host" hidden={activeWorkspaceTab !== "plot"}>{plotVisited && <WorkspacePanelBoundary key={plotRevision} name="Plot">{() => <Suspense fallback={<p role="status">Loading plot tools…</p>}><PlotBuilder expanded={plotExpanded} onExpandedChange={setPlotExpanded} initialSettings={project.plotSettings ?? {legendPosition: "top"}} settingsRef={plotSettingsRef} onSettingsChange={onPlotSettingsChange} projectName={projectName} files={plottedFiles} tolerance={tolerance} rows={plottedRows} isActive={activeWorkspaceTab === "plot"} /></Suspense>}</WorkspacePanelBoundary>}</div>
        <div id="panel-data" role="tabpanel" aria-labelledby="tab-data" hidden={activeWorkspaceTab !== "data"}><SegmentSpectrumExport files={files} isActive={activeWorkspaceTab === "data"} /><ProcessedDataTable rows={processing.rows} projectName={projectName} /></div>
      </div>
    </main>
  </div>;
}
export default App;
