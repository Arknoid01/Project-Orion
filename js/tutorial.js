// ============================================================
// tutorial.js — conseils contextuels au premier lancement
// ============================================================

const TUTORIAL_STORAGE_KEY = 'olympos_tutorial_v1';

const TUTORIAL_TIPS = [
  { id: 'walkers', minDay: 1, key: 'tutorial.walkers' },
  { id: 'market', minDay: 3, key: 'tutorial.market' },
  { id: 'trade', minDay: 8, key: 'tutorial.trade' },
  { id: 'gods', minDay: 12, key: 'tutorial.gods' },
  { id: 'colonies', minDay: 18, key: 'tutorial.colonies' },
];

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
    tutorialShown[tip.id] = true;
    saveTutorialState();
    if (typeof showNotification === 'function' && typeof t === 'function'){
      showNotification(t(tip.key), 'info');
    }
    break;
  }
}

loadTutorialState();
window.tickTutorial = tickTutorial;
