const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');const source=fs.readFileSync(fs.existsSync(path.join(root,'public/cloud-presets.js'))?path.join(root,'public/cloud-presets.js'):path.join(root,'cloud-presets.js'),'utf8');
for(const site of ['ms-plot','ms-generator']){
 const store=new Map();let fail=false,events=0;
 const ctx={document:{currentScript:{dataset:{cloudSite:site}}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail){fail=false;throw Error('quota')}store.set(k,v)},removeItem:k=>store.delete(k)},window:{dispatchEvent(){events++}},Event:class{},Date};vm.runInNewContext(source,ctx);
 const api=ctx.window.MSCloudPresets,key=site==='ms-plot'?'pd-ms-plot-style-presets-v1':'msGeneratorJournalPresets';
 store.set(key,'[{"name":"Original","id":"a"}]');const old=api.read(),next=JSON.parse(JSON.stringify(old));next.stores[key]=[{name:'Cloud',id:'b'}];api.restore(next);assert.equal(JSON.parse(store.get(key))[0].name,'Cloud');assert.equal(events,1);
 const recovery=[...store.keys()].find(k=>k.startsWith('msCloudPresetRecovery'));assert.equal(JSON.parse(JSON.parse(store.get(recovery))[key])[0].name,'Original');
 assert.throws(()=>api.restore({...next,site:'wrong'}));assert.equal(JSON.parse(store.get(key))[0].name,'Cloud');
 fail=true;assert.throws(()=>api.restore(old),/quota/);assert.equal(JSON.parse(store.get(key))[0].name,'Cloud');
 const malformed=JSON.parse(JSON.stringify(next));malformed.stores[key]='bad';assert.throws(()=>api.restore(malformed),/Invalid/);assert.equal(JSON.parse(store.get(key))[0].name,'Cloud');
}
console.log('PASS: cloud preset restore, local recovery, site/schema rejection and storage-failure preservation');
