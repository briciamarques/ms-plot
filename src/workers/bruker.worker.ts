import { brukerChannels, parseBrukerExport } from "../utils/bruker";
self.onmessage = event => {
  const {data, scan, segment, settings} = event.data;
  try {
    const channels = brukerChannels(data.ascii);
    try { self.postMessage({channels, preview: parseBrukerExport(data.ascii, data.segments, data.source, scan, segment, settings)}); }
    catch (error) { self.postMessage({channels, error: error instanceof Error ? error.message : "Could not read exports"}); }
  } catch (error) { self.postMessage({error: error instanceof Error ? error.message : "Could not read exports"}); }
};
