/** Frozen MS Catalog exchange v1. Runtime validation is in catalogExchangeCore.ts.
 * Normative semantics and storage mapping: ANALYSIS-EXCHANGE.md.
 * UUID/ISO/SHA aliases require runtime validation, not just TypeScript checking.
 */
export type UUID = string;
export type ISODateTime = string;
export type SHA256 = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Editor = 'ms-plot' | 'ms-generator';
export type App = 'ms-catalog' | Editor;
export type Extensions = Record<string, Json>;

export interface RecordSnapshot {
  id: UUID;
  revision: number;
  name: string;
  /** Relevant data/provenance only: strip credentials and local/Storage paths. */
  metadata: Record<string, Json>;
}
export interface RawReference {
  name: string | null;
  sha256: SHA256 | null;
  size: number | null;
}
export interface Review {
  /** Catalog/import must authenticate actual saving user, not trust this string. */
  reviewer: string;
  at: ISODateTime;
  reason: string;
}
export interface Input {
  inputId: UUID; // equal to spectrum.id in v1
  spectrum: RecordSnapshot;
  experiment: RecordSnapshot;
  molecule: RecordSnapshot;
  txtFileId: UUID;
  storedTxt: { sha256: SHA256; size: number; mime: 'text/plain' };
  columns: ['mz', 'intensity'];
  rawSource: RawReference | null;
  processing: {
    origin: 'catalog' | 'xcalibur-confirmed' | 'imported' | 'unknown';
    recipe: Record<string, Json> | null;
    evidence: string;
  };
  intensity: {
    state: 'original' | 'base-peak-relative' | 'normalized-other' | 'unknown';
    unit: string | null;
    normalizationAppliedOnImport: string | null;
    priorNormalization: string | null;
    scale: number | null;
    evidence: string;
  };
  scanStatistics: {
    kind: 'variability-between-scans';
    /** Preserve stored definitions and per-scan values, never full spectra. */
    values: Json[];
  } | null;
  replication: {
    status: 'unreviewed' | 'reviewed';
    experimentalUnit: string | null;
    replicateGroupId: UUID | null;
    review: Review | null;
  };
  assignments: RecordSnapshot[];
  extensions: Extensions;
}
export interface FileDescriptor {
  id: UUID;
  path: string; // archive-relative, forward slashes, no traversal or remote URLs
  name: string;
  role: 'input-txt' | 'figure' | 'table' | 'project';
  mime: string;
  size: number;
  sha256: SHA256;
}
export interface Envelope {
  format: 'ms-analysis-exchange';
  schemaVersion: '1.0.0';
  packageId: UUID;
  createdAt: ISODateTime;
  producer: { app: App; version: string };
  catalog: {
    instanceId: 'supabase:olylsohalgphhxbthyzp';
    study: RecordSnapshot;
  };
  requiredFeatures: string[];
  inputs: Input[];
  files: FileDescriptor[];
  extensions: Extensions;
}
export interface SelectionPackage extends Envelope {
  kind: 'selection';
  producer: { app: 'ms-catalog'; version: string };
  selection: {
    intendedEditor: Editor;
    /** Preserves the user-selected display order; no implicit OFF/ON pairing. */
    orderedInputIds: UUID[];
    reviewedAt: ISODateTime;
    notes: string;
  };
}
export interface Transformation {
  id: UUID;
  order: number;
  scope: 'calculation' | 'display';
  inputIds: UUID[];
  method: string;
  methodVersion: string;
  parameters: Record<string, Json>;
}
export interface ResultSeries {
  seriesId: UUID;
  label: string;
  inputIds: UUID[];
  transformationIds: UUID[];
}
export interface TableDescription {
  fileId: UUID;
  delimiter: ',';
  encoding: 'utf-8';
  header: true;
  missingValue: string;
  formulaSafety: string;
  columns: Array<{
    name: string;
    type: 'number' | 'text' | 'boolean';
    unit: string | null;
    description: string;
  }>;
  /** IDs/JSON ID arrays in CSV columns; per-row traceability is mandatory. */
  lineageColumns: { seriesId: string; inputIds: string };
}
export interface Photodepletion {
  pairs: Array<{
    pairId: UUID;
    offInputId: UUID;
    onInputId: UUID;
    status: 'accepted' | 'rejected' | 'unreviewed';
    review: Review | null;
  }>;
  formula: string;
  extraction: { method: string; window: Json; unit: string | null };
  independentAxis: { name: string; unit: string | null };
  invalidSignalPolicy: string;
  experimentalUnit: string | null;
  comparability: {
    status: 'unreviewed' | 'accepted' | 'not-comparable';
    review: Review | null;
    limitations: string[];
  };
}
export interface AnalysisResult {
  resultId: UUID;
  versionId: UUID;
  previousVersionId: UUID | null;
  derivedFrom: { resultId: UUID; versionId: UUID } | null;
  title: string;
  analysisType: 'spectrum-figure' | 'spectrum-comparison' | 'photodepletion' | 'other';
  editor: { app: Editor; version: string };
  status: 'reviewed' | 'exploratory-unvalidated';
  usedInputIds: UUID[];
  method: { id: string; version: string; definition: string; parameters: Record<string, Json> };
  transformations: Transformation[];
  series: ResultSeries[];
  photodepletion: Photodepletion | null;
  artifacts: {
    /** At least one PNG in v1. SVG optional only once catalog supports it. */
    figureFileIds: UUID[];
    tables: TableDescription[];
    project: {
      fileId: UUID;
      editor: Editor;
      formatId: string; // actual editor-native format, agreed by that editor
      formatVersion: string;
      datasetBindings: Array<{ datasetId: string; inputIds: UUID[] }>;
    };
  };
  limitations: string[];
  extensions: Extensions;
}
export interface ResultPackage extends Envelope {
  kind: 'result';
  producer: { app: Editor; version: string };
  selectionReceipt: {
    packageId: UUID; // immutable selection-receipt attachment ID
    manifestSha256: SHA256; // exact selection manifest bytes, not reserialized JSON
  };
  result: AnalysisResult;
}
export type ExchangePackage = SelectionPackage | ResultPackage;
