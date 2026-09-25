export type Peak = {
  mz: number;
  intensity: number;
};

export type SpectrumMetadata = {
  compound: string;
  parentIon: string;
  condition: string;
  acqTime: string;
  activationTime: string;
  ledPower: string;
  wavelength: string;
  replicate: string;
  notes: string;
  retentionTime: string;
  segment: string;
};

export type MetadataField = keyof SpectrumMetadata;

export type SpectrumFile = {
  id: string;
  filename: string;
  metadata: SpectrumMetadata;
  peaks: Peak[];
  validLineCount: number;
  invalidLineCount: number;
  warnings: string[];
  bruker?: {
    source: string;
    segment: number;
    startSeconds: number;
    endSeconds: number;
    scanCount: number;
    method: "nominal-mz-observed-mean" | "exact-mz-window-observed-mean";
  };
};

export type IonTarget = {
  id: string;
  targetMz: string;
  label: string;
};

export type NumericIonTarget = {
  id: string;
  targetMz: number;
  label: string;
};

export type ProcessedRow = {
  id: string;
  fileId: string;
  ionId: string;
  filename: string;
  metadata: SpectrumMetadata;
  targetMz: number;
  foundMz: number | null;
  label: string;
  absoluteIntensity: number;
  relativeIntensity: number;
  warning: string;
};

export type XAxisKey =
  | "retentionTime"
  | "segment"
  | "acqTime"
  | "activationTime"
  | "ledPower"
  | "wavelength"
  | "replicate";

export type YMode = "absolute" | "relative";

export type LegendPosition = "right" | "top" | "bottom" | "inside";

export type ProjectSnapshot = {
  app: "PD-MS Plot Builder";
  version: 1;
  savedAt: string;
  projectName: string;
  files: SpectrumFile[];
  ions: IonTarget[];
  tolerance: number;
  selectedFileIds: string[];
  plotSelectedOnly?: boolean;
  plotSettings?: Record<string, unknown>;
};

export const metadataFields: Array<{
  key: MetadataField;
  label: string;
  placeholder?: string;
}> = [
  { key: "retentionTime", label: "Acquisition time (s)", placeholder: "Segment midpoint" },
  { key: "segment", label: "Segment" },
  { key: "compound", label: "Compound", placeholder: "riboflavin" },
  { key: "parentIon", label: "Parent ion", placeholder: "457" },
  { key: "condition", label: "Condition", placeholder: "LED on" },
  { key: "acqTime", label: "Act. Time (ms)", placeholder: "100 ms" },
  { key: "activationTime", label: "Activation time", placeholder: "20 ms" },
  { key: "ledPower", label: "LED power", placeholder: "max" },
  { key: "wavelength", label: "Wavelength", placeholder: "365 nm" },
  { key: "replicate", label: "Replicate", placeholder: "1" },
  { key: "notes", label: "Notes", placeholder: "optional" },
];

export const xAxisOptions: Array<{ key: XAxisKey; label: string }> = [
  { key: "retentionTime", label: "Acquisition time" },
  { key: "segment", label: "Segment" },
  { key: "acqTime", label: "Act. Time" },
  { key: "activationTime", label: "Activation time" },
  { key: "ledPower", label: "LED power" },
  { key: "wavelength", label: "Wavelength" },
  { key: "replicate", label: "Replicate" },
];

export const yModeOptions: Array<{ key: YMode; label: string }> = [
  { key: "absolute", label: "Absolute intensity" },
  { key: "relative", label: "Relative intensity (%)" },
];

export const emptyMetadata = (): SpectrumMetadata => ({
  retentionTime: "",
  segment: "",
  compound: "",
  parentIon: "",
  condition: "",
  acqTime: "",
  activationTime: "",
  ledPower: "",
  wavelength: "",
  replicate: "",
  notes: "",
});
