// Plotly mutates its DOM asynchronously. Serialize updates and skip superseded
// jobs so tab changes/resizes cannot start concurrent renders on the same graph.
export function queuePlotTask(previous: Promise<void>, run: (isCurrent: () => boolean) => void | Promise<void>, onError: (error: unknown) => void) {
  let cancelled = false;
  const done = previous.catch(() => {}).then(async () => {
    if (cancelled) return;
    try {
      await run(() => !cancelled);
    } catch (error) {
      if (!cancelled) onError(error);
    }
  });
  return { done, cancel: () => { cancelled = true; } };
}
