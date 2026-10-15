/* Compact, shared home for cloud projects and portable backups. */
(() => {
  const host = document.createElement('div');
  host.id = 'ms-workspace-menu';
  const style = document.createElement('style');
  style.textContent = `
    #ms-workspace-menu{position:fixed;right:16px;bottom:16px;z-index:1000;font:14px/1.5 system-ui;color:#193629}
    #ms-workspace-menu *{box-sizing:border-box}
    #ms-workspace-menu .workspace-toggle{display:block;margin:0 0 0 auto;min-height:40px;padding:8px 15px;border:1px solid #bdccc3;border-radius:20px;background:#fff;color:#193629;font:600 14px system-ui;cursor:pointer;box-shadow:0 3px 14px #19362920}
    #ms-workspace-menu .workspace-content{position:absolute;right:0;bottom:50px;width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;overscroll-behavior:contain;padding:12px;background:#fff;border:1px solid #bdccc3;border-radius:12px;box-shadow:0 8px 32px #19362930}
    #ms-workspace-menu [hidden]{display:none!important}
    #ms-workspace-menu .workspace-content>details{margin:0!important;padding:12px!important;border:0!important;border-radius:6px!important;font:14px/1.5 system-ui!important}
    #ms-workspace-menu .workspace-content>details+details{margin-top:8px!important;border-top:1px solid #dce5df!important}
    #ms-workspace-menu summary{cursor:pointer;font-weight:600;list-style:disclosure-closed}
    #ms-workspace-menu details[open]>summary{list-style:disclosure-open}
    #ms-workspace-menu button,#ms-workspace-menu input,#ms-workspace-menu select{max-width:100%;font:inherit}
    #ms-workspace-menu .cloud-row>input,#ms-workspace-menu .cloud-row>select{width:100%;min-width:0}
    #ms-workspace-menu p{overflow-wrap:anywhere}
    #ms-workspace-menu :focus-visible{outline:2px solid #245e45;outline-offset:3px}
    @media print{#ms-workspace-menu{display:none}}
  `;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'workspace-toggle';
  toggle.textContent = '☰ Menu';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'ms-workspace-content');
  toggle.setAttribute('aria-label', 'Projects, presets and backup menu');
  const content = document.createElement('div');
  content.id = 'ms-workspace-content';
  content.className = 'workspace-content';
  content.hidden = true;
  const close = (restoreFocus = false) => {
    content.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
  });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(true); event.stopPropagation(); }
  });
  document.addEventListener('click', event => {
    if (!host.contains(event.target)) close();
  });
  // Keep the trigger first in keyboard order, even though the panel opens above it.
  host.append(toggle, content);
  document.body.append(host);
  window.MSWorkspaceMenu = {
    mount(panel, section) {
      if (section === 'cloud') { panel.open = true; content.prepend(panel); }
      else content.append(panel);
    }
  };
})();
