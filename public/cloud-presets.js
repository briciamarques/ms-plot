(() => {
 const site=document.currentScript.dataset.cloudSite;
 const keys=site==='ms-generator'?['msGeneratorJournalPresets','msGeneratorFigureStylePresets','msGeneratorPresetDefaults']:['pd-ms-plot-style-presets-v1'];
 const read=()=>({version:1,site,stores:Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k)||'null')]))});
 function restore(data){
  if(!data||data.version!==1||data.site!==site||!data.stores||Object.keys(data.stores).length!==keys.length||keys.some(k=>!Object.hasOwn(data.stores,k)))throw Error('Invalid preset set for this site.');
  keys.forEach(k=>{const v=data.stores[k];if(v===null)return;
   const valid=k==='msGeneratorPresetDefaults'?v&&typeof v==='object'&&!Array.isArray(v):k==='msGeneratorFigureStylePresets'?Array.isArray(v)||(v&&Array.isArray(v.presets)):Array.isArray(v);
   if(!valid)throw Error('Invalid presets: '+k);
  });
  const before=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
  const recoveryKey='msCloudPresetRecovery:'+site+':'+Date.now();
  // Keep the previous set before changing anything; abort if storage is full.
  localStorage.setItem(recoveryKey,JSON.stringify(before));
  try { keys.forEach(k=>{const v=data.stores[k];if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}); }
  catch(e){keys.forEach(k=>before[k]===null?localStorage.removeItem(k):localStorage.setItem(k,before[k]));throw e;}
  window.dispatchEvent(new Event('ms-cloud-presets-loaded'));
 }
 window.MSCloudPresets={read,restore};
})();
