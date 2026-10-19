/* Private cloud projects. Supabase JS 2.117.3; all writes require a signed-in user. */
(async () => {
 const site = document.currentScript.dataset.cloudSite;
 const el = (tag, text, parent) => { const n=document.createElement(tag); if(text)n.textContent=text; if(parent)parent.append(n); return n; };
 const panel=el('details'); panel.className='ms-cloud';
 const style=el('style');style.textContent='.ms-cloud{margin:16px;padding:12px 16px;border:1px solid #bdccc3;border-radius:10px;background:#f6faf7;color:#193629;font:14px system-ui}.ms-cloud summary{font-weight:650;cursor:pointer}.ms-cloud .cloud-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.ms-cloud button,.ms-cloud input,.ms-cloud select{font:inherit;padding:8px;border:1px solid #aabbb0;border-radius:5px;max-width:100%;background:white;color:#193629}.ms-cloud button{cursor:pointer}.ms-cloud button:disabled{opacity:.5;cursor:wait}.ms-cloud select{min-width:220px}.ms-cloud p{margin:8px 0}.ms-cloud [hidden]{display:none!important}';document.head.append(style);
 el('summary','My cloud projects & presets',panel);
 const description=el('p','Sign in to save here and open your projects on another computer. Local data stays on this computer until you choose to upload it.',panel);
 const status=el('p','Connecting…',panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const auth=el('form',null,panel);auth.className='cloud-row';
 const email=el('input',null,auth);email.type='email';email.placeholder='Email';email.autocomplete='username';email.required=true;email.setAttribute('aria-label','Cloud account email');
 const password=el('input',null,auth);password.type='password';password.placeholder='Password';password.autocomplete='current-password';password.required=true;password.minLength=8;password.setAttribute('aria-label','Cloud account password');
 const login=el('button','Sign in',auth);login.type='submit';
 const signup=el('button','Create account',auth);signup.type='button';
 const reset=el('button','Reset password',auth);reset.type='button';
 const tools=el('div',null,panel);tools.hidden=true;
 const accountRow=el('div',null,tools);accountRow.className='cloud-row';const account=el('span',null,accountRow);const logout=el('button','Sign out',accountRow);logout.type='button';
 const row=el('div',null,tools);row.className='cloud-row';
 const name=el('input',null,row);name.placeholder='Project or preset set name';name.maxLength=160;name.setAttribute('aria-label','Cloud item name');
 const save=el('button','Save project to cloud',row);
 const copy=el('button','Save as new copy',row);
 const presets=el('button','Save preset set to cloud',row);
 const imports=el('button','Import saved browser projects',tools);imports.hidden=site!=='ms-generator';
 const listRow=el('div',null,tools);listRow.className='cloud-row';
 const select=el('select',null,listRow);select.setAttribute('aria-label','Your cloud projects and preset sets');
 const open=el('button','Open selected',listRow);const refresh=el('button','Refresh list',listRow);
 el('p','Save explicitly after editing. Saving a project includes its data and settings; presets are saved as a separate set. RAW source files are not uploaded.',tools);
 if (window.MSWorkspaceMenu) window.MSWorkspaceMenu.mount(panel, 'cloud');
 else document.body.append(panel);
 let client,user=null,busy=false,opened=null,epoch=0,recovery=false;
 let editorEpoch=0;
 window.addEventListener('ms-project-new',()=>{
  editorEpoch++;opened=null;name.value='';select.value='';
  if(user)message('New local project. Its first cloud save will create a new cloud item.');
 });
 function message(s){status.textContent=s;}
 function adapter(){if(!window.MSCloudAdapter)throw Error('The editor is still loading. Try again in a moment.');return window.MSCloudAdapter;}
 function check(result){if(result.error)throw result.error;return result.data;}
 function guard(uid){if(user?.id!==uid)throw Error('Your account changed. Please try again.');}
 function title(fallback){const v=name.value.trim()||fallback||'Untitled project';if(v.length>160)throw Error('Use a name of 160 characters or fewer.');return v;}
 function sized(payload){if(new Blob([JSON.stringify(payload)]).size>19*1024*1024)throw Error('This project is too large for cloud saving (19 MB limit). Use Save project file instead.');return payload;}
 async function run(fn){if(busy)return;busy=true;panel.querySelectorAll('button').forEach(n=>n.disabled=true);try{await fn();}catch(e){message(e.message||'Could not complete the request. Your local data was not removed.');}finally{busy=false;panel.querySelectorAll('button').forEach(n=>n.disabled=false);}}
 async function listing(){
  if(!user)return;const uid=user.id;let rows=[];
  for(let from=0;;from+=200){const data=check(await client.from('ms_cloud_items').select('id,name,kind,revision,updated_at').eq('app',site).order('updated_at',{ascending:false}).range(from,from+199));guard(uid);rows.push(...data);if(data.length<200)break;}
  const selected=select.value;select.replaceChildren();const blank=el('option',rows.length?'Choose a cloud project or preset set':'No cloud items yet',select);blank.value='';
  rows.forEach(item=>{const o=el('option',`${item.kind==='project'?'Project':'Presets'} · ${item.name} · ${new Date(item.updated_at).toLocaleString()}`,select);o.value=item.id;});
  if(rows.some(r=>r.id===selected))select.value=selected;
 }
 async function insert(kind,itemName,payload,sourceId=null){
  if(!user)throw Error('Sign in first.');const uid=user.id;
  const data=check(await client.from('ms_cloud_items').insert({user_id:uid,app:site,kind,name:itemName,payload:sized(payload),source_id:sourceId}).select('id,revision,kind').single());guard(uid);return data;
 }
 async function saveProject(asCopy=false){
  const a=adapter(),payload=a.getCurrentProject(),itemName=title(payload.projectName||payload.name);const uid=user.id,started=editorEpoch;let saved;
  if(opened?.kind==='project'&&!asCopy){
   const data=check(await client.from('ms_cloud_items').update({name:itemName,payload:sized(payload)}).eq('id',opened.id).eq('revision',opened.revision).select('id,revision,kind'));guard(uid);
   if(data.length!==1)throw Error('This cloud project changed on another device. Open the latest version, or Save as new copy to preserve your edits.');saved=data[0];
  }else saved=await insert('project',itemName,payload);
  if(started!==editorEpoch)return;
  opened=saved;
  await listing();if(started!==editorEpoch)return;select.value=opened.id;message('Project saved in your cloud account at '+new Date().toLocaleTimeString()+'.');
 }
 auth.addEventListener('submit',e=>{e.preventDefault();run(async()=>{const data=check(await client.auth.signInWithPassword({email:email.value.trim(),password:password.value}));password.value='';user=data.user;tools.hidden=false;auth.hidden=true;account.textContent=user.email;await listing();message('Signed in. Your cloud projects are ready.');});});
 signup.onclick=()=>{if(!auth.reportValidity())return;run(async()=>{const data=check(await client.auth.signUp({email:email.value.trim(),password:password.value,options:{emailRedirectTo:location.origin+'/'}}));password.value='';message(data.session?'Account created and signed in.':'Check your email to confirm your account, then return here and sign in.');});};
 reset.onclick=()=>{if(!email.reportValidity()||!email.value)return;run(async()=>{check(await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:location.origin+'/'}));message('Check your email for the password reset link.');});};
 logout.onclick=()=>run(async()=>{check(await client.auth.signOut({scope:'local'}));user=null;opened=null;select.replaceChildren();tools.hidden=true;auth.hidden=false;message('Signed out. Local editor data was kept on this computer.');});
 save.onclick=()=>run(()=>saveProject(false));copy.onclick=()=>run(()=>saveProject(true));
 presets.onclick=()=>run(async()=>{const item=await insert('presets',title('My presets'),adapter().getPresets());await listing();select.value=item.id;message('Preset set saved to your cloud account.');});
 imports.onclick=()=>run(async()=>{
  const records=adapter().getSavedProjects();if(!records.length){message('No saved browser projects found at this address.');return;}
  if(!confirm(`Upload ${records.length} saved browser project(s) to this account? Existing cloud projects and local copies will be kept.`))return;
  const uid=user.id;let added=0,skipped=0;
  for(const p of records){guard(uid);const text=JSON.stringify(p);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
   const result=await client.from('ms_cloud_items').insert({user_id:uid,app:site,kind:'project',name:String(p.name||'Imported project').slice(0,160),payload:sized(p),source_id:'browser:'+hash});
   if(result.error?.code==='23505')skipped++;else {check(result);added++;}
   message(`Imported ${added}; already present ${skipped}. Local copies kept.`);
  }await listing();message(`Import complete: ${added} added, ${skipped} already present. Local copies kept.`);
 });
 open.onclick=()=>run(async()=>{
  if(!select.value)return;const uid=user.id,started=editorEpoch;
  const item=check(await client.from('ms_cloud_items').select('*').eq('id',select.value).eq('app',site).single());guard(uid);
  if(started!==editorEpoch)return;
  if(!confirm(item.kind==='project'?'Open this cloud project and replace the current editor contents? Save current edits first.':'Load this preset set into this browser? Current presets will be retained in a local recovery copy.'))return;
  if(item.kind==='project'){await adapter().loadProject(item.payload);opened={id:item.id,revision:item.revision,kind:item.kind};name.value=item.name;}
  else {adapter().loadPresets(item.payload);}
  message(item.kind==='project'?'Cloud project opened. Save to cloud after editing.':'Cloud preset set loaded. Your previous presets are in the browser recovery copy.');
 });
 refresh.onclick=()=>run(async()=>{await listing();message('Cloud list refreshed.');});
 try{
  const config=await fetch('/cloud-config.json').then(r=>{if(!r.ok)throw Error('Cloud configuration unavailable.');return r.json();});
  if(!window.supabase)throw Error('The cloud sign-in library did not load. Local editing is still available.');
  client=window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'ms-cloud-auth-v1',flowType:'implicit'}});
  client.auth.onAuthStateChange((event,session)=>{
   if(user?.id !== session?.user?.id) opened=null;user=session?.user||null;const current=++epoch;tools.hidden=!user;auth.hidden=!!user;account.textContent=user?.email||'';
   if(event==='SIGNED_OUT'){opened=null;select.replaceChildren();}
   if(event==='PASSWORD_RECOVERY'){
    recovery=true;tools.hidden=true;auth.hidden=true;
    const form=el('form',null,panel);form.className='cloud-row';const p=el('input',null,form);p.type='password';p.minLength=8;p.required=true;p.autocomplete='new-password';p.placeholder='New password';p.setAttribute('aria-label','New password');el('button','Set new password',form);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{check(await client.auth.updateUser({password:p.value}));p.value='';form.remove();recovery=false;tools.hidden=false;message('Password updated.');});};
   }
   if(user)setTimeout(()=>{if(current===epoch)run(async()=>{await listing();if(!recovery)message('Signed in. Cloud projects are private to your account.');});},0);
  });
  const session=check(await client.auth.getSession()).session;user=session?.user||null;
  if(!user)message('Sign in or create an account to save projects online. Use the same account on both sites.');
 }catch(e){message(e.message);auth.querySelectorAll('button').forEach(n=>n.disabled=true);}
})();
