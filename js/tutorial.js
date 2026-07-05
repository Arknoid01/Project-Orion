// ============================================================
// tutorial.js — conseils contextuels (calendrier + déclencheurs bâtiments)
// ============================================================

const TUTORIAL_STORAGE_KEY = 'olympos_tutorial_v1';

const TUTORIAL_TIPS = [
  { id: 'walkers', minDay: 1, key: 'tutorial.walkers' },
  { id: 'market', minDay: 3, key: 'tutorial.market' },
  { id: 'culture', minDay: 6, key: 'tutorial.culture' },
  { id: 'trade', minDay: 8, key: 'tutorial.trade' },
  { id: 'gods', minDay: 12, key: 'tutorial.gods' },
  { id: 'colonies', minDay: 18, key: 'tutorial.colonies' },
];

const TUTORIAL_BUILDING_TIPS = {
  agora: 'tutorial.cultureAgora',
  theatre: 'tutorial.cultureVenue',
  gymnasium: 'tutorial.cultureVenue',
  stoa: 'tutorial.cultureVenue',
  academy: 'tutorial.cultureVenue',
  granary: 'tutorial.granary',
  market: 'tutorial.marketGranary',
  tradingPost: 'tutorial.tradePost',
  taxOffice: 'tutorial.taxWalker',
};

let tutorialShown = {};

function loadTutorialState(){
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (raw) tutorialShown = JSON.parse(raw) || {};
  } catch { tutorialShown = {}; }
}

function saveTutorialState(){
  try { localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(tutorialShown)); } catch { /* ignore */ }
}

function showTutorialTip(id, key){
  if (!id || !key || tutorialShown[id]) return false;
  tutorialShown[id] = true;
  saveTutorialState();
  if (typeof showNotification === 'function' && typeof t === 'function'){
    showNotification(t(key), 'info');
  }
  return true;
}

function onBuildingPlaced(type){
  if (!type) return;
  const key = TUTORIAL_BUILDING_TIPS[type];
  if (key) showTutorialTip('build:' + type, key);
}

function onTradePanelOpened(){
  showTutorialTip('tradePanel', 'tutorial.tradeRoutes');
}

function tickTutorial(){
  if (typeof getCalendarState !== 'function') return;
  if (typeof isColonyPhase === 'function' && isColonyPhase()) return;
  if (typeof isGamePaused === 'function' && isGamePaused()) return;
  if (typeof grid === 'undefined' || !grid.length) return;

  loadTutorialState();
  const day = getCalendarState().day;

  for (const tip of TUTORIAL_TIPS){
    if (tutorialShown[tip.id]) continue;
    if (day < tip.minDay) continue;
    showTutorialTip(tip.id, tip.key);
    break;
  }
}

loadTutorialState();
window.tickTutorial = tickTutorial;
window.onBuildingPlaced = onBuildingPlaced;
window.onTradePanelOpened = onTradePanelOpened;
