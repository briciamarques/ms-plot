import { FolderOpen, Save } from "lucide-react";
import type { ChangeEvent } from "react";

type ProjectPanelProps = {
  projectName: string;
  status: string;
  dirty: boolean;
  backupStatus: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onProjectNameChange: (projectName: string) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
};

export function ProjectPanel({
  projectName,
  status,
  onProjectNameChange,
  onSaveProject,
  onLoadProject,
  dirty, backupStatus, canUndo, canRedo, onUndo, onRedo,
}: ProjectPanelProps) {
  const handleProjectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const projectFile = event.target.files?.[0];
    if (projectFile) {
      onLoadProject(projectFile);
      event.target.value = "";
    }
  };

  return (
    <section className="workspace-section project-panel" aria-label="Project">
      <div className="project-actions">
        <label>
          <span>Project name</span>
          <input
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            placeholder="riboflavin-led-series"
          />
        </label>

        <button type="button" className="secondary-button" onClick={onSaveProject}>
          <Save size={16} aria-hidden="true" />
          <span>Save project file</span>
        </button>

        <label className="secondary-button import-project-button">
          <FolderOpen size={16} aria-hidden="true" />
          <span>Open project file</span>
          <input
            type="file"
            accept=".json,.pdmsplot.json,application/json"
            onChange={handleProjectFile}
          />
        </label>
        <button type="button" className="secondary-button" disabled={!canUndo} onClick={onUndo}>Undo</button>
        <button type="button" className="secondary-button" disabled={!canRedo} onClick={onRedo}>Redo</button>
      </div>
      <div className="project-status" role="status"><span className={dirty ? "unsaved" : ""}>{dirty ? "Changes since last project download" : "Project download up to date"}</span><span>{backupStatus}</span>{status && <span>{status}</span>}</div>
    </section>
  );
}
