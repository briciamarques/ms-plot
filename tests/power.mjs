import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {zipSync, strToU8} from 'fflate';
const output = path.resolve('node_modules/.tmp/power-tests');
for (const name of ['types','utils/id','utils/project','utils/powerCalibration','utils/plot','utils/processing','utils/bruker','utils/colorPalettes','utils/format','utils/filenameMetadata','utils/csv','utils/replicates']) {
  const code = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020}}).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.mjs"');
  const target = path.join(output, `${name}.mjs`); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, code);
}
const load = name => import(pathToFileURL(path.join(output, `${name}.mjs`)));
const {parsePowerCsv, readPowerUploads, defaultPowerCalibration, summarizePower, matchPower, calibratedFiles, validatePowerCalibration} = await load('utils/powerCalibration');
const {createProjectSnapshot, createEmptyProject, parseProjectSnapshot} = await load('utils/project');
const {rowsForPlotAxis, buildPlotData} = await load('utils/plot');
const {processedRowsToCsv, plotRowsToCsv} = await load('utils/csv');
const {aggregateReplicates} = await load('utils/replicates');
const {emptyMetadata} = await load('types');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const csv = (powers, interval = 1) => `Optical Parameter Monitor\nSample Interval , ${interval} s\nWavelength / Responsivity, 280 nm\nSamples,Date,Time,Power (W),Current (A)\n${powers.map((p,i) => `${i},01/01/2026,10:00:00,${p},999`).join('\n')}\n`;
const records = [
  parsePowerCsv('280nm_background_1s_1.csv', csv([.001,.003])),
  parsePowerCsv('280nm_background_1s_2.csv', csv([.004])),
  parsePowerCsv('280nm_0mA_1s_1.csv', csv([.002])),
  parsePowerCsv('280nm_100mA_1s_1.csv', csv([.01,.02])),
  parsePowerCsv('280nm_100mA_1s_2.csv', csv([.025])),
  parsePowerCsv('280nm_500mA_10s_1.csv', csv([.2],10)),
];
const config = {...defaultPowerCalibration(records), enabled: true};
const summary = summarizePower(config);
near(summary.backgroundMw, 3); // Equal weight per file; not pooled samples.
assert.equal(summary.points.length, 2);
near(summary.points[0].powerMw, -1); // Negative background-corrected values retained.
near(summary.points[1].rawMw, 20);
near(summary.points[1].powerMw, 17);
near(summary.points[1].sdMw, Math.sqrt(50));
assert.equal(summary.points[1].n, 2);
assert.equal(summary.points[1].samples, 3);
assert.equal(summarizePower({...config, intervalSeconds:10}).points[0].currentMa, 500);
assert.ok(summarizePower({...config, backgroundIntervalSeconds:10}).error);
assert.equal(summarizePower({...config, subtractBackground:false, backgroundIntervalSeconds:10}).error, '');
const file = {id:'f', filename:'synthetic.txt', metadata:{...emptyMetadata(), current:'100', wavelength:'280 nm', replicate:'1'}, peaks:[{mz:751,intensity:20}], validLineCount:1, invalidLineCount:0, warnings:[]};
near(matchPower(file, config).powerMw, 17);
assert.ok('reason' in matchPower({...file,metadata:{...file.metadata,current:''}},config));
assert.ok('reason' in matchPower({...file,metadata:{...file.metadata,wavelength:''}},config));
near(matchPower({...file,metadata:{...file.metadata,wavelength:''}},{...config,assumeWavelength:true}).powerMw,17);
assert.ok('reason' in matchPower({...file,metadata:{...file.metadata,wavelength:'365'}},{...config,assumeWavelength:true}));
assert.ok('reason' in matchPower({...file,metadata:{...file.metadata,current:'50'}},config));
near(matchPower({...file,metadata:{...file.metadata,current:'50'}},{...config,interpolate:true}).powerMw,8);
assert.ok('reason' in matchPower({...file,metadata:{...file.metadata,current:'101'}},{...config,interpolate:true}));
assert.ok('reason' in matchPower(file,{...config,backgroundIntervalSeconds:10}));
const derived = calibratedFiles([file], config)[0];
near(Number(derived.metadata.opticalPower),17);
assert.equal(file.metadata.opticalPower,''); // Original spectrum unchanged.
assert.ok(derived.metadata.powerCalibration.includes('background 3 mW'));
assert.equal(calibratedFiles([file], {...config, enabled:false})[0],file);
const project = {...createProjectSnapshot('test',[file],[],.5,['f']), powerCalibration:config,plotSettings:{xAxis:'opticalPower'}};
assert.deepEqual(parseProjectSnapshot(JSON.stringify(project)).powerCalibration,config);
assert.equal(createEmptyProject().powerCalibration, undefined);
assert.throws(()=>validatePowerCalibration({...config,measurements:[records[0],records[0]]}),/duplicada/);
assert.throws(()=>parseProjectSnapshot(JSON.stringify({...project,powerCalibration:{...config,enabled:'yes'}})),/Invalid project/);
assert.throws(()=>parsePowerCsv('wrong.csv',csv([1])),/nomes/);
assert.throws(()=>parsePowerCsv('280nm_1mA_1s_1.csv',csv([1],10)),/intervalo/);
assert.throws(()=>parsePowerCsv('280nm_1mA_1s_1.csv',csv([1]).replace('Power (W)','Power (dBm)')),/Power/);
assert.throws(()=>parsePowerCsv('280nm_1mA_1s_1.csv',csv(['NaN'])),/inválida/);
near(parsePowerCsv('280nm_1mA_1s_1.csv',csv(['1.2E-5'])).powersW[0],.000012);
near(parsePowerCsv('280nm_1mA_1s_1.csv',csv(['1.2E-5']).replaceAll(',',';').replace('1.2E-5','"1,2E-5"')).powersW[0],.000012);
const zip = zipSync({'folder/280nm_100mA_1s_1.csv':strToU8(csv([.01])), 'ignored.md':strToU8('ignore')});
assert.equal((await readPowerUploads([new File([zip],'input.zip')]))[0].currentMa,100);
await assert.rejects(()=>readPowerUploads([new File([zip],'a.zip'),new File([zip],'b.zip')]),/duplicada/);
const row = {id:'r',fileId:'f',ionId:'i',filename:'synthetic',metadata:derived.metadata,targetMz:751,foundMz:751,label:'parent',absoluteIntensity:20,relativeIntensity:100,selectedIonPercent:100,warning:''};
const missing = {...row,id:'missing',fileId:'missing',metadata:{...row.metadata,opticalPower:''}};
assert.equal(rowsForPlotAxis([row,missing],'opticalPower').length,1);
assert.deepEqual(buildPlotData([row,missing],'opticalPower','absolute',true,{colors:{},lineWidth:2,markerSize:5,curveMode:'connect'})[0].x,[17]);
assert.ok(processedRowsToCsv([row]).includes('optical power (mW)'));
assert.ok(plotRowsToCsv([row,missing],'opticalPower','absolute').includes('Optical power,17'));
const reps = aggregateReplicates([row,{...row,id:'r2',fileId:'f2',absoluteIntensity:30,metadata:{...row.metadata,replicate:'2'}}],'opticalPower','absolute');
assert.equal(reps.rows.length,1);
assert.equal(reps.rows[0].absoluteIntensity,25);
const otherCurrent = {...row,id:'other',fileId:'other',metadata:{...row.metadata,current:'50',opticalPower:'8'}};
const curve = aggregateReplicates([row,otherCurrent],'opticalPower','absolute');
assert.equal(curve.rows[0].seriesId,curve.rows[1].seriesId);
assert.equal(buildPlotData(curve.rows,'opticalPower','absolute',true,{colors:{},lineWidth:2,markerSize:5,curveMode:'connect'})[0].x.length,2);
assert.equal(aggregateReplicates([row,{...otherCurrent,metadata:{...otherCurrent.metadata,opticalPower:'17'}}],'opticalPower','absolute').rows.length,2);
console.log('PASS: power parsing/ZIP, means/background/SD, intervals, matching/interpolation, project persistence, plot/CSV and replicates.');

// Optional local source audit. No experimental files are copied into the repository.
if (process.argv[2]) {
  const bytes = fs.readFileSync(process.argv[2]);
  const actual = await readPowerUploads([new File([bytes],'measurements.zip')]);
  const calibration = defaultPowerCalibration(actual);
  console.log(JSON.stringify({files:actual.length,summary:summarizePower(calibration)},null,2));
}
