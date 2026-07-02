/* ===================== REGLAGES DE PERFORMANCE (3 niveaux) ===================== */
// Remplace la détection auto seule par un choix explicite et persistant, accessible
// depuis le menu Paramètres. Utile quand un navigateur se comporte différemment
// d'un autre sur le même appareil (ex: Brave refuse de charger, Firefox charge mais
// fait swap le reste du système) : l'utilisateur peut forcer le niveau qui marche.

const PERF_STORAGE_KEY = 'olympos_perf_level';
const PERF_LEVELS = ['faible', 'normal', 'forte'];

const DEVICE_IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Mobi/i.test(navigator.userAgent));
const DEVICE_LOW_MEMORY = (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 6);

/** Niveau choisi par l'utilisateur, ou déduit automatiquement de l'appareil si jamais réglé. */
function getPerfLevel(){
  try {
    const saved = localStorage.getItem(PERF_STORAGE_KEY);
    if (PERF_LEVELS.includes(saved)) return saved;
  } catch { /* localStorage indisponible (mode privé strict) : on retombe sur l'auto-détection */ }
  return (DEVICE_IS_MOBILE || DEVICE_LOW_MEMORY) ? 'forte' : 'normal';
}

/** Change le niveau et recharge la page pour appliquer proprement (tous les canvas en dépendent). */
function setPerfLevel(level){
  if (!PERF_LEVELS.includes(level)) return;
  try { localStorage.setItem(PERF_STORAGE_KEY, level); } catch { /* ignore */ }
  location.reload();
}

const PERF_LEVEL = getPerfLevel();

// Chaque preset règle : résolution du canvas principal (dprCap), résolution du
// cache terrain (cacheScale, jamais < 1 : un cache fractionnaire a déjà causé un
// bug de rendu en triangle avant qu'on identifie la vraie cause ailleurs — on ne
// reprend pas ce risque), qualité de lissage, et densité des décors (arbres,
// blé, touffes d'herbe) qui coûtent du temps de dessin à chaque frame.
// decorDensity : multiplicateur appliqué à FOREST_TREE_DENSITY, WHEAT_CROP_DENSITY
// et GRASS_DECOR_CHANCE pour réduire le nombre de drawImage() par frame en mobile.
const PERF_PRESETS = {
  faible: { dprCap: 1.5,  cacheScale: 2, smoothing: 'high', decorDensity: 1.0, walkerFrameSkip: 0, walkerRenderMax: 64, overlayFpsCap: 60, decorBeautySkip: 0 },
  normal: { dprCap: 1,    cacheScale: 1, smoothing: 'high', decorDensity: 0.85, walkerFrameSkip: 1, walkerRenderMax: 48, overlayFpsCap: 45, decorBeautySkip: 1 },
  forte:  { dprCap: 0.85, cacheScale: 1, smoothing: 'low',  decorDensity: 0.3, walkerFrameSkip: 2, walkerRenderMax: 28, overlayFpsCap: 30, decorBeautySkip: 2 },
};

const PERF = PERF_PRESETS[PERF_LEVEL] || PERF_PRESETS.normal;

/** Ajuste les limites walkers quand peu d'agents actifs (évite sur-throttle inutile). */
function getWalkerCount(){
  return (typeof walkers !== 'undefined' && Array.isArray(walkers)) ? walkers.length : 0;
}

function getWalkerFrameSkip(){
  const n = getWalkerCount();
  if (n <= 16) return 0;
  return PERF.walkerFrameSkip || 0;
}

function getWalkerRenderMax(){
  const n = getWalkerCount();
  if (n <= 16) return Math.max(n, PERF.walkerRenderMax || 999);
  return PERF.walkerRenderMax || 999;
}

function getOverlayFpsCap(){
  return PERF.overlayFpsCap || 60;
}
