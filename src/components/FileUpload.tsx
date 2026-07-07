import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";

type FileUploadProps = {
  onFilesSelected: (files: FileList) => void;
  isLoading: boolean;
};

export function FileUpload({ onFilesSelected, isLoading }: FileUploadProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onFilesSelected(event.target.files);
      event.target.value = "";
    }
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Input</p>
          <h2>Upload files</h2>
        </div>
        <label className="primary-file-button">
          <Upload size={18} aria-hidden="true" />
          <span>{isLoading ? "Reading files" : "Choose TXT files"}</span>
          <input
            type="file"
            accept=".txt,text/plain"
            multiple
            onChange={handleChange}
            disabled={isLoading}
          />
        </label>
      </div>
    </section>
  );
}
