import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const output = path.resolve('node_modules/.tmp/thermo-tests');
for (const name of ['types','utils/id','utils/filenameMetadata','utils/bruker','utils/powerCalibration','utils/project','utils/thermoScans','utils/processing','utils/csv','utils/plot','utils/format','utils/colorPalettes','utils/replicates','utils/preview']) {
  const code = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText.replace(/from "(\.[^"]+)"/g,'from "$1.mjs"');
  const target=path.join(output,`${name}.mjs`); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,code);
}
const load=name=>import(pathToFileURL(path.join(output,`${name}.mjs`)));
const {emptyMetadata}=await load('types');
const {inferMetadataFromFilename}=await load('utils/filenameMetadata');
const {processSpectra}=await load('utils/processing');
const {aggregateReplicates}=await load('utils/replicates');
const {rowsForPlotAxis,buildPlotData}=await load('utils/plot');
const {plotRowsToCsv}=await load('utils/csv');
const {parseProjectSnapshot,createProjectSnapshot}=await load('utils/project');
const {fitExportPreview}=await load('utils/preview');
for (const [width,height] of [[1000,1000],[16000,9000],[9000,16000],[2400,1800]]) {
  for (const [availableWidth,availableHeight] of [[1000,650],[500,400],[800,90]]) {
    const fitted=fitExportPreview(width,height,availableWidth,availableHeight);
    assert.ok(fitted.width<=availableWidth+1e-9 && fitted.height<=availableHeight+1e-9);
    assert.ok(Math.abs(fitted.width/fitted.height-width/height)<1e-12);
  }
}
const meta=inferMetadataFromFilename('9-FMN_20uM_457mz_act_1s_365LED_ON_set_50mA_2.raw');
assert.equal(meta.compound,'FMN'); assert.equal(meta.concentration,'20 uM'); assert.equal(meta.parentIon,'457');
assert.equal(meta.activationTime,'1 s'); assert.equal(meta.acqTime,undefined); assert.equal(meta.current,'50'); assert.equal(meta.condition,'LED ON'); assert.equal(meta.replicate,'2'); assert.equal(meta.wavelength,'365 nm');
assert.equal(inferMetadataFromFilename('FMN_280nm_LED_ON_100mA_1.txt').wavelength,'280 nm');
assert.equal(inferMetadataFromFilename('FMN_123LED_ON_1.txt').wavelength,undefined);
assert.equal(inferMetadataFromFilename('FMN_365LED_OFF_4.raw').current,undefined);
assert.equal(inferMetadataFromFilename('FMN_365LED_ON_set_500uA_4.raw').current,'0.5');
assert.equal(inferMetadataFromFilename('FMN_365LED_ON_set_2500mV_4.raw').voltage,'2.5');
const ion=[{id:'ion',targetMz:100,label:'test'}];
const make=(i,current='10')=>({id:`file${i}-${current}`,filename:`synthetic_${i}.raw`,metadata:{...emptyMetadata(),compound:'Synthetic',condition:'LED ON',current,replicate:String(i)},peaks:[{mz:100,intensity:i}],validLineCount:1,invalidLineCount:0,warnings:[],thermo:{fingerprint:`${i}-${current}`,channel:'MS2 positive 200',instrument:'Synthetic',mode:'profile',method:'mean-scan-maximum',scans:[{timeSeconds:0,peaks:[{mz:99.8,intensity:i},{mz:100.1,intensity:i*2}]},{timeSeconds:1,peaks:[]}]}});
const files=[1,2,3,4,5].map(i=>make(i));
const rows=processSpectra(files,ion,.5);
assert.deepEqual(rows.map(r=>r.absoluteIntensity),[1,2,3,4,5]); // mean of scan maxima, missing scan is zero
const grouped=aggregateReplicates(rows,'current','absolute');
assert.equal(grouped.warnings.length,0); assert.equal(grouped.rows.length,1);
assert.equal(grouped.rows[0].absoluteIntensity,3); assert.equal(grouped.rows[0].statistics.n,5);
assert.ok(Math.abs(grouped.rows[0].statistics.sd-Math.sqrt(2.5))<1e-12);
assert.ok(Math.abs(grouped.rows[0].statistics.sem-Math.sqrt(.5))<1e-12);
const normalized=aggregateReplicates(rows,'current','relative').rows[0];
assert.equal(normalized.relativeIntensity,60); assert.ok(Math.abs(normalized.statistics.sd-Math.sqrt(1000))<1e-12);
assert.equal(rowsForPlotAxis([normalized],'current')[0].relativeIntensity,60); // do not renormalize aggregated means
const off={...make(1,''),id:'off',metadata:{...emptyMetadata(),condition:'LED OFF',replicate:'1'}};
assert.equal(rowsForPlotAxis(processSpectra([...files,off],ion,.5),'current').length,5);
const conditions=processSpectra([...files,...[1,2,3,4,5].map(i=>make(i,'50'))],ion,.5);
assert.equal(aggregateReplicates(conditions,'current','absolute').rows.length,2);
const other={...rows[0],id:'other',fileId:'other',metadata:{...rows[0].metadata,experiment:'other batch'}};
assert.equal(aggregateReplicates([...rows,other],'current','absolute').rows.length,2);
assert.equal(aggregateReplicates([rows[0]],'current','absolute').rows[0].statistics.sd,null);
assert.equal(aggregateReplicates([...rows,{...rows[0],fileId:'dup'}],'current','absolute').rows.length,0);
assert.equal(aggregateReplicates([{...rows[0],metadata:{...rows[0].metadata,replicate:''}}],'current','absolute').rows.length,0);
const style={colors:{},lineWidth:2,markerSize:5,lineShape:'linear',curveMode:'connect',polynomialDegree:3,replicateMode:'sd'};
const plot=buildPlotData(grouped.rows,'current','absolute',true,style);
assert.deepEqual(plot[0].x,[10]); assert.deepEqual(plot[0].y,[3]); assert.deepEqual(plot[0].error_y.array,[Math.sqrt(2.5)]);
const smooth=buildPlotData(aggregateReplicates(conditions,'current','absolute').rows,'current','absolute',true,{...style,curveMode:'movingAverage',movingAverageWindow:3});
assert.equal(smooth[0].error_y,undefined); assert.equal(smooth[1].error_y.array.length,2);
const csv=plotRowsToCsv(grouped.rows,'current','absolute');
assert.match(csv,/sample SD \(plot y\)/); assert.match(csv,/3,synthetic|3,5 replicates/); assert.match(csv,/1\.5811388300841898/);
const project=createProjectSnapshot('synthetic',files,[],.5,files.map(f=>f.id)); project.plotSettings={replicateMode:'sd',xAxis:'current'}; project.plotSelectedOnly=false;
assert.deepEqual(parseProjectSnapshot(JSON.stringify(project)),project);
fs.writeFileSync(path.join(output,'synthetic.pdmsplot.json'),JSON.stringify({...project,ions:[{id:'ion',targetMz:'100',label:'Synthetic'}],plotSettings:{...project.plotSettings,xTitle:'Current',xUnit:'mA',exportWidth:1600,exportHeight:900}}));
console.log('PASS: Thermo filename fields and units, mean of scan maxima, zeros, SD/SEM, normalization, reference exclusion, group separation, duplicate IDs, n=1, error bars, export and project persistence.');

