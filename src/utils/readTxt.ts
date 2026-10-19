import type { ParseSpectrumResult } from "./parser";
export function readTxt(file: File, signal: AbortSignal): Promise<ParseSpectrumResult & {fingerprint: string}> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/txt.worker.ts", import.meta.url), {type: "module"});
    const finish = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = () => { finish(); reject(new DOMException("Import cancelled", "AbortError")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, {once: true});
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data); };
    worker.onerror = () => { finish(); reject(new Error("Could not parse file")); };
    worker.postMessage(file);
  });
}
