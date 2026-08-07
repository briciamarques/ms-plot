import { useMemo, useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { IonSelectionPanel } from "./components/IonSelectionPanel";
import { MetadataTable } from "./components/MetadataTable";
import { PlotBuilder } from "./components/PlotBuilder";
import { ProjectPanel } from "./components/ProjectPanel";
import { ProcessedDataTable } from "./components/ProcessedDataTable";
import type {
  IonTarget,
  MetadataField,
  NumericIonTarget,
  SpectrumFile,
} from "./types";
import { emptyMetadata } from "./types";
import { createId } from "./utils/id";
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

type WorkspaceTab = "setup" | "metadata" | "plot" | "data";

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "setup", label: "Files & ions" },
  { key: "metadata", label: "Metadata" },
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
  const [files, setFiles] = useState<SpectrumFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ions, setIons] = useState<IonTarget[]>(initialIons);
  const [tolerance, setTolerance] = useState(0.5);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [plotSelectedOnly, setPlotSelectedOnly] = useState(false);
  const [projectName, setProjectName] = useState("pd-ms-project");
  const [projectStatus, setProjectStatus] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTab>("setup");

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
      setIons(suggestedIons);
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

      setProjectName(snapshot.projectName);
      setFiles(snapshot.files);
      setIons(snapshot.ions);
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
    <div className="app-shell">
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
        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "setup"}
        >
          <ProjectPanel
            projectName={projectName}
            status={projectStatus}
            onProjectNameChange={setProjectName}
            onSaveProject={saveProject}
            onLoadProject={loadProject}
          />
          <FileUpload
            onFilesSelected={handleFilesSelected}
            isLoading={isLoadingFiles}
          />
          <IonSelectionPanel
            ions={ions}
            tolerance={tolerance}
            canSuggestIons={files.some((file) => file.peaks.length > 0)}
            onIonsChange={setIons}
            onToleranceChange={setTolerance}
            onSuggestIons={suggestIonsFromSpectra}
          />
        </div>

        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "metadata"}
        >
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

        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "plot"}
        >
          <PlotBuilder
            rows={plottedRows}
            isActive={activeWorkspaceTab === "plot"}
          />
        </div>

        <div
          className="workspace-tab-panel"
          hidden={activeWorkspaceTab !== "data"}
        >
          <ProcessedDataTable rows={processedRows} />
        </div>
      </main>
    </div>
  );
}

export default App;
