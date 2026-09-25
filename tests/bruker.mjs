import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the pure processing modules with the installed compiler, without extra dependencies.
const output = path.resolve('node_modules/.tmp/bruker-tests');
for (const name of ['types', 'utils/id', 'utils/filenameMetadata', 'utils/bruker', 'utils/project', 'utils/processing', 'utils/csv', 'utils/plot', 'utils/format']) {
  const result = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
  }).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.mjs"');
  const target = path.join(output, `${name}.mjs`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result);
}
const load = name => import(pathToFileURL(path.join(output, `utils/${name}.mjs`)));
const { parseBrukerExport, findBrukerFiles } = await load('bruker');
const { createProjectSnapshot, parseProjectSnapshot } = await load('project');
const { processSpectra, extractBrukerIntensity } = await load('processing');
const { plotRowsToCsv, processedRowsToCsv } = await load('csv');
const { buildPlotData } = await load('plot');
const { formatMz, formatIntensity } = await load('format');
assert.equal(formatMz(100.1234567), '100.1234567');
assert.equal(formatIntensity(12.3456789), '12.3456789');
const scan = (time, pairs, mode = 'ms1') => `${time},-,ESI,${mode},-,line,50-800,${pairs.length},${pairs.join(',')}`;
const ascii = [scan(0, ['100.4 10', '100.2 30']), scan(0.25, ['100.3 50']), scan(0.5, ['100.3 80']), scan(1, ['100.3 100'])].join('\n');
const result = parseBrukerExport(ascii, '4\n1 0 30\n2 30 60', 'Synthetic.d');
assert.deepEqual(result.files.map(f => f.bruker.scanCount), [2, 2]);
assert.deepEqual(result.files[0].peaks, [{mz:100.4,intensity:10},{mz:100.2,intensity:30},{mz:100.3,intensity:50}]);
assert.deepEqual(result.files.map(f => f.metadata.retentionTime), ['15', '45']);
assert.equal(result.warnings.length, 0);
const precise = parseBrukerExport(scan(0.25, ['100.1234567 12.3456789', '100.1234999 23.4567891']), '1\n1 0.0123456 30.9876543', 'precise');
assert.equal(precise.files[0].peaks[0].mz, 100.1234567);
assert.equal(precise.files[0].peaks[0].intensity, 12.3456789);
assert.equal(precise.files[0].bruker.startSeconds, 0.0123456);
assert.equal(precise.files[0].bruker.endSeconds, 30.9876543);
assert.equal(extractBrukerIntensity(precise.files[0].peaks, 100.1234567, 0.000001).intensity, 12.3456789);
assert.equal(extractBrukerIntensity(precise.files[0].peaks, 100.1234567, 0.001).intensity, (12.3456789 + 23.4567891) / 2);
assert.equal(extractBrukerIntensity(precise.files[0].peaks, 100.1234567, 0).foundMz, 100.1234567);
const preciseRows = processSpectra(precise.files, [{id:'p',targetMz:100.1234567,label:'precise'}], 0.000001);
assert.match(processedRowsToCsv(preciseRows), /100\.1234567/);
assert.match(processedRowsToCsv(preciseRows), /12\.3456789/);
assert.deepEqual(parseProjectSnapshot(JSON.stringify(createProjectSnapshot('precision', precise.files, [], 0.000001, []))).files, precise.files);
assert.throws(() => parseBrukerExport(ascii, '4\n1 0 35\n2 30 60', 'bad'), /non-overlapping/);
assert.throws(() => parseBrukerExport(ascii.replace('100.4 10', 'bad'), '4\n1 0 60', 'bad'), /Invalid m\/z/);
assert.throws(() => parseBrukerExport(ascii.replace(',2,', ',3,'), '4\n1 0 60', 'bad'), /count mismatch/);
assert.throws(() => parseBrukerExport(ascii.replaceAll(',line,', ',profile,'), '4\n1 0 60', 'bad'), /line spectra/);
const gaps = parseBrukerExport(ascii, '5\n1 0 10\n2 30 50\n3 70 80', 'gap');
assert.equal(gaps.assignedScans, 2);
assert.equal(gaps.files[2].peaks.length, 0);
assert.equal(gaps.warnings.length, 3);
const seconds = parseBrukerExport([scan(0, ['100 2']), scan(30, ['100 4'])].join('\n'), '2\n1 0 1', 'seconds', 's', 'min');
assert.equal(extractBrukerIntensity(seconds.files[0].peaks, 100, 0).intensity, 3);
const mockFile = (name, parent='run.d') => ({ name, webkitRelativePath: `${parent}/${name}` });
assert.equal(findBrukerFiles([mockFile('data.ascii'), mockFile('Segments.txt'), mockFile('Analysis.yep')]).source, 'run.d');
assert.throws(() => findBrukerFiles([mockFile('data.ascii')]), /exactly one/);
assert.throws(() => findBrukerFiles([mockFile('data.ascii'), mockFile('Segments.txt', 'other.d')]), /same folder/);
const ions = [{ id: 'ion', targetMz: '100', label: 'test' }];
const project = createProjectSnapshot('synthetic', result.files, ions, 0.5, [result.files[0].id]);
project.plotSettings = { xAxis: 'retentionTime', yMode: 'relative', xValueMultiplier: 2, xTitle: 'Acquisition time', xUnit: 's', title: 'Synthetic saved project' };
project.plotSelectedOnly = true;
const reopened = parseProjectSnapshot(JSON.stringify(project));
assert.deepEqual(reopened, project);
fs.writeFileSync(path.join(output, 'synthetic.pdmsplot.json'), JSON.stringify(project));
const old = JSON.parse(JSON.stringify(project)); delete old.files[0].metadata.retentionTime;
assert.equal(parseProjectSnapshot(JSON.stringify(old)).files[0].metadata.retentionTime, '');
const legacy = JSON.parse(JSON.stringify(project));
legacy.files[0].bruker.method = 'nominal-mz-observed-mean';
legacy.files[0].peaks = [{mz:100,intensity:30}];
const legacyFile = parseProjectSnapshot(JSON.stringify(legacy)).files[0];
assert.match(legacyFile.warnings.join(' '), /Reimport/);
assert.equal(processSpectra([legacyFile], [{id:'legacy',targetMz:100,label:''}], 0.5)[0].absoluteIntensity, 30);
const rows = processSpectra(reopened.files, [{ ...ions[0], targetMz: 100 }], 0.5);
const csv = plotRowsToCsv(rows.slice(0,1), 'retentionTime', 'relative', 2, 'Acquisition time (scaled s)');
assert.match(csv, /Acquisition time \(scaled s\),30,Relative intensity \(%\),33\.333/);
const txt = plotRowsToCsv(rows, 'retentionTime', 'absolute', 1, undefined, '\t');
assert.match(txt, /Acquisition time\t15\tAbsolute intensity\t30/);
assert.match(processedRowsToCsv(rows), /acquisition time midpoint \(s\),segment,notes/);
assert.equal(buildPlotData(rows, 'retentionTime', 'absolute', true, { colors: {}, lineWidth: 2, markerSize: 5, lineShape: 'linear', curveMode: 'connect', polynomialDegree: 3 })[0].x[0], 15);
console.log('PASS: boundaries, units, decimal preservation and tolerance-based averaging, gaps, corrupt input, file discovery, project round trip, legacy projects and CSV/TXT exports.');

// Optional local validation: never copy real spectra into this repository.
if (process.argv[2]) {
  const folder = process.argv[2];
  const real = parseBrukerExport(fs.readFileSync(path.join(folder, 'data.ascii'), 'utf8'), fs.readFileSync(path.join(folder, 'Segments.txt'), 'utf8'), 'Local sample.d');
  assert.ok(real.assignedScans > 0);
  assert.equal(real.files.reduce((sum, f) => sum + f.bruker.scanCount, 0), real.assignedScans);
  const roundTrip = parseProjectSnapshot(JSON.stringify(createProjectSnapshot('local validation', real.files, ions, 0.5, [])));
  assert.deepEqual(roundTrip.files, real.files);
  console.log(JSON.stringify({ segments: real.files.length, scans: real.totalScans, assigned: real.assignedScans, warnings: real.warnings }, null, 2));
}