// Range selection must change extraction without mutating source scans, and must
// invalidate cached extraction even when the original scan array is reused.
const {parseScanRanges, formatScanRanges, selectedThermoScans} = await load('utils/thermoScans');
const {processedRowsToCsv} = await load('utils/csv');
assert.equal(parseScanRanges(' ', 5), undefined);
assert.deepEqual(parseScanRanges('5, 2-3, 1-2', 5), [{start:1,end:3},{start:5,end:5}]);
assert.equal(formatScanRanges(parseScanRanges('1-2, 4', 5)), '1-2, 4');
for (const invalid of ['0', '-1', '3-2', '1-6', '1.5', '1,', 'abc', '9007199254740992']) {
  assert.throws(() => parseScanRanges(invalid, 5));
}
const source = make(8);
const originalScans = JSON.stringify(source.thermo.scans);
const selection = {...source, thermo:{...source.thermo, scanRanges:[{start:1,end:1}], scanSelectionReason:'Stable acquisition window'}};
assert.equal(processSpectra([source],ion,.5)[0].absoluteIntensity, 8);
const selectedRow = processSpectra([selection],ion,.5)[0];
assert.equal(selectedRow.absoluteIntensity,16);
assert.equal(selectedRow.warning,'');
assert.deepEqual(selectedRow.thermoScanSelections[0], {filename:source.filename,channel:source.thermo.channel,ranges:'1',selected:1,total:2,reason:'Stable acquisition window'});
assert.equal(processSpectra([source],ion,.5)[0].absoluteIntensity,8);
const zeroOnly = {...source, thermo:{...source.thermo, scanRanges:[{start:2,end:2}]}};
assert.equal(processSpectra([zeroOnly],ion,.5)[0].absoluteIntensity,0);
assert.match(processSpectra([zeroOnly],ion,.5)[0].warning,/1\/1 scans/);
assert.equal(JSON.stringify(source.thermo.scans),originalScans);
assert.deepEqual(selectedThermoScans(['a','b','c','d'],parseScanRanges('1, 3-4',4)),['a','c','d']);
const selectionProject = createProjectSnapshot('selection', [selection], [], .5, [selection.id]);
const restoredSelection = parseProjectSnapshot(JSON.stringify(selectionProject));
assert.deepEqual(restoredSelection.files[0].thermo, selection.thermo);
for (const scanRanges of [[],[{start:0,end:1}],[{start:1,end:3}],[{start:2,end:1}],[{start:1.5,end:2}],[{start:1,end:2},{start:2,end:2}],null,'1-2']) {
  assert.throws(() => parseProjectSnapshot(JSON.stringify({...selectionProject,files:[{...selection,thermo:{...selection.thermo,scanRanges}}]})), /invalid scan ranges/);
}
const secondSelection = {...make(9),thermo:{...make(9).thermo,scanRanges:[{start:2,end:2}]}};
const selectedReplicates = aggregateReplicates(processSpectra([selection,secondSelection],ion,.5),'current','absolute').rows[0];
assert.equal(selectedReplicates.absoluteIntensity,8);
assert.equal(selectedReplicates.statistics.n,2); // files, never scan count
assert.ok(Math.abs(selectedReplicates.statistics.sd-Math.sqrt(128)) < 1e-12);
assert.equal(selectedReplicates.thermoScanSelections.length,2);
for (const exported of [processedRowsToCsv([selectedRow]),plotRowsToCsv([selectedReplicates],'current','absolute')]) {
  assert.match(exported,/Thermo scan selection/);
  assert.match(exported,/Stable acquisition window/);
}
assert.match(plotRowsToCsv([selectedReplicates],'current','absolute'),/synthetic_9.raw/);
console.log('PASS: inclusive/disjoint scan ranges, invalid ranges, cache invalidation, zero scans, original scan preservation, legacy/all-scan fallback, project round trip, per-file export provenance and replicate statistics.');

