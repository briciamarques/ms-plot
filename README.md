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
