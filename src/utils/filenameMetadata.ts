import type { SpectrumMetadata } from "../types";

const stripKnownExtensions = (filename: string): string =>
  filename.replace(/(\.(txt|raw|csv|dat|asc))+$/i, "");

const normalizeNumber = (value: string): string => value.replace(/p/gi, ".");

const compactName = (filename: string): string =>
  stripKnownExtensions(filename).replace(/[.\s-]+/g, "_");

const cleanToken = (value: string): string =>
  value.replace(/[^a-z0-9]+$/gi, "").replace(/^[^a-z0-9]+/gi, "");

const formatTime = (value: string, unit: string): string =>
  `${normalizeNumber(value)} ${unit.toLowerCase()}`;

const firstToken = (filename: string): string => {
  const [token = ""] = stripKnownExtensions(filename).split(/[_\s-]+/);
  return cleanToken(token);
};

export const inferMetadataFromFilename = (
  filename: string,
): Partial<SpectrumMetadata> => {
  const baseName = stripKnownExtensions(filename);
  const compact = compactName(filename);
  const inferred: Partial<SpectrumMetadata> = {};
  const compound = firstToken(filename);

  if (compound) {
    inferred.compound = compound;
  }

  const parentIonMatch = compact.match(
    /(?:^|_)(?:isolated|parent|precursor|parention|parent_ion|mz|m_z)_?(\d+(?:[p.]\d+)?)(?:_|$)/i,
  );
  if (parentIonMatch) {
    inferred.parentIon = normalizeNumber(parentIonMatch[1]);
  }

  const ledMatch = compact.match(/(?:^|_)LED_?(ON|OFF)(?:_|$)/i);
  if (ledMatch) {
    inferred.condition = `LED ${ledMatch[1].toUpperCase()}`;
  }

  const acqMatch = compact.match(
    /(?:^|_)ACQ(?:_?TIME)?_?(\d+(?:[p.]\d+)?)(ms|s|min)(?:_|$)/i,
  );
  const activationMatch = compact.match(
    /(?:^|_)ACTIVATION(?:_?TIME)?_?(\d+(?:[p.]\d+)?)(ms|s|min)(?:_|$)/i,
  );
  const timeMatches = Array.from(
    baseName.matchAll(/(\d+(?:[p.]\d+)?)\s*(ms|s|min)\b/gi),
  );

  if (acqMatch) {
    inferred.acqTime = formatTime(acqMatch[1], acqMatch[2]);
  } else if (timeMatches.length > 0) {
    const lastTime = timeMatches[timeMatches.length - 1];
    inferred.acqTime = formatTime(lastTime[1], lastTime[2]);
  }

  if (activationMatch) {
    inferred.activationTime = formatTime(activationMatch[1], activationMatch[2]);
  }

  const wavelengthMatch = baseName.match(/(\d+(?:[p.]\d+)?)\s*nm\b/i);
  if (wavelengthMatch) {
    inferred.wavelength = `${normalizeNumber(wavelengthMatch[1])} nm`;
  }

  const replicateMatch = compact.match(
    /(?:^|_)(?:rep|replicate)_?(\d+)(?:_|$)/i,
  );
  if (replicateMatch) {
    inferred.replicate = replicateMatch[1];
  }

  return inferred;
};

export const fillBlankMetadataFromFilename = (
  metadata: SpectrumMetadata,
  filename: string,
): SpectrumMetadata => {
  const inferred = inferMetadataFromFilename(filename);

  return {
    ...metadata,
    ...Object.fromEntries(
      Object.entries(inferred).filter(([key]) => {
        const metadataKey = key as keyof SpectrumMetadata;
        return metadata[metadataKey].trim() === "";
      }),
    ),
  };
};
