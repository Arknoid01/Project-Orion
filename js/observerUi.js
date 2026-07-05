/* ===================== OBSERVATEUR — coquille DOM ===================== */
// setObserverTiles + panneaux modaux partagés (Gestion, perf, fermeture).

function setObserverTiles(data){
  const panel = document.getElementById('observerPanel');
  if (!panel || !data) return;
  const tiles = [...panel.querySelectorAll('.obsTile')].filter(t => t.id !== 'actionsTile');

  tiles.forEach((tile, index) => {
    const d = data.tiles[index];
    if (!d){
      tile.style.display = 'none';
      return;
    }
    tile.style.display = 'block';
    tile.classList.toggle('open', index < 2);
    tile.querySelector('.icon').textContent = d.icon;
    tile.querySelector('.title').textContent = d.title;
    tile.querySelector('.status').textContent = d.status;
    tile.querySelector('.obsTileBody').innerHTML = d.rows.map(row => {
      const cls = row[2] ? ` class="${row[2]}"` : '';
      return `<div class="row"><span>${row[0]}</span><b${cls}>${row[1]}</b></div>`;
    }).join('');
  });

  const actions = document.getElementById('actionsTile');
  if (actions){
    if (!window._actionsTilePristine){
      window._actionsTilePristine = {
        icon: (actions.querySelector('.icon') || {}).textContent || '⚙️',
        title: (actions.querySelector('.title') || {}).textContent || 'Actions',
        status: (actions.querySelector('.status') || {}).textContent || '',
        body: actions.querySelector('.obsTileBody').innerHTML,
      };
    }
    if (data.actionsHtml){
      actions.style.display = 'block';
      actions.classList.add('open');
      const ic = actions.querySelector('.icon'); if (ic) ic.textContent = '⚙️';
      const ti = actions.querySelector('.title'); if (ti) ti.textContent = data.actionsTitle || t('observer.actions');
      const st = actions.querySelector('.status'); if (st) st.textContent = '';
      actions.querySelector('.obsTileBody').innerHTML = data.actionsHtml;
    } else {
      const p = window._actionsTilePristine;
      const ic = actions.querySelector('.icon'); if (ic) ic.textContent = p.icon;
      const ti = actions.querySelector('.title'); if (ti) ti.textContent = p.title;
      const st = actions.querySelector('.status'); if (st) st.textContent = p.status;
      actions.querySelector('.obsTileBody').innerHTML = p.body;
      actions.style.display = data.actions ? 'block' : 'none';
    }
  }
}

function openCityManagement(){
  closePanels();
  const data = (typeof buildCityObserverData === 'function')
    ? buildCityObserverData()
    : { title: t('manage.cityManagement'), tiles: [], actions: false };
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  setObserverTiles(data);
  document.getElementById('observerPanel').classList.add('open');
  document.getElementById('backdrop').classList.add('show');
}

function closePanels(){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.remove('show');
  if (typeof closeCityMap === 'function') closeCityMap();
}

function togglePanel(id){
  const panel = document.getElementById(id);
  if (!panel) return;
  const wasOpen = panel.classList.contains('open');
  closePanels();
  if (!wasOpen){
    panel.classList.add('open');
    const backdrop = document.getElementById('backdrop');
    if (backdrop) backdrop.classList.add('show');
    if (id === 'managePanel' && typeof renderDiplomacyPanel === 'function') renderDiplomacyPanel();
  }
}

function toggleTile(btn){
  btn.closest('.obsTile').classList.toggle('open');
}

function openPerfSettings(){
  closePanels();
  document.getElementById('perfSettingsPanel').classList.add('open');
  document.getElementById('backdrop').classList.add('show');
  refreshPerfSettingsUI();
}

function refreshPerfSettingsUI(){
  const current = typeof PERF_LEVEL === 'string' ? PERF_LEVEL : 'normal';
  document.querySelectorAll('.perfLevelBtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === current);
  });
  const lbl = document.getElementById('perfCurrentLabel');
  if (lbl && typeof t === 'function'){
    lbl.textContent = t('perf.current', { level: t('perf.level.' + current) });
  }
}

function choosePerfLevel(level){
  if (typeof setPerfLevel === 'function') setPerfLevel(level);
}

window.setObserverTiles = setObserverTiles;
window.openCityManagement = openCityManagement;
window.closePanels = closePanels;
window.togglePanel = togglePanel;
window.toggleTile = toggleTile;
window.openPerfSettings = openPerfSettings;
window.refreshPerfSettingsUI = refreshPerfSettingsUI;
window.choosePerfLevel = choosePerfLevel;
