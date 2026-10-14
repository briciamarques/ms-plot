const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
function setup(site,initial={}) {
 const nodes=[],storage={...initial};let reloaded=false,failKey=null,downloaded;
 function element(tag){const e={tag,style:{},handlers:{},append(){},setAttribute(){},addEventListener(n,f){this.handlers[n]=f},click(){},remove(){}};nodes.push(e);return e;}
 const context={document:{currentScript:{dataset:{backupSite:site}},createElement:element,body:{append(){}}},localStorage:{getItem:k=>storage[k]??null,setItem(k,v){if(k===failKey) {failKey=null;throw Error('Quota exceeded')}storage[k]=v},removeItem:k=>delete storage[k]},window:{confirm:()=>true,location:{reload(){reloaded=true}}},URL:{createObjectURL(blob){downloaded=blob;return 'blob:test'},revokeObjectURL(){}},Blob,setTimeout:()=>{}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../public/browser-backup.js'),'utf8'),context);
 const input=nodes.find(n=>n.tag==='input'),status=nodes.find(n=>n.handlers===undefined)||nodes.filter(n=>n.tag==='p').at(-1);
 return {storage,nodes,status,get reloaded(){return reloaded},set failKey(k){failKey=k},async restore(data){input.files=[{text:async()=>JSON.stringify(data)}];await input.handlers.change()},async backup(){nodes.find(n=>n.textContent==='Download saved-data backup').handlers.click();return JSON.parse(await downloaded.text())}};
}
(async()=>{
 const initial={msGeneratorProjects:JSON.stringify([{id:'p1',name:'FMN',spectra:[{data:'257 100'}]}]),msGeneratorFigureStylePresets:JSON.stringify({version:1,presets:[{name:'JASMS'}]})};
 const source=setup('ms-generator',initial),backup=await source.backup();assert.deepEqual(source.storage,initial);
 const target=setup('ms-generator');await target.restore(backup);assert.deepEqual(target.storage,initial);assert(target.reloaded);
 const conflict=setup('ms-generator',{msGeneratorProjects:'[{"id":"keep"}]'});await conflict.restore(backup);assert.equal(conflict.storage.msGeneratorProjects,'[{"id":"keep"}]');assert(!conflict.reloaded);
 const wrong=setup('ms-plot');await wrong.restore(backup);assert.deepEqual(wrong.storage,{});assert(!wrong.reloaded);
 const malformed=setup('ms-generator');await malformed.restore({...backup,storage:{...backup.storage,msGeneratorProjects:'{}'}});assert.deepEqual(malformed.storage,{});
 const quota=setup('ms-generator');quota.failKey='msGeneratorFigureStylePresets';await quota.restore(backup);assert.deepEqual(quota.storage,{});assert(!quota.reloaded);
 const p=setup('ms-plot',{'pd-ms-plot-style-presets-v1':'[{"id":"a","name":"Style","settings":{}}]'});const pb=await p.backup(),pt=setup('ms-plot');await pt.restore(pb);assert.deepEqual(pt.storage,p.storage);assert(pt.reloaded);
 console.log('PASS: backups round-trip for both sites; source unchanged; conflicts, wrong site, malformed input and quota rollback verified.');
})();
