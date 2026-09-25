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

Plot normalization is explicit in the y-axis menu:

- **Absolute intensity**: the extracted values, without normalization.
- **Share of selected ions per segment (%)**: `100 * I / sum(I)` within each
  file/segment, using all targets in the Ions panel. Nonzero segments sum to 100%.
  An all-zero segment is represented by zeros. Changing the ion list changes this
  denominator; hiding a legend trace does not. Use distinct, non-overlapping ion
  windows when interpreting this as a composition.
- **Each ion's own maximum = 100%**: the existing normalization across plotted
  files, retained for compatibility with saved projects. It compares temporal
  profiles and does not represent the abundance of one ion relative to another.

CSV/TXT includes both normalization columns and exports the selected y mode as
the plot y value. Choose **s to min** under x value scale to convert acquisition
seconds into minutes. This changes x values and the unit label, without changing
the stored acquisition times. Neither mode establishes equivalence to a published
figure without confirming that figure's extraction and normalization method.

The importer retains the exported m/z and intensity values for every assigned peak.
The default extraction does not round masses. It uses JavaScript
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

By default, this importer uses `Segments.txt`.
Intervals are start-inclusive/end-exclusive, except the last endpoint is included.
Overlapping intervals and corrupt scans are rejected. Empty segments, count
mismatches, non-ESI-ms1 scans and scans in gaps or beyond boundaries are reported.
The lab's original export method truncates boundaries to integer seconds. Thus
some scans can fall outside its intervals; they are explicitly reported and
excluded, never silently assigned to a neighboring segment. Exporting precise
boundaries from DataAnalysis is preferable where available.

### Optional approximation and Origin preset

In **Bruker files**, choose original precision or 0–6 decimal places for m/z.
Rounded extraction groups both peaks and targets into the same rounded-mass bin,
ignoring target tolerance, and averages observed peak intensities in that bin.
Intensities are never rounded; raw peak decimals remain in the saved project.
Exact half-way mass ties round to the even bin. Do not enter multiple targets
that round to the same bin: each selected target contributes to the denominator.

Time segmentation can use exported boundaries (midpoint time) or fixed intervals
starting at zero (start time). Fixed intervals include all valid ESI ms1 scans,
including a partial last interval, matching the old Python workflow. Changing
segmentation after import requires reimporting the exports.

**Use Riboflavin Origin preset** applies the procedure verified against the supplied
Origin project: integer masses, 30-second intervals, nine ions (241, 255, 751, 311,
617, 375, 163, 271, 283), percentage of their sum at each interval, minutes on x,
and a centered five-point moving average. It replaces the ion list and plot
settings when adding the import, and selects only that run for plotting. The
283 ion belongs in the normalization denominator even when its curve is hidden.
This is a sample-specific preset, not a universal published-figure convention.

Under **Plot → Style → Curve**, moving average is selectable with an odd window
of 3–31 points. At endpoints, the window shrinks symmetrically (5 points becomes
1, 3, 5, …, 5, 3, 1). Dots show unsmoothed measurements; lines show the average.
Each imported run is smoothed separately, after normalization, in x order.
This is a point-count window rather than a fixed duration. It is not a kinetic fit.
Plot CSV/TXT includes measured y and a separate smoothed y column with the method.
Projects preserve extraction options, normalization, smoothing, colors and axes.

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
An optional second argument accepts a locally extracted Origin worksheet JSON
for point-by-point comparison of the 279 normalized and 248 smoothed values.

## Default appearance and legend

New plots use the example's Arial appearance (28 px axis titles, 24 px ticks and
legend, 2.5 px lines, 7 px markers, 1000 × 800 output). The default legend sits
inside the top of the axes. Under **Plot → Style → Legend**,
choose automatic columns or a maximum of 1–6 columns, plus top, bottom, right or
manual inside placement. Inside columns form a compact block: choose **2** and
use **Legend horizontal position** and **Legend vertical position** to move it.
**Reset legend to top** restores the default placement while retaining the column
choice. Columns adapt to available width. Projects and saved
styles retain these choices. Existing projects retain their saved appearance;
**Style → Presets → Use default Arial style** applies the new appearance without
changing extraction, normalization or smoothing.

Enable **Highlight one m/z on click** in the same Legend panel to keep a selected
ion's color and gray all other ions. Click its legend entry or a plotted point;
click it again, use **Restore all colors**, or disable the option to reset.
Measured points and fitted/smoothed lines highlight together and are drawn above
all gray traces, keeping the legend order stable. The selected ion
and enabled mode are saved in projects; values, normalization and CSV/TXT data
are unchanged. With the option disabled, the normal hide/show legend behavior
remains available. The handlers use [Plotly's click events](https://plotly.com/javascript/plotlyjs-events/).

## Export a segment's mass spectrum

Under **Data → Segment spectrum**, select a Bruker segment by source and time
interval, then **Copy m/z + intensity** or **Download segment TXT**. Both produce
the same headerless, tab-separated two-column list, sorted by m/z, ready to paste
into a mass-spectrum plotter. All available masses are included, independently
of target-ion selection or time-plot normalization and smoothing. Saved projects
retain the required peaks, so reopening the original `.d` folder is unnecessary.

The export initially uses the segment's mass precision. Choose original m/z or
0–6 decimals without altering imported data. Each mass bin uses the mean of its
observed peak intensities, matching the rounded-mass time-series calculation;
missing observations are not zero-filled. With original m/z, only identical
masses are grouped, so scan-to-scan mass drift remains separate. This is not a
mass-alignment algorithm or a reconstruction of DataAnalysis's average spectrum.
Intensity values use full stored numeric precision and absolute units. Older
projects containing only averaged integer peaks require reimport for finer m/z.

## Axis limits

Blank numeric limits fit the plotted points and fitted/smoothed curves with 2%
padding on each automatic side. Nonnegative data does not acquire negative space
below zero. Typed limits are exact, including zero; with only one limit entered,
only the opposite endpoint is automatic. Autoscale follows the same bounds, and
double-click resets to them. **Clear range** restores the compact automatic fit.
Equal or reversed manual limits show a validation message instead of silently
moving the minimum. Categorical axes retain their usual spacing.
Open `/tests/browser/axis-range.html` in Vite to check the real Plotly behavior.

## Navigation and recovery

Ion-list edits remain a draft until **Load ion list** is clicked. A pending-change
message distinguishes that draft from the plotted targets. Draft text survives
tab changes and is included in saved projects. Plot updates are serialized and
cancel obsolete work when leaving the tab; graph cleanup waits for rendering.
Stable trace IDs use CSS-safe characters because Plotly uses them in selectors
when updating or removing traces. Plot and Ions errors are contained within their
panels, with a retry action, so the project data and save controls remain available.
For the real Plotly cleanup regression, open `/tests/browser/plot-cleanup.html`
in the Vite dev server. It reproduces the old selector failure, then verifies
that removing ions and purging the graph succeed with the corrected identifiers.

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
