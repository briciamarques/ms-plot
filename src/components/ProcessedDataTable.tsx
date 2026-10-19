import { Download } from "lucide-react";
import type { ProcessedRow } from "../types";
import { downloadTextFile, processedRowsToCsv } from "../utils/csv";
import { formatIntensity, formatMz, formatPercent } from "../utils/format";
import { useMemo, useState } from "react";
import { TableTools } from "./TableTools";
import { safeProjectFilename } from "../utils/project";

type ProcessedDataTableProps = {
  rows: ProcessedRow[];
  projectName: string;
};

export function ProcessedDataTable({ rows, projectName }: ProcessedDataTableProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [warningOnly, setWarningOnly] = useState(false);
  const matchingRows = useMemo(() => rows.filter(row => (!warningOnly || row.warning) && [row.filename, row.label, String(row.targetMz), ...Object.values(row.metadata)].some(value => value.toLowerCase().includes(query.toLowerCase()))), [rows, query, warningOnly]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(matchingRows.length / 50) - 1));
  const basename = safeProjectFilename(projectName).replace(".pdmsplot.json", "-all-data");
  const exportCsv = () => {
    downloadTextFile(
      `${basename}.csv`,
      processedRowsToCsv(rows),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Output</p>
          <h2>Processed Data</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          <Download size={16} aria-hidden="true" />
          <span>All data CSV</span>
        </button>
        <button type="button" className="secondary-button" disabled={!rows.length}
          onClick={() => downloadTextFile(`${basename}.txt`, processedRowsToCsv(rows, "\t"), "text/plain;charset=utf-8")}>
          All data TXT
        </button>
      </div>

      <p className="help-text">Exports include every processed file and ion, including references. Search and pagination only change this table. For plotted values and replicate means, export from Plot.</p>
      <TableTools query={query} onQuery={setQuery} count={matchingRows.length} page={safePage} onPage={setPage}><label className="checkbox-label"><input type="checkbox" checked={warningOnly} onChange={event => {setWarningOnly(event.target.checked); setPage(0);}} />Warnings only</label></TableTools>
      <div className="table-shell processed-table-shell">
        <table className="data-table processed-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Compound</th>
              <th>Parent ion</th>
              <th>Condition</th>
              <th>Current (mA)</th><th>Voltage (V)</th>
              <th>Act. Time (ms)</th>
              <th>Activation time</th>
              <th>LED power</th>
              <th>Wavelength</th>
              <th>Replicate</th>
              <th>Target m/z</th>
              <th>Found m/z</th>
              <th>Label</th>
              <th>Absolute intensity</th>
              <th>Own maximum (%)</th>
              <th>Share of selected ions (%)</th>
              <th>Warning</th>
              <th>Acquisition time (s)</th>
              <th>Segment</th>
            </tr>
          </thead>
          <tbody>
            {matchingRows.length === 0 ? (
              <tr>
                <td colSpan={20} className="empty-cell">
                  No matching processed rows
                </td>
              </tr>
            ) : (
              matchingRows.slice(safePage * 50, (safePage + 1) * 50).map((row) => (
                <tr key={row.id}>
                  <td className="filename-cell">
                    <span className="filename-truncate" title={row.filename}>
                      {row.filename}
                    </span>
                  </td>
                  <td>{row.metadata.compound}</td>
                  <td>{row.metadata.parentIon}</td>
                  <td>{row.metadata.condition}</td>
                  <td>{row.metadata.current}</td><td>{row.metadata.voltage}</td>
                  <td>{row.metadata.acqTime}</td>
                  <td>{row.metadata.activationTime}</td>
                  <td>{row.metadata.ledPower}</td>
                  <td>{row.metadata.wavelength}</td>
                  <td>{row.metadata.replicate}</td>
                  <td>{formatMz(row.targetMz)}</td>
                  <td>{formatMz(row.foundMz)}</td>
                  <td>{row.label}</td>
                  <td>{formatIntensity(row.absoluteIntensity)}</td>
                  <td>{formatPercent(row.relativeIntensity)}%</td>
                  <td>{formatPercent(row.selectedIonPercent)}%</td>
                  <td>
                    {row.warning ? (
                      <span className="status-pill warning">{row.warning}</span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{row.metadata.retentionTime}</td>
                  <td>{row.metadata.segment}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