// Live interval edits reuse the per-scan maxima; changing tolerance re-extracts.
const {extractThermoIntensity} = await load('utils/processing');
let peakReads = 0;
const tracked = {...make(1),thermo:{...make(1).thermo,scans:Array.from({length:100},(_,i)=>({timeSeconds:i,get peaks(){peakReads++; return [{mz:100,intensity:i+1}];}}))}};
assert.equal(extractThermoIntensity(tracked,100,.5).intensity,50.5);
assert.equal(peakReads,100);
const initialReads=peakReads;
for(let i=1;i<50;i++) {
  const selected={...tracked,thermo:{...tracked.thermo,scanRanges:[{start:i,end:i+2}]}};
  assert.equal(extractThermoIntensity(selected,100,.5).intensity,i+1);
}
assert.equal(peakReads,initialReads,'Range changes must not rescan peaks');
assert.equal(extractThermoIntensity(tracked,100,.1).intensity,50.5);
assert.equal(peakReads,200,'Tolerance changes must invalidate the scan cache');
const highDynamic={...make(1),thermo:{...make(1).thermo,scans:[{timeSeconds:0,peaks:[{mz:100,intensity:1e20}]},{timeSeconds:1,peaks:[{mz:100,intensity:1}]}]}};
extractThermoIntensity(highDynamic,100,.5);
assert.equal(extractThermoIntensity({...highDynamic,thermo:{...highDynamic.thermo,scanRanges:[{start:2,end:2}]}},100,.5).intensity,1);
console.log('PASS: live range edits reuse per-scan extraction, tolerance invalidates cache, and small signals retain precision after excluded large peaks.');

