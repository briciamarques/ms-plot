import { FilePlus2, FolderOpen, Save } from "lucide-react";
import { useState, type ChangeEvent } from "react";

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
  onNewProject: () => void;
};

export function ProjectPanel({
  projectName,
  status,
  onProjectNameChange,
  onSaveProject,
  onLoadProject,
  onNewProject,
  dirty, backupStatus, canUndo, canRedo, onUndo, onRedo,
}: ProjectPanelProps) {
  const [showNewProject, setShowNewProject] = useState(false);
  const startNew = (download: boolean) => {
    if (download) onSaveProject();
    onNewProject();
    setShowNewProject(false);
  };
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

        <button type="button" className="secondary-button" aria-expanded={showNewProject} aria-controls="new-project-options" onClick={() => setShowNewProject(value => !value)}>
          <FilePlus2 size={16} aria-hidden="true" />
          <span>New project</span>
        </button>

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
      {showNewProject && <div id="new-project-options" className="new-project-options" lang="pt-BR" role="region" aria-label="Criar novo projeto">
        <p><strong>Começar um novo trabalho?</strong> O novo projeto começa sem arquivos, íons ou ajustes de gráfico. Seus presets salvos continuam disponíveis.</p>
        <p>Baixe o projeto atual para guardá-lo. Você pode usar Undo para voltar enquanto esta página estiver aberta; ao recarregar, a recuperação automática abrirá o novo trabalho.</p>
        <div className="control-button-row">
          <button type="button" className="primary-button" onClick={() => startNew(true)}>Baixar atual e criar novo</button>
          <button type="button" className="secondary-button" onClick={() => startNew(false)}>Criar novo sem baixar</button>
          <button type="button" className="secondary-button" onClick={() => setShowNewProject(false)}>Cancelar</button>
        </div>
      </div>}
      <div className="project-status" role="status"><span className={dirty ? "unsaved" : ""}>{dirty ? "Changes since last project download" : "Project download up to date"}</span><span>{backupStatus}</span>{status && <span>{status}</span>}</div>
    </section>
  );
}
