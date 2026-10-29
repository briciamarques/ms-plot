import * as fflate from "fflate";
import { unpackExchange, packExchange, sha256 as hash } from "./catalogExchangeCore";
import type { ExchangePackage } from "./analysis-exchange";

export const sha256 = (bytes: Uint8Array): Promise<string> => hash(bytes);
export function encodeBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export const decodeBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function readExchange(bytes: Uint8Array) {
  const decoded = await unpackExchange(bytes, fflate);
  return {manifest: decoded.manifest as ExchangePackage, entries: decoded.files as Record<string, Uint8Array>, manifestText: new TextDecoder("utf-8", {fatal: true}).decode(decoded.manifestBytes)};
}
export const writeExchange = (manifest: ExchangePackage, entries: Record<string, Uint8Array>): Promise<Uint8Array> => packExchange(manifest, entries, fflate);
