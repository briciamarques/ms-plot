import type { Peak } from "../types";

export type ParseSpectrumResult = {
  peaks: Peak[];
  validLineCount: number;
  invalidLineCount: number;
  warnings: string[];
};

const isNumericToken = (token: string): boolean => {
  if (token.trim() === "") {
    return false;
  }

  return Number.isFinite(Number(token));
};

export const parseSpectrumTxt = (content: string): ParseSpectrumResult => {
  const peaks: Peak[] = [];
  let invalidLineCount = 0;

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    const tokens = line.split(/\s+/);
    const looksLikeData =
      tokens.length === 2 && isNumericToken(tokens[0]) && isNumericToken(tokens[1]);

    if (!looksLikeData) {
      if (tokens.some(isNumericToken)) {
        invalidLineCount += 1;
      }
      return;
    }

    const mz = Number(tokens[0]);
    const intensity = Number(tokens[1]);

    if (Number.isFinite(mz) && Number.isFinite(intensity)) {
      peaks.push({ mz, intensity });
    } else {
      invalidLineCount += 1;
    }
  });

  const warnings =
    peaks.length === 0 ? ["No valid numeric m/z intensity rows found."] : [];

  return {
    peaks,
    validLineCount: peaks.length,
    invalidLineCount,
    warnings,
  };
};
