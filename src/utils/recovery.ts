import type { ProjectSnapshot } from "../types";
import { validateProjectSnapshot } from "./project";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pdms-recovery-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Recovery storage is blocked by another tab."));
  });
}

export async function readRecovery(): Promise<{project: ProjectSnapshot; downloaded: boolean} | null> {
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("projects").objectStore("projects").get("latest");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!value) return null;
    if (typeof value === "object" && "project" in value) {
      const stored = value as {project: unknown; downloaded?: boolean};
      return {project: validateProjectSnapshot(stored.project), downloaded: stored.downloaded === true};
    }
    return {project: validateProjectSnapshot(value), downloaded: false};
  } finally { db.close(); }
}

export async function writeRecovery(snapshot: ProjectSnapshot, downloaded = false): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({project: snapshot, downloaded}, "latest");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Recovery write aborted"));
    });
  } finally { db.close(); }
}
