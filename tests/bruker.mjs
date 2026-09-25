import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the pure processing modules with the installed compiler, without extra dependencies.
const output = path.resolve('node_modules/.tmp/bruker-tests');
for (const name of ['types', 'utils/id', 'utils/filenameMetadata', 'utils/bruker', 'utils/project', 'utils/processing', 'utils/csv', 'utils/plot', 'utils/format', 'utils/segmentSpectrum']) {
  const result = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
  }).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.mjs"');
  const target = path.join(output, `${name}.mjs`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result);
}
const load = name => import(pathToFileURL(path.join(output, `utils/${name}.mjs`)));
const { parseBrukerExport, findBrukerFiles, roundMass } = await load('bruker');
const { createProjectSnapshot, parseProjectSnapshot } = await load('project');
const { processSpectra, extractBrukerIntensity, normalizeIntensities } = await load('processing');
const { plotRowsToCsv, processedRowsToCsv } = await load('csv');
const { buildPlotData, movingAverageValues, legendGeometry, insideLegendColumns, defaultPlotAppearance } = await load('plot');
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
