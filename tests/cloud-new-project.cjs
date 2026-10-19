const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

async function setup() {
  const nodes = [], listeners = {}, writes = [], loaded = [];
  let holdNextWrite, holdNextRead;
  const element = tag => {
    const node = {tag, value: '', textContent: '', append() {}, prepend() {}, setAttribute() {}, addEventListener() {},
      querySelectorAll: () => [], replaceChildren() {}, reportValidity: () => true};
    nodes.push(node); return node;
  };
  const client = {
    auth: {onAuthStateChange() {}, getSession: async () => ({data: {session: {user: {id: 'user-1'}}}})},
    from() {
      const query = {operation: 'select', payload: null, one: false,
        select() {return this}, eq() {return this}, order() {return this}, range() {return this},
        single() {this.one = true; return this},
        insert(payload) {this.operation = 'insert'; this.payload = payload; return this},
        update(payload) {this.operation = 'update'; this.payload = payload; return this},
        async then(resolve, reject) {
          try {
            if (this.operation !== 'select') {
              writes.push({operation: this.operation, payload: this.payload});
              const pending = holdNextWrite; holdNextWrite = undefined; if (pending) await pending;
              const record = {id: 'saved-item', revision: 2, kind: 'project'};
              return resolve({data: this.operation === 'update' ? [record] : record});
            }
            if (this.one) {
              const pending = holdNextRead; holdNextRead = undefined; if (pending) await pending;
              return resolve({data: {id: 'old-item', kind: 'project', revision: 1, name: 'Previous', payload: {projectName: 'Previous'}}});
            }
            return resolve({data: []});
          } catch (error) {return reject(error)}
        },
      }; return query;
    },
  };
  const context = {document: {currentScript: {dataset: {cloudSite: 'ms-plot'}}, createElement: element, head: {append() {}}, body: {append() {}}},
    window: {supabase: {createClient: () => client}, addEventListener: (name, handler) => {listeners[name] = handler},
      MSCloudAdapter: {getCurrentProject: () => ({projectName: 'New local project'}), loadProject: p => loaded.push(p)}},
    fetch: async () => ({ok: true, json: async () => ({url: 'test', publishableKey: 'test'})}),
    confirm: () => true, Blob, Date, setTimeout, location: {origin: 'https://test.invalid'}};
  await vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/cloud-workspace.js'), 'utf8'), context);
  const button = text => nodes.find(node => node.textContent === text);
  const select = nodes.find(node => node.tag === 'select');
  return {writes, loaded, newProject: () => listeners['ms-project-new'](),
    open: () => {select.value = 'old-item'; return button('Open selected').onclick()},
    save: () => button('Save project to cloud').onclick(),
    pauseWrite: () => new Promise(resolve => {holdNextWrite = new Promise(release => resolve(release))}),
    pauseRead: () => new Promise(resolve => {holdNextRead = new Promise(release => resolve(release))})};
}

(async () => {
  const normal = await setup(); await normal.open(); await normal.save();
  assert.equal(normal.writes[0].operation, 'update');
  normal.newProject(); await normal.save(); assert.equal(normal.writes[1].operation, 'insert');
  const pending = await setup(); const release = await pending.pauseWrite(); const saving = pending.save();
  await Promise.resolve(); pending.newProject(); release(); await saving; await pending.save();
  assert.deepEqual(pending.writes.map(write => write.operation), ['insert', 'insert']);
  const reading = await setup(); const releaseRead = await reading.pauseRead(); const opening = reading.open();
  await Promise.resolve(); reading.newProject(); releaseRead(); await opening;
  assert.equal(reading.loaded.length, 0);
  console.log('PASS: New creates a separate cloud item; pending saves cannot rebind it and pending opens cannot replace it.');
})().catch(error => {console.error(error); process.exitCode = 1});
