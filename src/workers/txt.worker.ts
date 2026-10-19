import { parseSpectrumTxt } from "../utils/parser";
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const buffer = await event.data.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    const fingerprint = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
    self.postMessage({...parseSpectrumTxt(new TextDecoder().decode(buffer)), fingerprint});
  } catch (error) { self.postMessage({error: error instanceof Error ? error.message : "Could not read file"}); }
};
