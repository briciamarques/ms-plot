/* Portable backup of this site's saved browser data. No network requests. */
(() => {
  const site = document.currentScript.dataset.backupSite;
  const keys = site === 'ms-generator'
    ? ['msGeneratorProjects', 'msGeneratorJournalPresets', 'msGeneratorFigureStylePresets', 'msGeneratorPresetDefaults']
    : ['pd-ms-plot-style-presets-v1'];
  const snapshot = () => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
  const isEmpty = value => {
    if (value === null) return true;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length === 0
        : parsed && typeof parsed === 'object' && (Object.keys(parsed).length === 0 ||
          (Object.keys(parsed).every(key => ['version', 'presets'].includes(key)) && Array.isArray(parsed.presets) && parsed.presets.length === 0));
    } catch { return false; }
  };
  function validate(data) {
    if (!data || data.format !== 'ms-browser-backup' || data.version !== 1 || data.site !== site ||
        !data.storage || Array.isArray(data.storage) || typeof data.storage !== 'object' ||
        Object.keys(data.storage).length !== keys.length || keys.some(key => !Object.hasOwn(data.storage, key))) {
      throw new Error('This is not a compatible backup for ' + site + '.');
    }
    for (const key of keys) {
      const value = data.storage[key];
      if (value === null) continue;
      if (typeof value !== 'string') throw new Error('Invalid backup entry: ' + key);
      const parsed = JSON.parse(value);
      const objectStore = key === 'msGeneratorPresetDefaults';
      const styleStore = key === 'msGeneratorFigureStylePresets';
      if (objectStore ? !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          : styleStore ? !(Array.isArray(parsed) || (parsed && Array.isArray(parsed.presets)))
          : !Array.isArray(parsed)) throw new Error('Invalid backup entry: ' + key);
    }
    return data.storage;
  }
  const panel = document.createElement('details');
  panel.style.cssText = 'margin:16px;padding:12px;border:1px solid #aaa;border-radius:8px;background:#fff;color:#222;font:14px system-ui;';
  const summary = document.createElement('summary');
  summary.textContent = 'Backup and transfer saved data';
  panel.append(summary);
  const note = document.createElement('p');
  note.textContent = site === 'ms-generator'
    ? 'Download all saved projects, custom presets and defaults from this browser. First use Save project for current edits. Keep the backup in your own Drive or OneDrive; this is a manual backup, not automatic sync.'
    : 'Download all saved style presets from this browser. Save your current data separately using Project → Save project file. Keep both files in your own Drive or OneDrive; this is a manual backup, not automatic sync.';
  panel.append(note);
  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'Download saved-data backup';
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.textContent = 'Restore saved-data backup';
  for (const button of [download, restore]) button.style.cssText = 'margin:4px;padding:8px;cursor:pointer;';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  panel.append(download, restore, input, status);
  document.body.append(panel);
  download.addEventListener('click', () => {
    try {
      const storage = snapshot();
      const data = { format: 'ms-browser-backup', version: 1, site, createdAt: new Date().toISOString(), storage };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = site + '-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = Object.values(storage).every(isEmpty)
        ? 'Backup downloaded, but no saved data was found at this address in this browser. Current unsaved edits are not included.'
        : 'Backup downloaded. Move it to your Drive or OneDrive. Current unsaved edits are not included.';
    } catch (error) { status.textContent = 'Could not create backup: ' + error.message; }
  });
  restore.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0]; input.value = ''; if (!file) return;
    try {
      const incoming = validate(JSON.parse(await file.text()));
      const before = snapshot();
      const changes = keys.filter(key => incoming[key] !== null && incoming[key] !== before[key]);
      if (!changes.length) { status.textContent = 'No new saved data to restore.'; return; }
      if (changes.some(key => !isEmpty(before[key]))) {
        throw new Error('This browser already has different saved data. Nothing was changed. Restore in an empty browser profile to avoid overwriting it.');
      }
      if (!window.confirm('Restore saved data and reload this page? Save any current edits first.')) return;
      try {
        for (const key of changes) localStorage.setItem(key, incoming[key]);
      } catch (error) {
        for (const key of changes) {
          if (before[key] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, before[key]);
        }
        throw error;
      }
      window.location.reload();
    } catch (error) { status.textContent = 'Could not restore backup: ' + error.message; }
  });
})();
