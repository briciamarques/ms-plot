import { BrukerImport } from "./components/BrukerImport";
import { useMemo, useState, useRef } from "react";
import { FileUpload } from "./components/FileUpload";
import { IonSelectionPanel, formatIonText } from "./components/IonSelectionPanel";
import { WorkspacePanelBoundary } from "./components/WorkspacePanelBoundary";
import { MetadataTable } from "./components/MetadataTable";
import { PlotBuilder } from "./components/PlotBuilder";
import { ProjectPanel } from "./components/ProjectPanel";
import { ProcessedDataTable } from "./components/ProcessedDataTable";
import { SegmentSpectrumExport } from "./components/SegmentSpectrumExport";
import type {
  IonTarget,
  MetadataField,
  NumericIonTarget,
  SpectrumFile,
} from "./types";
import { emptyMetadata } from "./types";
import { createId } from "./utils/id";
import { defaultPlotAppearance } from "./utils/plot";
import { parseSpectrumTxt } from "./utils/parser";
import { processSpectra } from "./utils/processing";
import {
  createProjectSnapshot,
  parseProjectSnapshot,
  safeProjectFilename,
} from "./utils/project";
import { downloadTextFile } from "./utils/csv";
import {
  fillBlankMetadataFromFilename,
  inferMetadataFromFilename,
} from "./utils/filenameMetadata";
import { suggestIonTargets } from "./utils/ionSuggestions";

type WorkspaceTab = "files" | "bruker" | "ions" | "plot" | "data";

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "files", label: "Files & metadata" },
  { key: "bruker", label: "Bruker files" },
  { key: "ions", label: "Ions" },
  { key: "plot", label: "Plot" },
  { key: "data", label: "Data" },
];

const initialIons: IonTarget[] = [
  { id: createId("ion"), targetMz: "751", label: "parent ion" },
  { id: createId("ion"), targetMz: "659", label: "fragment 1" },
  { id: createId("ion"), targetMz: "617", label: "fragment 2" },
  { id: createId("ion"), targetMz: "375", label: "" },
  { id: createId("ion"), targetMz: "283", label: "" },
  { id: createId("ion"), targetMz: "255", label: "" },
  { id: createId("ion"), targetMz: "241", label: "main fragment" },
];

const readFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