// Catalog names mix milliseconds and seconds and append an averaging group.
// Physical times must agree in sorting, plotting, replicate pooling and CSV.
const {axisNumericValue} = await load('utils/format');
const {hasRepeatedPlotCoordinates, movingAverageByRow} = await load('utils/plot');
const durations = ['1ms','10ms','30ms','50ms','100ms','200ms','500ms','1s','2s','5s','10s','20s','30s','60s'];
const expectedMs = [1,10,30,50,100,200,500,1000,2000,5000,10000,20000,30000,60000];
const timeFiles = durations.flatMap(duration => [1,2,3,4,5].map(replicate => {
  const filename = `FMN_457_isolated_280LED_ON_acttime_${duration}_${replicate}__mean_g1.txt`;
  const inferred = inferMetadataFromFilename(filename);
  assert.equal(inferred.replicate, String(replicate));
  assert.equal(inferred.acqTime, undefined);
  return {id:filename,filename,metadata:{...emptyMetadata(),...inferred,experiment:'Synthetic independent replicates'},peaks:[{mz:100,intensity:replicate}],validLineCount:1,invalidLineCount:0,warnings:[]};
}));
const timeRows = processSpectra(timeFiles,ion,.5);
const unchangedTimes = JSON.stringify(timeRows);
const timeTrace = buildPlotData(timeRows,'activationTime','absolute',true,{...style,replicateMode:'individual'},.001)[0];
assert.equal(timeTrace.mode,'markers');
assert.equal(timeTrace.x.length,70);
assert.deepEqual([...new Set(timeTrace.x)],expectedMs.map(x=>x/1000));
assert.equal(hasRepeatedPlotCoordinates(timeRows,'activationTime'),true);
const means = aggregateReplicates(timeRows,'activationTime','absolute');
assert.deepEqual(means.warnings,[]);
assert.equal(means.rows.length,14);
assert.ok(means.rows.every(row=>row.statistics.n===5 && row.absoluteIntensity===3));
const meanTrace = buildPlotData(means.rows,'activationTime','absolute',true,style,.001)[0];
assert.equal(meanTrace.mode,'lines+markers');
assert.deepEqual(meanTrace.x,expectedMs.map(x=>x/1000));
assert.ok(meanTrace.error_y.array.every(sd=>Math.abs(sd-Math.sqrt(2.5))<1e-12));
assert.match(plotRowsToCsv(timeRows,'activationTime','absolute',.001,'Activation time (s)'),/Activation time \(s\),30,Absolute intensity,1,/);
const equivalent = [timeRows[0],{...timeRows[1],metadata:{...timeRows[1].metadata,activationTime:'0.001 s'}}];
assert.equal(aggregateReplicates(equivalent,'activationTime','absolute').rows[0].statistics.n,2);
assert.equal(buildPlotData(equivalent,'activationTime','absolute',true,{...style,curveMode:'movingAverage'})[0].mode,'markers');
assert.equal(movingAverageByRow(equivalent,'activationTime','absolute',3).size,0);
assert.match(plotRowsToCsv(equivalent,'activationTime','absolute',1,undefined,',',3),/Not applied: repeated x values/);
for(const axis of ['acqTime','activationTime']) {
  assert.equal(axisNumericValue('30 s',axis),30000);
  assert.equal(axisNumericValue('500 ms',axis),500);
  assert.equal(axisNumericValue('1 min',axis),60000);
  assert.equal(axisNumericValue('1.5e-3 s',axis),1.5);
  assert.equal(axisNumericValue('25',axis),25);
  for(const invalid of ['', 'unknown', '20 bananas', '-1 s']) assert.equal(axisNumericValue(invalid,axis),null);
}
assert.equal(axisNumericValue('500 ms','retentionTime'),.5);
assert.equal(axisNumericValue('1 min','retentionTime'),60);
assert.equal(inferMetadataFromFilename('FMN_280LED_ON__mean_g5.txt').replicate,undefined);
assert.equal(JSON.stringify(timeRows),unchangedTimes);
console.log('PASS: 70 mixed-unit catalog filenames, correct 0.001–60 s order, replicate suffixes, mean/SD, equivalent-time pooling, duplicate points without connecting/smoothing, CSV and source preservation.');
