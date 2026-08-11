import { Download } from "lucide-react";
import type { ProcessedRow } from "../types";
import { downloadTextFile, processedRowsToCsv } from "../utils/csv";
import { formatIntensity, formatMz, formatPercent } from "../utils/format";

type ProcessedDataTableProps = {
  rows: ProcessedRow[];
};

export function ProcessedDataTable({ rows }: ProcessedDataTableProps) {
  const exportCsv = () => {
    downloadTextFile(
      "pd-ms-processed-data.csv",
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
          <span>Export CSV</span>
        </button>
      </div>

      <div className="table-shell processed-table-shell">
        <table className="data-table processed-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Compound</th>
              <th>Parent ion</th>
              <th>Condition</th>
              <th>Act. Time (ms)</th>
              <th>Activation time</th>
              <th>LED power</th>
              <th>Wavelength</th>
              <th>Replicate</th>
              <th>Target m/z</th>
              <th>Found m/z</th>
              <th>Label</th>
              <th>Absolute intensity</th>
              <th>Relative intensity</th>
              <th>Warning</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="empty-cell">
                  No processed rows
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="filename-cell">
                    <span className="filename-truncate" title={row.filename}>
                      {row.filename}
                    </span>
                  </td>
                  <td>{row.metadata.compound}</td>
                  <td>{row.metadata.parentIon}</td>
                  <td>{row.metadata.condition}</td>
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
                  <td>
                    {row.warning ? (
                      <span className="status-pill warning">{row.warning}</span>
                    ) : (
                      ""
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
