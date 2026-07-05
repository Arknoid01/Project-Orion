/* ===================== COQUILLE UI (catalogue, actions globales) ===================== */

function saveCatalogState(){
  const state = [...document.querySelectorAll('.catalogCategory')]
    .map((cat, index) => ({ index, open: cat.classList.contains('open') }));
  try { localStorage.setItem('olympos_catalog_state', JSON.stringify(state)); } catch { /* ignore */ }
}

function restoreCatalogState(){
  try {
    const raw = localStorage.getItem('olympos_catalog_state');
    if (!raw) return;
    const state = JSON.parse(raw);
    state.forEach(item => {
      const cat = document.querySelectorAll('.catalogCategory')[item.index];
      if (cat) cat.classList.toggle('open', !!item.open);
    });
    const openCats = [...document.querySelectorAll('#quickBuild .catalogCategory.open')];
    openCats.slice(1).forEach(c => c.classList.remove('open'));
  } catch { /* ignore */ }
}

function toggleCatalog(btn){
  const cat = btn.closest('.catalogCategory');
  const wasOpen = cat.classList.contains('open');
  document.querySelectorAll('#quickBuild .catalogCategory').forEach(c => c.classList.remove('open'));
  if (!wasOpen) cat.classList.add('open');
  saveCatalogState();
}

function isPlacementAction(fnName){
  return ['selectBuilding', 'selectRoadMode', 'selectStairsMode', 'selectBlockMode', 'selectDemolishMode'].includes(fnName);
}

function setSelectedBuildLabel(fnName, arg){
  const pill = document.getElementById('selectedBuildPill');
  const name = document.getElementById('selectedBuildName');
  if (!pill || !name) return;

  if (fnName === 'selectBuilding'){
    const def = (typeof BUILDING_DEFS !== 'undefined') ? BUILDING_DEFS[arg] : null;
    name.textContent = (def && typeof t === 'function') ? t(def.name) : arg;
    pill.classList.add('show');
  } else if (fnName === 'selectRoadMode'){
    name.textContent = (typeof t === 'function') ? t('catalog.roadShort') : 'Route';
    pill.classList.add('show');
  } else if (fnName === 'selectStairsMode'){
    name.textContent = (typeof t === 'function') ? t('catalog.stairsShort') : 'Escalier';
    pill.classList.add('show');
  } else if (fnName === 'selectBlockMode'){
    name.textContent = (typeof t === 'function') ? t('catalog.block') : 'Block';
    pill.classList.add('show');
  } else if (fnName === 'selectDemolishMode'){
    name.textContent = (typeof t === 'function') ? t('action.demolishShort') : 'Demolish';
    pill.classList.add('show');
  }
}

function callGameAction(fnName, arg){
  const fn = window[fnName];
  if (typeof fn === 'function'){
    if (arg !== undefined) fn(arg);
    else fn();
  }
  if (isPlacementAction(fnName)){
    setSelectedBuildLabel(fnName, arg);
    saveCatalogState();
    closePanels();
  }
}

function toggleFullscreen(){
  if (!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(() => {
      const msg = (typeof t === 'function') ? t('menu.fullscreenUnavailable') : 'Fullscreen unavailable';
      if (typeof showNotification === 'function') showNotification(msg, 'bad');
    });
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const label = document.getElementById('fullscreenBtnLabel');
  if (label && typeof t === 'function'){
    label.textContent = document.fullscreenElement ? t('menu.fullscreenExit') : t('menu.fullscreen');
  }
});

document.addEventListener('DOMContentLoaded', restoreCatalogState);

window.saveCatalogState = saveCatalogState;
window.restoreCatalogState = restoreCatalogState;
window.toggleCatalog = toggleCatalog;
window.callGameAction = callGameAction;
window.toggleFullscreen = toggleFullscreen;
