/* ===================== ETAT DES OBJECTIFS ===================== */
let totalWheatProduced = 0; // cumulé depuis le début de la partie (voir production.js)
let victoryAnnounced = false;

const OBJECTIVE_METRICS = {
  population:   () => computeTotalPopulation(),
  wheatProduced:() => totalWheatProduced,
  villa:        () => hasVillaSomewhere() ? 1 : 0,
  favor:        () => favor,
  citiesConquered: () => (worldCities || []).filter(c => c.conquered).length,
  barracks:     () => (typeof countBarracks === 'function') ? countBarracks() : 0,
};

// Index du niveau "villa" repéré par sa clé (et non "dernier niveau"), pour rester
// correct si d'autres niveaux sont ajoutés au-dessus (ex. 'domaine'). On compte
// villa ET au-delà comme objectif atteint.
const VILLA_LEVEL_INDEX = HOUSE_LEVELS.findIndex(l => l.key === 'villa');

function hasVillaSomewhere(){
  let found = false;
  forEachBuilding((type, col, row) => {
    if (type === 'maison' && grid[row][col].houseLevel >= VILLA_LEVEL_INDEX) found = true;
  });
  return found;
}

/* ===================== VERIFICATION ===================== */
function checkObjectives(){
  const objectives = (typeof activeObjectives !== 'undefined') ? activeObjectives : OBJECTIVES;
  let allDone = true;
  objectives.forEach(obj => {
    obj.current = OBJECTIVE_METRICS[obj.metric]();
    obj.done = obj.current >= obj.target;
    if (!obj.done) allDone = false;
  });

  if (allDone && !victoryAnnounced){
    victoryAnnounced = true;
    showNotification(t('objective.victory'), 'good');
    debugInfo('Victoire : tous les objectifs sont atteints !');
  }

  renderObjectivesPanel();
}

/* ===================== AFFICHAGE PANNEAU ===================== */
function renderObjectivesPanel(){
  const list = document.getElementById('objectivesList');
  const victoryBanner = document.getElementById('victoryBanner');
  const defeatBanner = document.getElementById('defeatBanner');
  const objectives = (typeof activeObjectives !== 'undefined') ? activeObjectives : OBJECTIVES;
  if (!list) return;

  list.innerHTML = objectives.map(obj => {
    const icon = obj.done ? '✅' : '⏳';
    const current = Math.floor(obj.current || 0);
    return `<li class="${obj.done ? 'objective-done' : ''}">${icon} ${t(obj.nameKey)} (${current}/${obj.target})</li>`;
  }).join('');

  if (victoryBanner) victoryBanner.style.display = victoryAnnounced ? '' : 'none';
  if (defeatBanner){
    defeatBanner.style.display = defeatAnnounced ? '' : 'none';
    if (defeatAnnounced) defeatBanner.textContent = t('defeat.' + defeatReason);
  }
}
