# PD-MS Plot Builder

React + TypeScript + Vite app for building ion intensity plots from multiple mass spectrometry `.txt` files.

## What it does

- Imports multiple `.txt` spectrum files.
- Ignores headers and reads numeric `m/z intensity` rows.
- Edits per-file metadata and applies bulk metadata to selected files.
- Extracts target ion intensities inside an `m/z` tolerance window.
- Uses the most intense peak when multiple peaks match.
- Builds absolute or relative intensity plots with Plotly.
- Exports processed data as CSV and the plot as PNG.

## Bruker exports

1. Open the run in DataAnalysis and run the lab export method. It must write
   `data.ascii` (ESI ms1 line spectra) and `Segments.txt` into the same `.d` folder.
2. Open **Bruker files** and choose that folder, or choose both export files together.
   Only these two exports are read, locally in the browser. Raw `.yep`/`.baf` files
   are not decoded. Import one run at a time.
3. Check the time units and segment preview, including any warnings, then add the
   segments to the project. The defaults are minutes for scans and seconds for
   segment boundaries. Select ions and use **Plot**. Acquisition time is the
   segment midpoint in seconds; **Segment** is also available as an x axis.
4. **Save project file** stores all aggregated spectra, segment provenance,
   metadata, ions, tolerance, selected-file filter and plot settings in JSON.
   Reopening that file requires neither the original folder nor reimporting.
   Older TXT projects remain supported. Save again after making changes.
5. **Export plot CSV / TXT** exports the input points for the current plot,
   including its x scaling and absolute/relative y values and selected-file filter.
   TXT is tab-delimited. Fitted curve samples and temporary legend hiding are not
   exported; these are the underlying measured points. The **Data** tab exports
   all processed rows, independent of the selected-file filter.

### Calculation and boundaries

The importer retains the exported m/z and intensity values for every assigned peak,
without rounding masses or merging them into integer bins. It uses JavaScript
64-bit numbers; it cannot restore precision already removed by the export method.
For each target, it averages all observed peak intensities within the selected
m/z tolerance, across the segment. Found m/z is the arithmetic mean of the matched
masses. Missing observations do not enter that mean as zeros. This is an
observed-peak mean, not a sum per scan or the vendor's averaged spectrum.
The extraction is recalculated from retained peaks when targets or tolerance change.
CSV/TXT and project JSON do not apply display rounding. Suggested targets default
to original precision. Acquisition times are never used as activation times.

Projects from the earlier nominal-mass importer still open with their original
calculation and show a reimport warning; their lost decimals cannot be reconstructed.

Unlike the Python script's fixed intervals, this importer uses `Segments.txt`.
Intervals are start-inclusive/end-exclusive, except the last endpoint is included.
Overlapping intervals and corrupt scans are rejected. Empty segments, count
mismatches, non-ESI-ms1 scans and scans in gaps or beyond boundaries are reported.
The lab's original export method truncates boundaries to integer seconds. Thus
some scans can fall outside its intervals; they are explicitly reported and
excluded, never silently assigned to a neighboring segment. Exporting precise
boundaries from DataAnalysis is preferable where available.

`scripts/Bruker_export_precise.vbs` contains replacement code for the script inside
a DataAnalysis method (not a standalone Windows script). It uses the original
chromatogram export calls and writes segment start/end values without `Int()`.
It overwrites `data.ascii` and `Segments.txt`, like the original method. Save a copy
of the original method before replacing its script. This variant has not been
executed inside DataAnalysis here. It preserves what the Bruker ASCII exporter
provides; it does not increase the exporter's own m/z precision.

### Verification

Run `node tests/bruker.mjs` for synthetic parser, boundary, unit, calculation,
project compatibility, plot and export checks. Optionally pass a local `.d` path
to validate its exports without copying experimental data into the repository.

## Data policy

Do not commit real experimental `.txt` files, unpublished research results, real plots, or real processed data. The repository ignores `.txt` files by default and only allows small fictitious files in `example-data/`.

## Local run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```
