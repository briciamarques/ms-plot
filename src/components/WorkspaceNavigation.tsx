import { useEffect, useRef, useState } from "react";

export type WorkspaceTab = "files" | "ions" | "plot" | "data";
const tabs: {key: WorkspaceTab; label: string}[] = [
  {key: "files", label: "1 · Files & metadata"},
  {key: "ions", label: "2 · Ions"}, {key: "plot", label: "3 · Plot"}, {key: "data", label: "4 · Data"},
];

export function WorkspaceNavigation({activeTab, onSelect, fileCount, ionCount, rowCount}: {
  activeTab: WorkspaceTab; onSelect: (tab: WorkspaceTab) => void;
  fileCount: number; ionCount: number; rowCount: number;
}) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div className="workspace-navigation" ref={headerRef}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); setOpen(false); toggleRef.current?.focus();
      }
    }}>
    <button ref={toggleRef} type="button" className="workspace-nav-toggle" aria-expanded={open} aria-controls="workspace-navigation-menu"
      onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">☰</span><span>{tabs.find(tab => tab.key === activeTab)?.label}</span><span aria-hidden="true">▾</span>
    </button>
    <div id="workspace-navigation-menu" className="workspace-nav-menu" hidden={!open}>
      <nav className="workspace-nav-tabs" role="tablist" aria-label="Workspace" aria-orientation="vertical">
        {tabs.map((tab, index) => <button key={tab.key} id={`tab-${tab.key}`} role="tab" type="button"
          aria-controls={`panel-${tab.key}`} aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1}
          className={`workspace-nav-tab ${activeTab === tab.key ? "active" : ""}`}
          onClick={() => { onSelect(tab.key); setOpen(false); toggleRef.current?.focus(); }}
          onKeyDown={event => {
            const next = event.key === "ArrowDown" ? (index + 1) % tabs.length : event.key === "ArrowUp" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); onSelect(tabs[next].key); document.getElementById(`tab-${tabs[next].key}`)?.focus(); }
          }}>{tab.label}</button>)}
      </nav>
      <p className="workspace-nav-counts">{fileCount} files · {ionCount} ions · {rowCount} rows</p>
    </div>
  </div>;
}
