import { FolderOpen, Save } from "lucide-react";
import type { ChangeEvent } from "react";

type ProjectPanelProps = {
  projectName: string;
  status: string;
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
}: ProjectPanelProps) {
  const handleProjectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const projectFile = event.target.files?.[0];
    if (projectFile) {
      onLoadProject(projectFile);
      event.target.value = "";
    }
  };

  return (
    <section className="workspace-section project-panel">
      <div className="section-header">
        <div>
          <p className="section-kicker">Project</p>
          <h2>Save and reopen</h2>
        </div>
        {status ? <span className="inline-status">{status}</span> : null}
      </div>

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
      </div>
    </section>
  );
}
