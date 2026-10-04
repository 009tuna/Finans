/* Workspace layout preferences are independent of market data and routing. */
(() => {
  'use strict';
  const root = document.documentElement;
  const content = document.getElementById('content');
  const navButton = document.getElementById('navCollapse');
  const focusButton = document.getElementById('focusWorkspace');
  if (!content || !navButton) return;

  function readPreference(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  }
  function savePreference(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Preferences are optional. */ }
  }
  let navCompact = readPreference('finans-nav-compact', false) === true;
  const savedPanels = readPreference('finans-aux-panels', {});
  const panelPreferences = savedPanels && typeof savedPanels === 'object' && !Array.isArray(savedPanels) ? savedPanels : {};
  let focusMode = false;
  let activePanel = null;
  let scheduled = false;
  const panels = [
    { key: 'overview', selector: '.overview-context', parent: '.overview-workspace', title: 'Piyasa bağlamı' },
    { key: 'report', selector: '.report-source-rail', parent: '.report-layout', title: 'Kaynaklar' },
    { key: 'portfolio', selector: '.portfolio-primary-grid > .card:last-child', parent: '.portfolio-primary-grid', title: 'Varlık düzenle' },
  ];
  const panelIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16m-7-11 3 3-3 3"/></svg>';

  document.querySelectorAll('.navitem').forEach((button) => {
    const label = Array.from(button.childNodes).filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
    if (!label) return;
    const span = document.createElement('span');
    span.className = 'nav-label';
    span.textContent = label;
    Array.from(button.childNodes).filter((node) => node.nodeType === 3).forEach((node) => node.remove());
    button.appendChild(span);
    button.setAttribute('aria-label', label);
    button.title = label;
  });

  function setNavState() {
    const compact = focusMode || navCompact;
    root.dataset.navCompact = String(compact);
    navButton.setAttribute('aria-expanded', String(!compact));
    const label = compact ? 'Sol menüyü genişlet' : 'Sol menüyü daralt';
    navButton.setAttribute('aria-label', label);
    navButton.title = label;
    if (focusButton) {
      focusButton.setAttribute('aria-pressed', String(focusMode));
      focusButton.textContent = focusMode ? 'Odaktan çık' : 'Odaklan';
      focusButton.title = focusMode ? 'Önceki panel düzenine dön' : 'Yan panelleri daralt';
    }
  }

  function setPanelState(panel, config) {
    const collapsed = focusMode || panelPreferences[config.key] === true;
    const parent = panel.closest(config.parent);
    parent.classList.add('panel-layout-right');
    parent.classList.toggle('aux-is-collapsed', collapsed);
    panel.classList.add('aux-panel');
    panel.classList.toggle('is-collapsed', collapsed);
    const button = panel.querySelector('.aux-panel-toggle');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', config.title + (collapsed ? ' panelini aç' : ' panelini daralt'));
    button.title = button.getAttribute('aria-label');
    // A collapse initiated outside the panel must not strand keyboard focus.
    if (collapsed && panel.contains(document.activeElement) && document.activeElement !== button) button.focus({ preventScroll: true });
  }

  function mountPanel(panel, config) {
    if (panel.querySelector('.aux-panel-heading')) return;
    const heading = document.createElement('div');
    heading.className = 'aux-panel-heading';
    const title = document.createElement('span');
    title.className = 'aux-panel-title';
    title.textContent = config.title;
    const button = document.createElement('button');
    button.className = 'panel-control aux-panel-toggle';
    button.type = 'button';
    button.innerHTML = panelIcon;
    panel.id = 'aux-panel-' + config.key;
    button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => {
      if (focusMode) focusMode = false;
      panelPreferences[config.key] = !panel.classList.contains('is-collapsed');
      savePreference('finans-aux-panels', panelPreferences);
      syncLayout();
    });
    heading.append(title, button);
    panel.prepend(heading);
  }

  function syncLayout() {
    scheduled = false;
    activePanel = null;
    panels.forEach((config) => {
      const panel = content.querySelector(config.selector);
      if (!panel) return;
      mountPanel(panel, config);
      setPanelState(panel, config);
      const view = panel.closest('.view');
      if (view && !view.hidden) activePanel = panel;
    });
    setNavState();
    if (focusButton) focusButton.hidden = window.innerWidth <= 980 && !activePanel && !focusMode;
  }

  // An explicit editing action must reveal its destination even in focus mode.
  window.FinansWorkspace = Object.freeze({
    openPanel(key) {
      const config = panels.find((item) => item.key === key);
      if (!config || !content.querySelector(config.selector)) return false;
      focusMode = false;
      panelPreferences[key] = false;
      savePreference('finans-aux-panels', panelPreferences);
      syncLayout();
      return true;
    },
  });

  navButton.addEventListener('click', () => {
    if (focusMode) { focusMode = false; navCompact = false; }
    else navCompact = !navCompact;
    savePreference('finans-nav-compact', navCompact);
    syncLayout();
  });
  if (focusButton) focusButton.addEventListener('click', () => { focusMode = !focusMode; syncLayout(); });

  // Report rendering replaces its DOM after async loads. Reattach controls to
  // the new nodes without rerendering, moving, or discarding the user's data.
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncLayout);
  });
  observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(syncLayout); }
  });
  syncLayout();
})();
