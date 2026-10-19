import { CheckSquare, Columns3, ScanSearch, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MetadataField, SpectrumFile, SpectrumMetadata } from "../types";
import { metadataFields } from "../types";
import { TableTools } from "./TableTools";

type MetadataTableProps = {
  files: SpectrumFile[];
  selectedIds: Set<string>;
  plotSelectedOnly: boolean;
  onToggleFile: (fileId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPlotSelectedOnlyChange: (enabled: boolean) => void;
  onInferFilenameMetadata: () => void;
  onUpdateMetadata: (
    fileId: string,
    field: MetadataField,
    value: string,
  ) => void;
  onApplyBulkMetadata: (field: MetadataField, value: string) => void;
  onRemoveSelected: () => void;
};

export function MetadataTable({
  files,
  selectedIds,
  plotSelectedOnly,
  onToggleFile,
  onToggleAll,
  onPlotSelectedOnlyChange,
  onInferFilenameMetadata,
  onUpdateMetadata,
  onApplyBulkMetadata,
  onRemoveSelected,
}: MetadataTableProps) {
  const [bulkField, setBulkField] = useState<MetadataField>("compound");
  const [bulkValue, setBulkValue] = useState("");
  const [showColumnControls, setShowColumnControls] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [warningOnly, setWarningOnly] = useState(false);
  const [sort, setSort] = useState("import");
  const [visibleFieldKeys, setVisibleFieldKeys] = useState<MetadataField[]>(
    ["compound", "condition", "replicate", ...(files.some(file => file.thermo) ? ["current", "voltage"] as MetadataField[] : files.some(file => file.bruker) ? ["retentionTime", "segment", "wavelength"] as MetadataField[] : ["acqTime"] as MetadataField[])],
  );
  const matchingFiles = useMemo(() => {
    const term = query.toLocaleLowerCase();
    const filtered = files.filter(file => (!warningOnly || file.warnings.length > 0) && [file.filename, ...Object.values(file.metadata)].some(value => value.toLocaleLowerCase().includes(term)));
    return sort === "name" ? filtered.sort((a, b) => a.filename.localeCompare(b.filename, undefined, {numeric: true})) : filtered;
  }, [files, query, warningOnly, sort]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(matchingFiles.length / 50) - 1));

  const selectedCount = selectedIds.size;
  const allSelected = files.length > 0 && files.every((file) => selectedIds.has(file.id));
  const visibleMetadataFields = metadataFields.filter((field) =>
    visibleFieldKeys.includes(field.key),
  );

  const fileStats = useMemo(
    () => ({
      total: files.length,
      valid: files.filter((file) => file.validLineCount > 0).length,
      warnings: files.filter((file) => file.warnings.length > 0).length,
    }),
    [files],
  );

  const applyBulk = () => {
    onApplyBulkMetadata(bulkField, bulkValue);
  };

  const toggleColumn = (field: MetadataField, visible: boolean) => {
    setVisibleFieldKeys((currentFields) =>
      visible
        ? [...currentFields, field]
        : currentFields.filter((currentField) => currentField !== field),
    );
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Files</p>
          <h2>Metadata table</h2>
        </div>
        <div className="summary-strip" aria-label="File summary">
          <span>{fileStats.total} files</span>
          <span>{fileStats.valid} parsed</span>
          <span>{fileStats.warnings} warnings</span>
        </div>
      </div>

      <div className="bulk-toolbar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onToggleAll(event.target.checked)}
            disabled={files.length === 0}
          />
          <span>Select all</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={plotSelectedOnly}
            onChange={(event) => onPlotSelectedOnlyChange(event.target.checked)}
            disabled={files.length === 0}
          />
          <span>Plot selected only</span>
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={onInferFilenameMetadata}
          disabled={files.length === 0}
        >
          <ScanSearch size={16} aria-hidden="true" />
          <span>Auto-fill from names</span>
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowColumnControls((currentValue) => !currentValue)}
        >
          <Columns3 size={16} aria-hidden="true" />
          <span>Columns</span>
        </button>

        <select
          value={bulkField}
          onChange={(event) => setBulkField(event.target.value as MetadataField)}
          disabled={selectedCount === 0}
          aria-label="Bulk metadata field"
        >
          {metadataFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>

        <input
          value={bulkValue}
          onChange={(event) => setBulkValue(event.target.value)}
          placeholder="Value"
          disabled={selectedCount === 0}
          aria-label="Bulk metadata value"
        />

        <button
          type="button"
          className="secondary-button"
          onClick={applyBulk}
          disabled={selectedCount === 0}
        >
          <CheckSquare size={16} aria-hidden="true" />
          <span>Apply to selected</span>
        </button>

        <button
          type="button"
          className="icon-button danger"
          onClick={onRemoveSelected}
          disabled={selectedCount === 0}
          title="Remove selected files"
          aria-label="Remove selected files"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {showColumnControls ? (
        <div className="column-controls">
          {metadataFields.map((field) => (
            <label key={field.key} className="checkbox-label">
              <input
                type="checkbox"
                checked={visibleFieldKeys.includes(field.key)}
                onChange={(event) => toggleColumn(field.key, event.target.checked)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      <TableTools query={query} onQuery={setQuery} count={matchingFiles.length} page={safePage} onPage={setPage}>
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="import">Import order</option><option value="name">Filename</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={warningOnly} onChange={event => {setWarningOnly(event.target.checked); setPage(0);}} />Warnings only</label>
      </TableTools>
      <p className="help-text">{selectedCount} files selected across the project. Bulk edits and removal apply to all selected files, including other pages. Use Undo to restore changes.</p>
      <div className="table-shell">
        <table className="data-table metadata-table">
          <thead>
            <tr>
              <th className="select-column"></th>
              <th>Filename</th>
              {visibleMetadataFields.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {matchingFiles.length === 0 ? (
              <tr>
                <td colSpan={visibleMetadataFields.length + 3} className="empty-cell">
                  No matching files
                </td>
              </tr>
            ) : (
              matchingFiles.slice(safePage * 50, (safePage + 1) * 50).map((file) => (
                <tr key={file.id}>
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onChange={(event) =>
                        onToggleFile(file.id, event.target.checked)
                      }
                      aria-label={`Select ${file.filename}`}
                    />
                  </td>
                  <td className="filename-cell">
                    <span className="filename-truncate" title={file.filename}>
                      {file.filename}
                    </span>
                  </td>
                  {visibleMetadataFields.map((field) => (
                    <td key={field.key}>
                      <input
                        value={file.metadata[field.key as keyof SpectrumMetadata]}
                        onChange={(event) =>
                          onUpdateMetadata(file.id, field.key, event.target.value)
                        }
                        placeholder={field.placeholder}
                        aria-label={`${field.label} for ${file.filename}`}
                      />
                    </td>
                  ))}
                  <td>
                    {file.warnings.length > 0 ? (
                      <span className="status-pill warning">
                        {file.warnings.join("; ")}
                      </span>
                    ) : (
                      <span className="status-pill ok">
                        {file.validLineCount} peaks
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
