import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output = path.resolve('node_modules/.tmp/workspace-tests');
for (const name of ['types','utils/id','utils/powerCalibration','utils/project','utils/recovery','utils/ions','utils/parser','hooks/useProjectSession','utils/plot','utils/thermoScans','utils/processing','utils/bruker','utils/colorPalettes','utils/format','utils/filenameMetadata']) {
  const code = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020}}).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.mjs"');
  const target = path.join(output, `${name}.mjs`); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, code);
}
const load = name => import(pathToFileURL(path.join(output, `${name}.mjs`)));
const {numericTargets, ionWarnings} = await load('utils/ions');
const {createProjectSnapshot, createEmptyProject, parseProjectSnapshot} = await load('utils/project');
const {parseSpectrumTxt} = await load('utils/parser');
const {projectReducer} = await load('hooks/useProjectSession');
const {emptyMetadata} = await load('types');
const ions = ['', ' ', '0', '-1', 'abc', 'Infinity', '100', '100.0', '100.2'].map((targetMz, i) => ({id: String(i), targetMz, label: ''}));
assert.deepEqual(numericTargets(ions).map(ion => ion.targetMz), [100, 100.2]);
assert.ok(ionWarnings(ions, .5).some(warning => warning.includes('Overlapping')));
assert.ok(ionWarnings(ions, .5).some(warning => warning.includes('Duplicate')));
const file = {id: 'f', filename: 'synthetic.txt', metadata: emptyMetadata(), peaks: [{mz: 100, intensity: 5}], validLineCount: 1, invalidLineCount: 0, warnings: []};
const project = createProjectSnapshot('test', [file], ions, .5, ['f']);
assert.equal(parseProjectSnapshot(JSON.stringify(project)).files[0].peaks[0].intensity, 5);
for (const bad of [null, {}, {...project, files: [{}]}, {...project, files: [file, file]}, {...project, tolerance: -1}, {...project, ions: [null]}, {...project, plotSettings: {curveMode: 'bad'}}, {...project, plotSettings: {movingAverageWindow: 4}}, {...project, plotSettings: {exportWidth: 1e9}}, {...project, files: [{...file, peaks: [{mz: '100', intensity: 1}]}]}]) {
  assert.throws(() => parseProjectSnapshot(JSON.stringify(bad)), /Invalid project/);
}
assert.equal(parseSpectrumTxt('100 5\n101 bad\n102 10').warnings.length, 1);
let history = {current: project, past: [], future: [], key: '', time: 0};
history = projectReducer(history, {type: 'patch', patch: {files: []}, key: '', time: 1});
history = projectReducer(history, {type: 'undo'}); assert.equal(history.current.files[0], file);
history = projectReducer(history, {type: 'redo'}); assert.equal(history.current.files.length, 0);
history = projectReducer(history, {type: 'restore', project});
history = projectReducer(history, {type: 'patch', patch: {projectName: 'a'}, key: 'name', time: 100});
history = projectReducer(history, {type: 'patch', patch: {projectName: 'abc'}, key: 'name', time: 200});
history = projectReducer(history, {type: 'undo'}); assert.equal(history.current.projectName, 'test');
console.log('PASS: invalid/blank/duplicate ions, overlapping windows, malformed project rejection, TXT warnings, atomic undo/redo and coalesced edits.');

const {processSpectra} = await load('utils/processing');
const {buildPlotData} = await load('utils/plot');
const quadraticFiles = [1,2,3,4,5].map(x => ({...file, id: `f${x}`, metadata: {...emptyMetadata(), acqTime: String(x)}, peaks: [{mz: 100, intensity: x*x}]}));
const quadraticRows = processSpectra(quadraticFiles, [{id: 'ion', targetMz: 100, label: ''}], .1);
const fitted = buildPlotData(quadraticRows, 'acqTime', 'absolute', true, {colors: {}, lineWidth: 2, markerSize: 5, lineShape: 'linear', curveMode: 'polynomial', polynomialDegree: 2});
assert.equal(fitted[0].line.dash, 'dash');
assert.ok(fitted[0].meta.fit.residuals.every(value => Math.abs(value) < 1e-8));
assert.ok(fitted[0].meta.fit.rmse < 1e-8);
assert.equal(fitted[0].meta.fit.x.length, 5);
console.log('PASS: polynomial diagnostics, residuals, RMSE and dashed fit traces.');

const {formatLegendMz, readLegendMzDecimals} = await load('utils/format');
assert.equal(formatLegendMz(751.321456, 2), '751.32');
assert.equal(formatLegendMz(659.99999, 0), '660');
assert.equal(formatLegendMz(283.1, 3), '283.100');
assert.equal(formatLegendMz(751.321456), '751.321456');
for (const invalid of [-1, 9, 1.5, null, '2', NaN]) assert.equal(readLegendMzDecimals(invalid), 'auto');
const preciseRows = quadraticRows.map(row => ({...row, targetMz: 751.321456, label: 'fragment 1'}));
const beforeRounding = JSON.stringify(preciseRows);
for (const curveMode of ['connect', 'movingAverage', 'polynomial']) {
  const style = {colors: {}, lineWidth: 2, markerSize: 5, lineShape: 'linear', curveMode, polynomialDegree: 2};
  const original = buildPlotData(preciseRows, 'acqTime', 'absolute', true, style);
  const rounded = buildPlotData(preciseRows, 'acqTime', 'absolute', true, {...style, legendMzDecimals: 2});
  assert.ok(rounded[0].name.startsWith('<i>m/z</i> 751.32 - fragment 1'));
  assert.deepEqual(rounded.map(({name, ...trace}) => trace), original.map(({name, ...trace}) => trace));
}
assert.equal(JSON.stringify(preciseRows), beforeRounding);
for (const decimals of ['auto', 0, 2, 8]) {
  const restored = parseProjectSnapshot(JSON.stringify({...project, plotSettings: {legendMzDecimals: decimals}}));
  assert.equal(restored.plotSettings.legendMzDecimals, decimals);
}
for (const invalid of [-1, 9, 1.5, '2']) {
  assert.throws(() => parseProjectSnapshot(JSON.stringify({...project, plotSettings: {legendMzDecimals: invalid}})), /legend m\/z decimals/);
}
console.log('PASS: legend decimal formatting, original trace values/identities preserved, persistence and invalid precision rejection.');

const emptyProject = createEmptyProject();
assert.deepEqual([emptyProject.files, emptyProject.ions, emptyProject.selectedFileIds], [[], [], []]);
assert.equal(emptyProject.ionDraft, '');
assert.equal(emptyProject.tolerance, .5);
assert.equal(emptyProject.plotSelectedOnly, false);
assert.deepEqual(emptyProject.plotSettings, {legendPosition: 'top'});
assert.deepEqual(parseProjectSnapshot(JSON.stringify(emptyProject)).files, []);
const previous = {...project, plotSettings: {legendMzDecimals: 3}, ionDraft: '100, 200'};
const freshHistory = projectReducer({current: previous, past: [], future: [], key: '', time: 0}, {type: 'restore', project: emptyProject});
assert.equal(freshHistory.current, emptyProject);
assert.equal(projectReducer(freshHistory, {type: 'undo'}).current, previous);
assert.equal(projectReducer(projectReducer(freshHistory, {type: 'undo'}), {type: 'redo'}).current, emptyProject);
assert.notEqual(createEmptyProject().files, emptyProject.files);
console.log('PASS: new project clears data and settings, preserves the previous project for undo, and can be redone.');