function App() {
  const plotSettingsRef = useRef<Record<string, unknown>>({});
  const [plotInitial, setPlotInitial] = useState<Record<string, unknown>>({});
  const [plotRevision, setPlotRevision] = useState(0);
  const [files, setFiles] = useState<SpectrumFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ions, setIons] = useState<IonTarget[]>(initialIons);
  const [ionDraft, setIonDraft] = useState(() => formatIonText(initialIons));
  const updateIons = (next: IonTarget[]) => {
    setIons(next);
    setIonDraft(formatIonText(next));
  };
  const [tolerance, setTolerance] = useState(0.5);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [plotSelectedOnly, setPlotSelectedOnly] = useState(false);
  const [projectName, setProjectName] = useState("pd-ms-project");
  const [projectStatus, setProjectStatus] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTab>("files");

  const numericIons = useMemo<NumericIonTarget[]>(
    () =>
      ions
        .map((ion) => ({
          id: ion.id,
          targetMz: Number(ion.targetMz),
          label: ion.label.trim(),
        }))
        .filter((ion) => Number.isFinite(ion.targetMz)),
    [ions],
  );

  const processedRows = useMemo(
    () => processSpectra(files, numericIons, tolerance),
    [files, numericIons, tolerance],
  );

  const plottedFiles = useMemo(
    () =>
      plotSelectedOnly
        ? files.filter((file) => selectedIds.has(file.id))
        : files,
    [files, plotSelectedOnly, selectedIds],
  );

  const plottedRows = useMemo(
    () => processSpectra(plottedFiles, numericIons, tolerance),
    [plottedFiles, numericIons, tolerance],
  );

  const handleFilesSelected = async (fileList: FileList) => {
    setIsLoadingFiles(true);

    try {
      const txtFiles = Array.from(fileList).filter((file) =>
        file.name.toLowerCase().endsWith(".txt"),
      );

      const loadedFiles = await Promise.all(
        txtFiles.map(async (file) => {
          const content = await readFile(file);
          const parsed = parseSpectrumTxt(content);

          return {
            id: createId("file"),
            filename: file.name,
            metadata: {
              ...emptyMetadata(),
              ...inferMetadataFromFilename(file.name),
            },
            peaks: parsed.peaks,
            validLineCount: parsed.validLineCount,
            invalidLineCount: parsed.invalidLineCount,
            warnings: parsed.warnings,
          };
        }),
      );

      setFiles((currentFiles) => [...currentFiles, ...loadedFiles]);
      setSelectedIds((currentIds) => {
        const nextIds = new Set(currentIds);
        loadedFiles.forEach((file) => nextIds.add(file.id));
        return nextIds;
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const updateMetadata = (
    fileId: string,
    field: MetadataField,
    value: string,
  ) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              metadata: {
                ...file.metadata,
                [field]: value,
              },
            }
          : file,
      ),
    );
  };

  const applyBulkMetadata = (field: MetadataField, value: string) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        selectedIds.has(file.id)
          ? {
              ...file,
              metadata: {
                ...file.metadata,
                [field]: value,
              },
            }
          : file,
      ),
    );
  };

  const toggleFile = (fileId: string, checked: boolean) => {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (checked) {
        nextIds.add(fileId);
      } else {
        nextIds.delete(fileId);
      }
      return nextIds;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(files.map((file) => file.id)) : new Set());
  };

  const removeSelected = () => {
    setFiles((currentFiles) =>
      currentFiles.filter((file) => !selectedIds.has(file.id)),
    );
    setSelectedIds(new Set());
  };

  const inferFilenameMetadata = () => {
    setFiles((currentFiles) =>
      currentFiles.map((file) => {
        const shouldInfer =
          selectedIds.size === 0 || selectedIds.has(file.id);

        return shouldInfer
          ? {
              ...file,
              metadata: fillBlankMetadataFromFilename(
                file.metadata,
                file.filename,
              ),
            }
          : file;
      }),
    );
  };

  const suggestIonsFromSpectra = (decimalPlaces: number) => {
    const sourceFiles =
      selectedIds.size > 0
        ? files.filter((file) => selectedIds.has(file.id))
        : files;
    const suggestedIons = suggestIonTargets(
      sourceFiles,
      tolerance,
      6,
      decimalPlaces,
    );

    if (suggestedIons.length > 0) {
      updateIons(suggestedIons);
    }
  };

  const saveProject = () => {
    const snapshot = createProjectSnapshot(
      projectName,
      files,
      ions,
      tolerance,
      Array.from(selectedIds),
    );
    snapshot.plotSelectedOnly = plotSelectedOnly;
    snapshot.plotSettings = plotSettingsRef.current;
    snapshot.ionDraft = ionDraft;

    downloadTextFile(
      safeProjectFilename(projectName),
      JSON.stringify(snapshot, null, 2),
      "application/json;charset=utf-8",
    );
    setProjectStatus("Project file saved");
  };

  const loadProject = async (file: File) => {
    try {
      const content = await readFile(file);
      const snapshot = parseProjectSnapshot(content);
      const restoredSelectedIds = new Set(
        snapshot.selectedFileIds.filter((fileId) =>
          snapshot.files.some((spectrumFile) => spectrumFile.id === fileId),
        ),
      );

      setPlotSelectedOnly(snapshot.plotSelectedOnly ?? false);
      setPlotInitial(snapshot.plotSettings ?? {});
      setPlotRevision(value => value + 1);
      setProjectName(snapshot.projectName);
      setFiles(snapshot.files);
      setIons(snapshot.ions);
      setIonDraft(snapshot.ionDraft ?? formatIonText(snapshot.ions));
      setTolerance(snapshot.tolerance);
      setSelectedIds(restoredSelectedIds);
      setProjectStatus("Project file opened");
    } catch (error) {
      setProjectStatus(
        error instanceof Error ? error.message : "Could not open project file",
      );
    }
  };

  return (
    <div
      className={
        activeWorkspaceTab === "plot"
          ? "app-shell plot-view-active"
          : "app-shell"
      }
    >
      <header className="app-header">
        <div>
          <p className="eyebrow">PD-MS</p>
          <h1>PD-MS Plot Builder</h1>
        </div>
        <div className="header-stats">
          <span>{files.length} files</span>
          <span>{numericIons.length} ions</span>
          <span>{processedRows.length} rows</span>
        </div>
      </header>

      <nav className="workspace-tabs" role="tablist" aria-label="Workspace">
        {workspaceTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeWorkspaceTab === tab.key}
            className={
              activeWorkspaceTab === tab.key
                ? "workspace-tab-button active"
                : "workspace-tab-button"
            }
            onClick={() => setActiveWorkspaceTab(tab.key)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
          <ProjectPanel
            projectName={projectName}
            status={projectStatus}
            onProjectNameChange={setProjectName}
            onSaveProject={saveProject}
            onLoadProject={loadProject}
          />

        <div className="workspace-tab-panel" hidden={activeWorkspaceTab !== "bruker"}>
          <BrukerImport onImport={(imported, originPreset, axis) => {
            setFiles(current => [...current, ...imported]);
            setSelectedIds(current => new Set([...current, ...imported.map(file => file.id)]));
            if (originPreset) {
              const masses = [241, 255, 751, 311, 617, 375, 163, 271, 283];
              const presetIons = masses.map(mass => ({ id: createId("ion"), targetMz: String(mass), label: "" }));
              updateIons(presetIons);
              setSelectedIds(new Set(imported.map(file => file.id)));
              setPlotSelectedOnly(true);
              setPlotInitial({ xAxis: "retentionTime", xTitle: "Time", xUnit: "min", xValueScale: "secondsToMinutes", xValueMultiplier: 1 / 60,
                yMode: "selectedSum", yTitle: "Relative intensity", yUnit: "%", yMin: "0", yMax: "100", xMin: "0",
                ...defaultPlotAppearance, curveMode: "movingAverage", movingAverageWindow: 5, lineShape: "linear",
                colorPalette: "trms", traceColors: {} });
              setPlotRevision(value => value + 1);
              setActiveWorkspaceTab("plot");
            } else if (axis === "wavelength") {
              setSelectedIds(new Set(imported.map(file => file.id)));
              setPlotSelectedOnly(true);
              setPlotInitial({ ...plotSettingsRef.current, xAxis: "wavelength", xTitle: "Wavelength", xUnit: "nm",
                xValueScale: "raw", xValueMultiplier: 1, xMin: "", xMax: "" });
              setPlotRevision(value => value + 1);
              setActiveWorkspaceTab("ions");
              setProjectStatus("Wavelength segments added. Choose the ions for this sample and click Load ion list. Plot uses wavelength in nm; save the project to keep the assignments.");
            } else if (files.length === 0) {
              setPlotInitial({ xAxis: "retentionTime", xTitle: "Acquisition time", xUnit: "s" });
              setPlotRevision(value => value + 1);
            }
          }} />
        </div>
        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "files"}
        >
          <FileUpload
            onFilesSelected={handleFilesSelected}
            isLoading={isLoadingFiles}
          />
          <MetadataTable
            files={files}
            selectedIds={selectedIds}
            plotSelectedOnly={plotSelectedOnly}
            onToggleFile={toggleFile}
            onToggleAll={toggleAll}
            onPlotSelectedOnlyChange={setPlotSelectedOnly}
            onInferFilenameMetadata={inferFilenameMetadata}
            onUpdateMetadata={updateMetadata}
            onApplyBulkMetadata={applyBulkMetadata}
            onRemoveSelected={removeSelected}
          />
        </div>

        <div className="workspace-tab-panel" hidden={activeWorkspaceTab !== "ions"}>
          <WorkspacePanelBoundary name="Ions">{() =>
          <IonSelectionPanel
            ions={ions}
            ionText={ionDraft}
            onIonTextChange={setIonDraft}
            tolerance={tolerance}
            canSuggestIons={files.some((file) => file.peaks.length > 0)}
            onIonsChange={updateIons}
            onToleranceChange={setTolerance}
            onSuggestIons={suggestIonsFromSpectra}
          />
          }</WorkspacePanelBoundary>
        </div>

        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "plot"}
        >
          <WorkspacePanelBoundary key={plotRevision} name="Plot">{retried => <PlotBuilder
            key={plotRevision}
            initialSettings={retried ? plotSettingsRef.current : plotInitial}
            settingsRef={plotSettingsRef}
            rows={plottedRows}
            isActive={activeWorkspaceTab === "plot"}
          />}</WorkspacePanelBoundary>
        </div>

        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "data"}
        >
          <SegmentSpectrumExport files={files} isActive={activeWorkspaceTab === "data"} />
          <ProcessedDataTable rows={processedRows} />
        </div>
      </main>
    </div>
  );
}

export default App;
