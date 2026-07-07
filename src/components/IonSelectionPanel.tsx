import { ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { IonTarget } from "../types";
import { createId } from "../utils/id";

type IonSelectionPanelProps = {
  ions: IonTarget[];
  tolerance: number;
  canSuggestIons: boolean;
  onIonsChange: (ions: IonTarget[]) => void;
  onToleranceChange: (tolerance: number) => void;
  onSuggestIons: (decimalPlaces: number) => void;
};

const defaultIonText =
  "751 = parent ion\n659 = fragment 1\n617 = fragment 2\n375\n283\n255\n241 = main fragment";

const parseIonText = (value: string): IonTarget[] => {
  const entries = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries
    .map((entry) => {
      const [mzPart, ...labelParts] = entry.split("=");
      const targetMz = mzPart.trim();
      const label = labelParts.join("=").trim();

      return {
        id: createId("ion"),
        targetMz,
        label,
      };
    })
    .filter((ion) => ion.targetMz !== "");
};

const formatIonText = (ions: IonTarget[]): string =>
  ions
    .map((ion) =>
      ion.label.trim()
        ? `${ion.targetMz} = ${ion.label.trim()}`
        : ion.targetMz,
    )
    .join("\n");

export function IonSelectionPanel({
  ions,
  tolerance,
  canSuggestIons,
  onIonsChange,
  onToleranceChange,
  onSuggestIons,
}: IonSelectionPanelProps) {
  const [ionText, setIonText] = useState(formatIonText(ions) || defaultIonText);
  const [suggestionDecimalPlaces, setSuggestionDecimalPlaces] = useState(0);

  useEffect(() => {
    setIonText(formatIonText(ions));
  }, [ions]);

  const updateIon = (ionId: string, patch: Partial<IonTarget>) => {
    onIonsChange(
      ions.map((ion) => (ion.id === ionId ? { ...ion, ...patch } : ion)),
    );
  };

  const addIon = () => {
    onIonsChange([...ions, { id: createId("ion"), targetMz: "", label: "" }]);
  };

  const removeIon = (ionId: string) => {
    onIonsChange(ions.filter((ion) => ion.id !== ionId));
  };

  const importList = () => {
    const parsedIons = parseIonText(ionText);
    if (parsedIons.length > 0) {
      onIonsChange(parsedIons);
    }
  };

  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <p className="section-kicker">Targets</p>
          <h2>Ion selection</h2>
        </div>
        <label className="compact-field">
          <span>m/z tolerance (+/-)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tolerance}
            onChange={(event) => onToleranceChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="ion-grid">
        <div className="ion-list-loader">
          <textarea
            value={ionText}
            onChange={(event) => setIonText(event.target.value)}
            rows={8}
            aria-label="Ion list"
          />
          <button type="button" className="secondary-button" onClick={importList}>
            <ListPlus size={16} aria-hidden="true" />
            <span>Load ion list</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onSuggestIons(suggestionDecimalPlaces)}
            disabled={!canSuggestIons}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>Suggest from spectra</span>
          </button>
          <label className="compact-field">
            <span>Suggested m/z decimals</span>
            <select
              value={suggestionDecimalPlaces}
              onChange={(event) =>
                setSuggestionDecimalPlaces(Number(event.target.value))
              }
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
        </div>

        <div className="table-shell ion-table-shell">
          <table className="data-table ion-table">
            <thead>
              <tr>
                <th>Target m/z</th>
                <th>Label</th>
                <th className="action-column"></th>
              </tr>
            </thead>
            <tbody>
              {ions.map((ion) => (
                <tr key={ion.id}>
                  <td>
                    <input
                      value={ion.targetMz}
                      onChange={(event) =>
                        updateIon(ion.id, { targetMz: event.target.value })
                      }
                      placeholder="751"
                      aria-label="Target m/z"
                    />
                  </td>
                  <td>
                    <input
                      value={ion.label}
                      onChange={(event) =>
                        updateIon(ion.id, { label: event.target.value })
                      }
                      placeholder="parent ion"
                      aria-label="Ion label"
                    />
                  </td>
                  <td className="action-column">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => removeIon(ion.id)}
                      title="Remove ion"
                      aria-label="Remove ion"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="secondary-button add-row" onClick={addIon}>
            <Plus size={16} aria-hidden="true" />
            <span>Add ion</span>
          </button>
        </div>
      </div>
    </section>
  );
}
