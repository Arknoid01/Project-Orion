// ============================================================
// tutorial.js — conseils contextuels (calendrier + déclencheurs bâtiments)
// ============================================================

const TUTORIAL_STORAGE_KEY = 'olympos_tutorial_v2';

// Conseils calendrier — affichés une seule fois, dans l'ordre, dès que le jour >= minDay
const TUTORIAL_TIPS = [
  { id: 'roads',     minDay: 0, key: 'tutorial.roads',     duration: 7000 },
  { id: 'services',  minDay: 1, key: 'tutorial.services',  duration: 7000 },
  { id: 'treasury',  minDay: 2, key: 'tutorial.treasury',  duration: 7000 },
  { id: 'market',    minDay: 3, key: 'tutorial.market' },
  { id: 'culture',   minDay: 6, key: 'tutorial.culture' },
  { id: 'trade',     minDay: 8, key: 'tutorial.trade' },
  { id: 'gods',      minDay: 12, key: 'tutorial.gods' },
  { id: 'colonies',  minDay: 18, key: 'tutorial.colonies' },
];

// Conseils déclenchés à la pose d'un bâtiment spécifique
const TUTORIAL_BUILDING_TIPS = {
  fountain:    'tutorial.fountain',
  taxOffice:   'tutorial.taxWalker',
  agora:       'tutorial.cultureAgora',
  theatre:     'tutorial.cultureVenue',
  gymnasium:   'tutorial.cultureVenue',
  stoa:        'tutorial.cultureVenue',
  academy:     'tutorial.cultureVenue',
  granary:     'tutorial.granary',
  market:      'tutorial.marketGranary',
  tradingPost: 'tutorial.tradePost',
};

let tutorialShown = {};
let _tutorialBudgetWarnDay = -1;

function loadTutorialState(){
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (raw) tutorialShown = JSON.parse(raw) || {};
  } catch { tutorialShown = {}; }
}

function saveTutorialState(){
  try { localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(tutorialShown)); } catch { /* ignore */ }
}

function showTutorialTip(id, key, duration){
  if (!id || !key || tutorialShown[id]) return false;
  tutorialShown[id] = true;
  saveTutorialState();
  if (typeof showNotification === 'function' && typeof t === 'function'){
    showNotification(t(key), 'info', { tutorialDuration: duration || 5500 });
  }
  return true;
}

function onBuildingPlaced(type, col, row){
  if (!type) return;
  const key = TUTORIAL_BUILDING_TIPS[type];
  if (key) showTutorialTip('build:' + type, key, 7000);

  // Auto-affichage de la zone de couverture quand on pose un service
  const def = typeof BUILDING_DEFS !== 'undefined' && BUILDING_DEFS[type];
  if (def && def.isService && typeof showServiceCoverage === 'function' && col != null){
    setTimeout(() => showServiceCoverage(col, row, 8000), 300);
  }
}

function onTradePanelOpened(){
  showTutorialTip('tradePanel', 'tutorial.tradeRoutes');
}

function _checkBudgetWarning(day){
  if (typeof treasury === 'undefined' || typeof totalUpkeep !== 'function') return;
  if (_tutorialBudgetWarnDay === day) return;
  // Alerte si le trésor couvre moins de 20 jours d'entretien ET qu'il n'y a pas de bureau des impôts
  const upkeepDay = totalUpkeep() * (typeof DAY_DURATION_TICKS !== 'undefined' ? DAY_DURATION_TICKS : 10);
  const hasTaxOffice = typeof walkers !== 'undefined'
    && walkers.some(w => w.serviceType === 'tax');
  if (treasury < upkeepDay * 20 && !hasTaxOffice && day >= 1){
    _tutorialBudgetWarnDay = day;
    showTutorialTip('budgetWarn:' + day, 'tutorial.budgetWarn', 8000);
  }
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
    showTutorialTip(tip.id, tip.key, tip.duration);
    break;
  }

  _checkBudgetWarning(day);
}

loadTutorialState();
window.tickTutorial = tickTutorial;
window.onBuildingPlaced = onBuildingPlaced;
window.onTradePanelOpened = onTradePanelOpened;
