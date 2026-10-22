import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ProjectSnapshot } from "../types";
import { readRecovery, writeRecovery } from "../utils/recovery";

type History = { current: ProjectSnapshot; past: ProjectSnapshot[]; future: ProjectSnapshot[]; key: string; time: number };
type Action = { type: "patch"; patch: Partial<ProjectSnapshot>; key: string; time: number } | { type: "restore" | "hydrate"; project: ProjectSnapshot } | { type: "undo" | "redo" };
export function projectReducer(state: History, action: Action): History {
  if (action.type === "hydrate") return {current: action.project, past: [], future: [], key: "", time: 0};
  if (action.type === "undo") return state.past.length ? {current: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.current, ...state.future], key: "", time: 0} : state;
  if (action.type === "redo") return state.future.length ? {current: state.future[0], past: [...state.past, state.current], future: state.future.slice(1), key: "", time: 0} : state;
  if (action.type === "restore") return {...state, current: action.project, past: [...state.past, state.current].slice(-30), future: [], key: "", time: 0};
  if (action.type !== "patch" || Object.entries(action.patch).every(([key, value]) => state.current[key as keyof ProjectSnapshot] === value)) return state;
  const coalesce = action.key !== "" && action.key === state.key && action.time - state.time < 800;
  return { current: {...state.current, ...action.patch}, past: coalesce ? state.past : [...state.past, state.current].slice(-30), future: [], key: action.key, time: action.time };
}

export function useProjectSession(initial: ProjectSnapshot, prepareProject: (project: ProjectSnapshot) => ProjectSnapshot = project => project) {
  const prepareRef = useRef(prepareProject);
  prepareRef.current = prepareProject;
  const [history, dispatch] = useReducer(projectReducer, {current: initial, past: [], future: [], key: "", time: 0});
  const [ready, setReady] = useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [backupStatus, setBackupStatus] = useState("Checking recovery…");
  const [saved, setSaved] = useState<ProjectSnapshot>(initial);
  const currentRef = useRef(history.current);
  currentRef.current = history.current;
  const writeQueue = useRef(Promise.resolve());
  const dirty = history.current !== saved;
  useEffect(() => {
    let active = true;
    void readRecovery().then(recovered => {
      if (!active) return;
      if (recovered) { const project = prepareRef.current(recovered.project); dispatch({type: "hydrate", project}); if (recovered.downloaded && project === recovered.project) setSaved(project); setBackupStatus("Previous session recovered locally"); }
      else setBackupStatus("Local recovery ready");
    }).catch(() => { if (active) {setRecoveryEnabled(false); setBackupStatus("Local recovery unavailable. Download your project regularly.");} })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || !recoveryEnabled) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setBackupStatus("Saving recovery copy…");
      writeQueue.current = writeQueue.current.catch(() => {}).then(() => writeRecovery({...history.current, savedAt: new Date().toISOString()}, !dirty))
        .then(() => { if (active) setBackupStatus("Recovery copy saved on this browser"); })
        .catch(() => { if (active) setBackupStatus("Recovery failed. Download your project to keep your work."); });
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [history.current, ready, recoveryEnabled, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = useCallback((patch: Partial<ProjectSnapshot>, key = "") => dispatch({type: "patch", patch, key, time: Date.now()}), []);
  return { project: history.current, currentRef, ready, dirty, backupStatus, patch,
    restore: (project: ProjectSnapshot) => dispatch({type: "restore", project: prepareRef.current(project)}),
    undo: () => dispatch({type: "undo"}), redo: () => dispatch({type: "redo"}),
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    markSaved: () => setSaved(history.current),
  };
}
