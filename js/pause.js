/* ===================== PAUSE ===================== */
let gamePaused = false;

function isGamePaused(){
  return !!gamePaused;
}

function isMainMenuOpen(){
  const el = document.getElementById('mainMenuOverlay');
  return !!(el && el.classList.contains('open'));
}

function setGamePaused(paused, opts){
  opts = opts || {};
  gamePaused = !!paused;
  if (typeof updatePauseUI === 'function') updatePauseUI();
  if (opts.notify && typeof showNotification === 'function' && typeof t === 'function'){
    showNotification(t(gamePaused ? 'menu.paused' : 'menu.resumed'), gamePaused ? 'neutral' : 'good');
  }
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

function togglePause(){
  if (isMainMenuOpen()) return;
  setGamePaused(!gamePaused, { notify: true });
}

function updatePauseUI(){
  const label = (typeof t === 'function')
    ? t(gamePaused ? 'menu.resume' : 'menu.pause')
    : (gamePaused ? '▶ Reprendre' : '⏸ Pause');
  const menuBtn = document.getElementById('menuPauseBtn');
  if (menuBtn) menuBtn.textContent = label;
  const floatBtn = document.getElementById('hudPauseBtn');
  if (floatBtn){
    floatBtn.textContent = gamePaused ? '▶' : '⏸';
    if (typeof t === 'function'){
      floatBtn.title = t(gamePaused ? 'menu.resume' : 'menu.pause');
    }
  }
}
