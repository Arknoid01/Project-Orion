/* ===================== SYSTEME DE DEBUG ===================== */
// Chargé en PREMIER (avant tous les autres fichiers) pour pouvoir logger
// même une erreur qui surviendrait pendant le chargement de config.js etc.

const DEBUG = {
  enabled: true,       // mettre à false pour masquer complètement le panneau en "prod"
  maxLogEntries: 40,
  logs: [],
  tickCount: 0,
};

function debugLog(level, message, data){
  if (!DEBUG.enabled) return;
  const entry = {
    time: new Date().toLocaleTimeString('fr-FR', { hour12:false }),
    level, message,
    data: data !== undefined ? JSON.stringify(data) : ''
  };
  DEBUG.logs.unshift(entry);
  if (DEBUG.logs.length > DEBUG.maxLogEntries) DEBUG.logs.pop();

  const consoleMethod = { info:'log', warn:'warn', error:'error' }[level] || 'log';
  console[consoleMethod](`[${entry.time}] ${message}`, data ?? '');

  renderDebugPanel();
}

function debugInfo(msg, data){ debugLog('info', msg, data); }
function debugWarn(msg, data){ debugLog('warn', msg, data); }
function debugError(msg, data){ debugLog('error', msg, data); }

/* ===================== CAPTURE GLOBALE DES ERREURS ===================== */
// Sans ça, une exception JS sur mobile (sans console ouverte) est totalement invisible.
window.addEventListener('error', (e) => {
  debugError(`Erreur non interceptée : ${e.message}`, { fichier: e.filename, ligne: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  debugError(`Promise rejetée sans catch : ${e.reason}`);
});

/* ===================== VERIFICATEUR D'INVARIANTS ===================== */
// Appelé périodiquement (voir tick() dans production.js) pour détecter un état
// impossible avant qu'il ne cause un symptôme confus ailleurs dans le code.
function debugCheckInvariants(){
  if (typeof grid !== 'undefined'){
    if (grid.length !== GRID_ROWS){
      debugError('Grille corrompue : mauvais nombre de lignes', { attendu: GRID_ROWS, reel: grid.length });
    }
  }
  if (typeof resources !== 'undefined'){
    for (const [res, val] of Object.entries(resources)){
      if (val < 0) debugWarn(`Ressource négative détectée : ${res}`, { valeur: val });
      if (!Number.isFinite(val)) debugError(`Ressource non numérique : ${res}`, { valeur: val });
    }
  }
}

/* ===================== PANNEAU VISUEL ===================== */
function renderDebugPanel(){
  const panel = document.getElementById('debugLogList');
  const stateEl = document.getElementById('debugState');
  if (!panel || !stateEl) return; // panneau pas encore dans le DOM (ou masqué)

  if (typeof resources !== 'undefined'){
    stateEl.textContent =
      `tick #${DEBUG.tickCount} | blé:${Math.floor(resources.wheat)} marbre:${Math.floor(resources.marble)} ` +
      `sculpture:${Math.floor(resources.sculpture)} | sélection:${selectedBuilding ?? '–'} | survol:${hoverTile ? `${hoverTile.col},${hoverTile.row}` : '–'}`;
  }

  panel.innerHTML = DEBUG.logs.map(l =>
    `<div class="debugLine debug-${l.level}">[${l.time}] ${l.message}${l.data ? ' '+l.data : ''}</div>`
  ).join('');
}

function toggleDebugPanel(){
  const el = document.getElementById('debugPanel');
  if (!el) return;
  el.classList.toggle('open');
  if (el.classList.contains('open')) renderDebugPanel();
}

window.toggleDebugPanel = toggleDebugPanel;
