import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the pure processing modules with the installed compiler, without extra dependencies.
const output = path.resolve('node_modules/.tmp/bruker-tests');
for (const name of ['types', 'utils/id', 'utils/filenameMetadata', 'utils/bruker', 'utils/project', 'utils/processing', 'utils/csv', 'utils/plot', 'utils/format', 'utils/segmentSpectrum', 'utils/plotLifecycle', 'utils/axisRange', 'utils/colorPalettes']) {
  const result = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
  }).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.mjs"');
  const target = path.join(output, `${name}.mjs`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result);
}
const load = name => import(pathToFileURL(path.join(output, `utils/${name}.mjs`)));
const { parseBrukerExport, findBrukerFiles, roundMass, brukerChannels, wavelengthSequence, assignWavelengths } = await load('bruker');
const { createProjectSnapshot, parseProjectSnapshot } = await load('project');
const { processSpectra, extractBrukerIntensity, normalizeIntensities } = await load('processing');
const { plotRowsToCsv, processedRowsToCsv } = await load('csv');
const { buildPlotData, movingAverageValues, legendGeometry, insideLegendColumns, defaultPlotAppearance, trmsPlotDefaults } = await load('plot');
const { formatMz, formatIntensity } = await load('format');
const { segmentSpectrum, spectrumToTxt, segmentSpectrumFilename } = await load('segmentSpectrum');
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
const draftProject = { ...project, ionDraft: '241\n255\nunfinished label =' };
assert.deepEqual(parseProjectSnapshot(JSON.stringify(draftProject)), draftProject);
fs.writeFileSync(path.join(output, 'synthetic.pdmsplot.json'), JSON.stringify(project));
const old = JSON.parse(JSON.stringify(project)); delete old.files[0].metadata.retentionTime;
assert.equal(parseProjectSnapshot(JSON.stringify(old)).files[0].metadata.retentionTime, '');
const legacy = JSON.parse(JSON.stringify(project));
legacy.files[0].bruker.method = 'nominal-mz-observed-mean';
legacy.files[0].peaks = [{mz:100,intensity:30}];
const legacyFile = parseProjectSnapshot(JSON.stringify(legacy)).files[0];
assert.match(legacyFile.warnings.join(' '), /Reimport/);
assert.equal(processSpectra([legacyFile], [{id:'legacy',targetMz:100,label:''}], 0.5)[0].absoluteIntensity, 30);
// Complete segment exports must include untargeted masses and match the observed
// peak mean used by the time plot, including repeated masses and banker's rounding.
const spectrumFile = { ...reopened.files[0], peaks: [
  {mz: 300.5, intensity: 12.3456789012345},
  {mz: 100.2, intensity: 10}, {mz: 100.4, intensity: 30}, {mz: 100.2, intensity: 50},
  {mz: 250.123456789, intensity: 0},
] };
const complete = segmentSpectrum(spectrumFile, 0);
assert.deepEqual(complete, [{mz:100,intensity:30}, {mz:250,intensity:0}, {mz:300,intensity:12.3456789012345}]);
for (const peak of complete) assert.equal(peak.intensity, extractBrukerIntensity(spectrumFile.peaks, peak.mz, 0, 0).intensity);
assert.equal(spectrumToTxt(complete), '100\t30\n250\t0\n300\t12.3456789012345');
assert.deepEqual(segmentSpectrum(spectrumFile), [
  {mz:100.2,intensity:30}, {mz:100.4,intensity:30}, {mz:250.123456789,intensity:0}, {mz:300.5,intensity:12.3456789012345},
]);
assert.deepEqual(segmentSpectrum(precise.files[0]), precise.files[0].peaks);
assert.deepEqual(segmentSpectrum(legacyFile, 0), legacyFile.peaks);
assert.deepEqual(segmentSpectrum({...spectrumFile, peaks:[]}, 0), []);
assert.equal(spectrumToTxt([]), '');
assert.deepEqual(segmentSpectrum(reopened.files[0], 0), segmentSpectrum(result.files[0], 0));
assert.match(segmentSpectrumFilename(spectrumFile, 0), /Synthetic_segment-1_0-30s_mz-0dp\.txt$/);
assert.match(segmentSpectrumFilename(spectrumFile), /_mz-original\.txt$/);
assert.equal(spectrumFile.peaks[0].mz, 300.5); // No mutation of the saved source.
const rows = processSpectra(reopened.files, [{ ...ions[0], targetMz: 100 }], 0.5);
const csv = plotRowsToCsv(rows.slice(0,1), 'retentionTime', 'relative', 2, 'Acquisition time (scaled s)');
assert.match(csv, /Acquisition time \(scaled s\),30,Each ion's own maximum = 100%,33\.333/);
const txt = plotRowsToCsv(rows, 'retentionTime', 'absolute', 1, undefined, '\t');
assert.match(txt, /Acquisition time\t15\tAbsolute intensity\t30/);
assert.match(processedRowsToCsv(rows), /acquisition time \(s\),segment,notes/);
assert.equal(buildPlotData(rows, 'retentionTime', 'absolute', true, { colors: {}, lineWidth: 2, markerSize: 5, lineShape: 'linear', curveMode: 'connect', polynomialDegree: 3 })[0].x[0], 15);
// Distinguish within-segment abundance from each ion's temporal maximum.
const basis = rows[0];
const normalized = normalizeIntensities([
 {...basis, fileId:'a', ionId:'major', absoluteIntensity:90},
 {...basis, fileId:'a', ionId:'minor', absoluteIntensity:10},
 {...basis, fileId:'b', ionId:'major', absoluteIntensity:20},
 {...basis, fileId:'b', ionId:'minor', absoluteIntensity:80},
 {...basis, fileId:'empty', ionId:'major', absoluteIntensity:0},
]);
assert.deepEqual(normalized.map(r=>r.selectedIonPercent), [90,10,20,80,0]);
assert.deepEqual(normalized.map(r=>r.absoluteIntensity), [90,10,20,80,0]);
assert.equal(normalized[0].relativeIntensity, 100);
assert.equal(normalized[3].relativeIntensity, 100);
assert.equal(normalized[1].relativeIntensity, 12.5);
assert.equal(normalizeIntensities(normalized.slice(0,2))[1].selectedIonPercent, 10);
const abundancePlot = buildPlotData(normalized.slice(0,4), 'retentionTime', 'selectedSum', true, {colors:{},lineWidth:2,markerSize:5,lineShape:'linear',curveMode:'connect',polynomialDegree:3}, 1/60);
assert.deepEqual(abundancePlot[0].y,[90,20]);
assert.equal(abundancePlot[0].x[0], Number(basis.metadata.retentionTime)/60);
assert.match(plotRowsToCsv(normalized.slice(0,1), 'retentionTime', 'selectedSum', 1/60, 'Time (min)'), /Time \(min\),0.25,Share of selected ions per segment \(%\),90/);
assert.match(plotRowsToCsv(normalized.slice(0,1), 'retentionTime', 'selectedSum', 1/60, 'Time (min)', '\t'), /Time \(min\)\t0.25\tShare of selected ions per segment \(%\)\t90/);
project.plotSettings.yMode = 'selectedSum';
project.plotSettings.xValueScale = 'secondsToMinutes';
project.plotSettings.xValueMultiplier = 1/60;
assert.deepEqual(parseProjectSnapshot(JSON.stringify(project)).plotSettings, project.plotSettings);
console.log('PASS: boundaries, units, decimal preservation and tolerance-based averaging, gaps, corrupt input, file discovery, project round trip, legacy projects and CSV/TXT exports.');

assert.equal(roundMass(100.5, 0), 100);
assert.equal(roundMass(101.5, 0), 102);
assert.equal(roundMass(100.1234, 2), 100.12);
const fixed = parseBrukerExport(ascii, '4\n1 0 30\n2 30 60', 'fixed', 'min', 's', {mzDecimals:0, intervalSeconds:30});
assert.deepEqual(fixed.files.map(f=>f.metadata.retentionTime), ['0','30','60']);
assert.deepEqual(fixed.files.map(f=>f.bruker.scanCount), [2,1,1]);
assert.equal(fixed.files[0].peaks[0].mz, 100.4);
const fixedRows = processSpectra(fixed.files, [{id:'ion',targetMz:100,label:''}], 0);
assert.deepEqual(fixedRows.map(r=>r.absoluteIntensity), [30,80,100]);
assert.deepEqual(fixedRows.map(r=>r.foundMz), [100,100,100]);
assert.throws(()=>parseBrukerExport(ascii, '4\n1 0 60', 'bad', 'min', 's', {intervalSeconds:0}), /positive/);
assert.throws(()=>parseBrukerExport(ascii, '4\n1 0 60', 'bad', 'min', 's', {mzDecimals:1.5}), /0–6/);
assert.deepEqual(movingAverageValues([0,6,24,0,10,2,0], 5), [0,10,8,8.4,7.2,4,0]);
assert.deepEqual(movingAverageValues([2,6], 5), [2,6]);
assert.throws(()=>movingAverageValues([1,2],4), /odd/);
const smoothStyle = {colors:{},lineWidth:2,markerSize:5,lineShape:'linear',curveMode:'movingAverage',polynomialDegree:3,movingAverageWindow:5};
const smoothTraces = buildPlotData(fixedRows,'retentionTime','absolute',true,smoothStyle,1/60);
assert.deepEqual(smoothTraces[0].y, [30,70,100]);
assert.deepEqual(smoothTraces[1].y, [30,80,100]);
assert.deepEqual(smoothTraces[0].x, [0,.5,1]);
assert.equal(smoothTraces[0].legendgroup, smoothTraces[1].legendgroup);
assert.deepEqual(buildPlotData([...fixedRows,...fixedRows.map(r=>({...r,id:r.id+'b',seriesId:'second',absoluteIntensity:200}))],'retentionTime','absolute',true,smoothStyle).map(t=>t.y), [[30,70,100],[30,80,100],[200,200,200],[200,200,200]]);
const smoothCsv = plotRowsToCsv(fixedRows,'retentionTime','absolute',1/60,'Time (min)',',',5);
assert.match(smoothCsv,/smoothing,smoothed plot y value/);
assert.match(smoothCsv.split('\n')[2],/^Time \(min\),0.5,Absolute intensity,80,/);
assert.ok(smoothCsv.split('\n')[2].endsWith(',70'));
const smoothProject = createProjectSnapshot('smoothing',fixed.files,ions,0,[]);
smoothProject.plotSettings={curveMode:'movingAverage',movingAverageWindow:5,yMode:'selectedSum'};
const restoredSmooth = parseProjectSnapshot(JSON.stringify(smoothProject));
assert.deepEqual(restoredSmooth.files,fixed.files);
assert.deepEqual(restoredSmooth.plotSettings,smoothProject.plotSettings);
console.log('PASS: optional rounding, fixed time bins, partial final bin, moving average endpoints, separate runs, measured/smoothed export and saved settings.');

const names=Array.from({length:9},(_,i)=>`<i>m/z</i> ${241+i}`);
const automaticLegend=legendGeometry('auto',names,1000,800,24);
assert.ok(automaticLegend.legend.y>1);
assert.ok(automaticLegend.columns>1);
assert.ok(automaticLegend.margin.t>32);
const twoColumns=legendGeometry('top',names,1000,800,24,2);
assert.equal(twoColumns.columns,2);
assert.ok(twoColumns.margin.t>automaticLegend.margin.t);
const narrowLegend=legendGeometry('auto',names,400,800,24,6);
assert.equal(narrowLegend.columns,1);
const bottomLegend=legendGeometry('bottom',names,1000,800,24,3);
assert.ok(bottomLegend.legend.y<0);
assert.ok(bottomLegend.margin.b>88);
assert.equal(legendGeometry('auto',[],1000,800,24).margin.t,32);
assert.equal(defaultPlotAppearance.fontFamily,'Arial');
assert.equal(defaultPlotAppearance.legendPosition,'insideTop');
const insideLegend=legendGeometry('insideTop',names,1000,800,24,3);
assert.equal(insideLegend.columns,3);
assert.equal(insideLegend.legend.y,0.98);
assert.equal(insideLegend.legend.yanchor,'top');
assert.equal(insideLegend.margin.t,32);
const manualLegend=legendGeometry('inside',names,1000,800,24,2,false,0.75,0.65);
assert.equal(manualLegend.columns,2);
assert.equal(manualLegend.legend.orientation,'h');
assert.equal(manualLegend.legend.x,0.75);
assert.equal(manualLegend.legend.y,0.65);
const emphasisRows = [...fixedRows,...fixedRows.map(r=>({...r,id:r.id+'other',ionId:'other',targetMz:101}))];
for (const curveMode of ['connect','movingAverage','polynomial']) {
  const style={...smoothStyle,curveMode,colors:{ion:'#ff0000',other:'#00bbaa'}};
  const normal=buildPlotData(emphasisRows,'retentionTime','absolute',true,style);
  const focused=buildPlotData(emphasisRows,'retentionTime','absolute',true,{...style,highlightedIonId:'ion'});
  normal.forEach(trace=>{
    const match=focused.find(t=>t.uid===trace.uid);
    assert.deepEqual([match.x,match.y,match.legendrank],[trace.x,trace.y,trace.legendrank]);
  });
  focused.forEach(t=>{
    assert.equal(t.line.color,t.meta.ionId==='ion'?'#ff0000':'#b8b8b8');
    assert.equal(t.marker.color,t.line.color);
  });
  const front=focused.findIndex(t=>t.meta.ionId==='ion');
  assert.ok(front>0);
  assert.ok(focused.slice(front).every(t=>t.meta.ionId==='ion'));
  assert.deepEqual([...focused].sort((a,b)=>a.legendrank-b.legendrank).map(t=>t.uid),normal.map(t=>t.uid));
  assert.ok(normal.every(trace => /^trace-[0-9a-f]+$/.test(trace.uid)), 'Plotly cleanup requires CSS-safe trace IDs');
  assert.equal(new Set(normal.map(trace => trace.uid)).size, normal.length);
  const placed=insideLegendColumns(focused,2,896,24,0.8,0.75);
  assert.equal(Object.keys(placed.legends).length,2);
  assert.ok(placed.legends.legend.x>0);
  assert.ok(placed.legends.legend2.x>placed.legends.legend.x);
  assert.ok(placed.data.filter(t=>t.meta.ionId==='ion').every(t=>t.legend==='legend'));
  assert.ok(placed.data.filter(t=>t.meta.ionId==='other').every(t=>t.legend==='legend2'));
  assert.deepEqual(placed.data.map(t=>[t.x,t.y,t.uid]),focused.map(t=>[t.x,t.y,t.uid]));
  assert.deepEqual(buildPlotData(emphasisRows,'retentionTime','absolute',true,{...style,highlightedIonId:'missing'}),normal);
}
project.plotSettings={...project.plotSettings,legendPosition:'auto',legendColumns:3};
project.plotSettings.highlightOnClick=true;
project.plotSettings.highlightedIonId='ion';
assert.deepEqual(parseProjectSnapshot(JSON.stringify(project)).plotSettings,project.plotSettings);
console.log('PASS: inside/outside legends, adaptive columns, persisted settings, and ion highlighting without changing plotted values.');

// Optional local validation: never copy real spectra into this repository.
// Delay a render deliberately: superseded work must not race the latest update,
// attach stale handlers, report stale failures, or purge while still rendering.
const { queuePlotTask } = await load('plotLifecycle');
let releaseRender;
let renderStarted;
const started = new Promise(resolve => { renderStarted = resolve; });
const heldRender = new Promise(resolve => { releaseRender = resolve; });
const lifecycle = [];
const failures = [];
const firstRender = queuePlotTask(Promise.resolve(), async isCurrent => {
  lifecycle.push('render start'); renderStarted();
  await heldRender;
  lifecycle.push('render finish');
  if (isCurrent()) lifecycle.push('stale listeners');
}, error => failures.push(error));
await started;
firstRender.cancel();
const obsoleteRender = queuePlotTask(firstRender.done, () => lifecycle.push('obsolete'), error => failures.push(error));
obsoleteRender.cancel();
const cleanup = queuePlotTask(obsoleteRender.done, () => { lifecycle.push('purge'); }, error => failures.push(error));
const latestRender = queuePlotTask(cleanup.done, () => { lifecycle.push('latest'); }, error => failures.push(error));
assert.deepEqual(lifecycle, ['render start']);
releaseRender();
await latestRender.done;
assert.deepEqual(lifecycle, ['render start', 'render finish', 'purge', 'latest']);
const syncError = new Error('sync render failure');
const failedRender = queuePlotTask(latestRender.done, () => { throw syncError; }, error => failures.push(error));
const rejectedRender = queuePlotTask(failedRender.done, () => Promise.reject('async render failure'), error => failures.push(error));
const retryRender = queuePlotTask(rejectedRender.done, () => { lifecycle.push('retry'); }, error => failures.push(error));
await retryRender.done;
assert.deepEqual(failures, [syncError, 'async render failure']);
assert.equal(lifecycle.at(-1), 'retry');
console.log('PASS: serialized plot updates, cancellation, deferred cleanup, error recovery and saved ion drafts.');
const { axisRange, axisRangeLayout, numericBounds } = await load('axisRange');
assert.deepEqual(axisRange('', '', [0, 100]).range, [0, 102]);
assert.deepEqual(axisRange('', '', [10, 20]).range, [9.8, 20.2]);
assert.deepEqual(axisRange('', '', [-10, 10]).range, [-10.4, 10.4]);
assert.deepEqual(axisRange('0', '', [0, 0]).range, [0, 1]);
assert.deepEqual(axisRange('0', '', [-5, -1]).range, [0, 0.08]);
assert.deepEqual(axisRange('', '0', [1, 5]).range, [-0.08, 0]);
assert.deepEqual(axisRange('0', '100', [1, 120]).range, [0, 100]);
assert.deepEqual(axisRange('0', '', undefined).range, [0, 1]);
assert.ok(axisRange('0', '0', [0, 0]).error);
assert.ok(axisRange('20', '10', [0, 30]).error);
assert.deepEqual(numericBounds([0, NaN, 15, Infinity]), [0, 15]);
assert.equal(numericBounds(['dark', 'light']), undefined);
assert.equal(numericBounds([]), undefined);
assert.deepEqual(axisRange('', '', undefined), {});
const fixedRange = axisRangeLayout(axisRange('0', '100', [0, 90]).range);
assert.deepEqual(fixedRange, {autorange:false,range:[0,100],autorangeoptions:{minallowed:0,maxallowed:100}});
console.log('PASS: compact automatic axis margins, exact zero bounds, constant data and modebar range constraints.');
const { paletteColor, trmsColors } = await load('colorPalettes');
const referenceMasses = [751, 659, 617, 375, 283, 255, 241];
assert.deepEqual(referenceMasses.map(mass=>paletteColor('trms',mass,0)), ['#0072bd','#d95319','#edb120','#7e2f8e','#77ac30','#4dbeee','#a2142f']);
const paletteRows = referenceMasses.slice().reverse().map((mass,index)=>({...basis,id:`palette-${mass}`,ionId:`palette-ion-${mass}`,targetMz:mass,seriesId:'one',absoluteIntensity:index+1}));
const paletteStyle = {colors:{},lineWidth:2.5,markerSize:7,lineShape:'linear',curveMode:'connect',polynomialDegree:3};
const mapped = buildPlotData(paletteRows,'retentionTime','absolute',true,paletteStyle);
assert.deepEqual(mapped.map(trace=>trace.line.color), trmsColors.slice().reverse());
const secondRun = paletteRows.map(row=>({...row,id:row.id+'-second',seriesId:'two'}));
assert.deepEqual(buildPlotData([...paletteRows,...secondRun],'retentionTime','absolute',true,paletteStyle).map(trace=>trace.line.color), [...trmsColors.slice().reverse(),...trmsColors.slice().reverse()]);
const overridden = buildPlotData(paletteRows,'retentionTime','absolute',true,{...paletteStyle,colors:{'palette-ion-241':'#123456'}});
assert.equal(overridden[0].line.color,'#123456');
assert.equal(buildPlotData(paletteRows,'retentionTime','absolute',true,{...paletteStyle,colorPalette:'classic'})[0].line.color,'#000000');
assert.equal(trmsPlotDefaults.movingAverageWindow,3);
assert.equal(trmsPlotDefaults.yMode,'selectedSum');
assert.equal(trmsPlotDefaults.xValueMultiplier,1/60);
assert.equal(trmsPlotDefaults.legendColumns,1);
assert.equal(trmsPlotDefaults.legendSize,24);
assert.equal(trmsPlotDefaults.fontFamily,'Arial');
assert.equal(trmsPlotDefaults.highlightOnClick,false);
const trmsProject = {...project,plotSettings:{...trmsPlotDefaults,traceColors:{'palette-ion-241':'#123456'}}};
assert.deepEqual(parseProjectSnapshot(JSON.stringify(trmsProject)).plotSettings,trmsProject.plotSettings);
console.log('PASS: reference colors by m/z across ordering/runs, manual overrides, color presets and saved TRMS settings.');

// MS/MS must keep polarity, precursor and MS level separate. Synthetic scan
// intensities deliberately differ so accidental channel mixing changes results.
const ms2Scan = (time, precursor, intensity, polarity='+') => `${time},${polarity},ESI,ms2,${precursor},line,50-150,1,137.76 ${intensity}`;
const ms2Ascii = [ms2Scan(0.1,'138',1000),ms2Scan(1.1,'138',20),ms2Scan(2.1,'138',40)].join('\n');
const ms2 = parseBrukerExport(ms2Ascii,'3\n1 0 60\n2 60 120\n3 120 180','MS2.d');
assert.equal(ms2.assignedScans,3);
assert.equal(ms2.files[0].metadata.parentIon,'138');
assert.equal(ms2.files[0].bruker.msLevel,2);
assert.equal(ms2.files[0].bruker.polarity,'+');
const mixed = [ms2Ascii,scan(0.2,['137.76 999']),ms2Scan(0.3,'120',500),ms2Scan(0.4,'138',600,'-')].join('\n');
assert.equal(brukerChannels(mixed).length,4);
assert.throws(()=>parseBrukerExport(mixed,'6\n1 0 180','mixed'),/Multiple spectrum types/);
const selectedMs2 = parseBrukerExport(mixed,'6\n1 0 180','mixed','min','s',{channelId:brukerChannels(ms2Ascii)[0].id});
assert.equal(selectedMs2.assignedScans,3);
assert.equal(selectedMs2.files[0].peaks.length,3);
assert.match(selectedMs2.warnings.join(' '),/3 scans excluded/);
assert.throws(()=>parseBrukerExport(ms2Ascii.replace('137.76 20','bad'),'3\n1 0 180','damaged'),/Invalid m\/z/);
const precisionBoundary = parseBrukerExport(ms2Scan(13.0074,'138',50),'1\n13 726.178976 780.442944','precision');
assert.equal(precisionBoundary.assignedScans,1);
assert.match(precisionBoundary.warnings[0],/rounding precision/);
assert.throws(()=>parseBrukerExport(ms2Scan(13.01,'138',50),'1\n13 726.178976 780.442944','gap'),/No selected scans/);
assert.throws(()=>parseBrukerExport(ms2Scan(0.1667,'138',50),'1\n1 0 10.001\n2 10.003 20','ambiguous'),/No selected scans/);
const waveValues = wavelengthSequence(13,290,235,-5,true);
assert.deepEqual(waveValues,['off','290','285','280','275','270','265','260','255','250','245','240','235']);
assert.throws(()=>wavelengthSequence(13,290,235,-5,false),/needs 12 segments/);
assert.throws(()=>wavelengthSequence(13,290,235,5,true),/negative step/);
assert.throws(()=>wavelengthSequence(13,290,235,-6,true),/exactly/);
assert.throws(()=>assignWavelengths(ms2.files,['off','bad','235']),/Segment 2/);
assert.throws(()=>assignWavelengths(ms2.files,['off','0xff','235']),/Segment 2/);
assert.throws(()=>assignWavelengths(ms2.files,['off','','']),/at least one/);
const waveFiles = assignWavelengths(ms2.files,['off','290','235']);
assert.equal(waveFiles[0].metadata.wavelength,'');
assert.equal(waveFiles[0].metadata.condition,'Laser off');
assert.equal(ms2.files[0].metadata.condition === 'Laser off',false);
const waveRows = processSpectra(waveFiles,[{id:'138',targetMz:138,label:''}],0.5);
const waveTrace = buildPlotData(waveRows,'wavelength','relative',true,paletteStyle)[0];
assert.deepEqual(waveTrace.x,[235,290]);
assert.deepEqual(waveTrace.y,[100,50]); // off=1000 must not be the wavelength maximum
const waveCsv=plotRowsToCsv(waveRows,'wavelength','relative');
assert.equal(waveCsv.split('\n').length,3);
assert.doesNotMatch(waveCsv,/Laser off/);
assert.match(processedRowsToCsv(waveRows),/Laser off/);
assert.equal(buildPlotData(waveRows,'retentionTime','absolute',true,paletteStyle)[0].x.length,3);
assert.equal(segmentSpectrum(waveFiles[0])[0].intensity,1000);
const waveProject=createProjectSnapshot('wave',waveFiles,[],0.5,[]);
waveProject.plotSettings={xAxis:'wavelength',xValueMultiplier:1,xUnit:'nm'};
waveProject.plotSelectedOnly=false;
assert.deepEqual(parseProjectSnapshot(JSON.stringify(waveProject)),waveProject);
console.log('PASS: MS/MS detection, separate precursor/polarity channels, timestamp precision, wavelength mapping, reference exclusion, normalization, exports and project round trip.');

if (process.argv[2]) {
  const folder = process.argv[2];
  const real = parseBrukerExport(fs.readFileSync(path.join(folder, 'data.ascii'), 'utf8'), fs.readFileSync(path.join(folder, 'Segments.txt'), 'utf8'), 'Local sample.d');
  assert.ok(real.assignedScans > 0);
  assert.equal(real.files.reduce((sum, f) => sum + f.bruker.scanCount, 0), real.assignedScans);
  const roundTrip = parseProjectSnapshot(JSON.stringify(createProjectSnapshot('local validation', real.files, ions, 0.5, [])));
  assert.deepEqual(roundTrip.files, real.files);
  console.log(JSON.stringify({ segments: real.files.length, scans: real.totalScans, assigned: real.assignedScans, warnings: real.warnings }, null, 2));
  if (process.argv[3]) {
    const origin = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const nominal = parseBrukerExport(fs.readFileSync(path.join(folder,'data.ascii'),'utf8'), fs.readFileSync(path.join(folder,'Segments.txt'),'utf8'), 'Origin comparison', 'min','s',{mzDecimals:0,intervalSeconds:30});
    const rawMasses = [255,241,283,311,375,617,751,163,271];
    const smoothMasses = [241,255,751,311,617,375,163,271];
    const measured = processSpectra(nominal.files,rawMasses.map(m=>({id:String(m),targetMz:m,label:''})),0);
    const traces = buildPlotData(measured,'retentionTime','selectedSum',true,smoothStyle,1/60);
    let rawError=0, smoothError=0;
    assert.equal(nominal.assignedScans,nominal.totalScans);
    assert.deepEqual(nominal.files.map(f=>Number(f.metadata.retentionTime)/60),origin.columns[0].data);
    rawMasses.forEach((mass,c)=>{
      const actual=measured.filter(r=>r.targetMz===mass).map(r=>r.selectedIonPercent);
      const expected=origin.columns[c+1].data;
      assert.equal(actual.length,expected.length);
      actual.forEach((v,i)=>{rawError=Math.max(rawError,Math.abs(v-expected[i]));});
    });
    smoothMasses.forEach((mass,c)=>{
      const trace=traces.find(t=>t.name===`<i>m/z</i> ${mass}`&&t.mode==='lines');
      const expected=origin.columns[c+10].data;
      assert.equal(trace.y.length,expected.length);
      trace.y.forEach((v,i)=>{smoothError=Math.max(smoothError,Math.abs(v-expected[i]));});
    });
    assert.ok(rawError<1e-9,`raw mismatch ${rawError}`);
    assert.ok(smoothError<1e-9,`smoothing mismatch ${smoothError}`);
    console.log(JSON.stringify({originRawValues:279,originSmoothedValues:248,rawMaxError:rawError,smoothedMaxError:smoothError}));
  }
}
