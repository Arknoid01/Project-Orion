/* ===================== ETAT DES OBJECTIFS ===================== */
let totalWheatProduced = 0; // cumulé depuis le début de la partie (voir production.js)
let victoryAnnounced = false;
let objectiveNearNotified = {};

const DOMAINE_LEVEL_INDEX = HOUSE_LEVELS.findIndex(l => l.key === 'domaine');
const RESIDENCE_LEVEL_INDEX = HOUSE_LEVELS.findIndex(l => l.key === 'residence');
const VILLA_LEVEL_INDEX = HOUSE_LEVELS.findIndex(l => l.key === 'villa');

function countBuildingsOfType(type){
  let n = 0;
  if (typeof forEachBuilding === 'function'){
    forEachBuilding((t) => { if (t === type) n++; });
  }
  return n;
}

function hasHouseLevelAtLeast(minIndex){
  if (minIndex < 0) return 0;
  let found = false;
  forEachBuilding((type, col, row) => {
    if (type === 'maison' && grid[row][col].houseLevel >= minIndex) found = true;
  });
  return found ? 1 : 0;
}

function hasVillaSomewhere(){
  return hasHouseLevelAtLeast(VILLA_LEVEL_INDEX);
}

const OBJECTIVE_METRICS = {
  population:   () => computeTotalPopulation(),
  wheatProduced:() => totalWheatProduced,
  villa:        () => hasVillaSomewhere(),
  domaine:      () => hasHouseLevelAtLeast(DOMAINE_LEVEL_INDEX),
  residence:    () => hasHouseLevelAtLeast(RESIDENCE_LEVEL_INDEX),
  favor:        () => favor,
  citiesConquered: () => (worldCities || []).filter(c => c.conquered).length,
  barracks:     () => (typeof countBarracks === 'function') ? countBarracks() : 0,
  militaryPoints: () => (typeof getMilitaryPoints === 'function') ? getMilitaryPoints() : 0,
  coloniesCompleted: () => (typeof completedColonies !== 'undefined') ? completedColonies.length : 0,
  marbleStock:  () => Math.floor(resources.marble || 0),
  wineStock:    () => Math.floor(resources.wine || 0),
  wheatStock:   () => Math.floor(resources.wheat || 0),
  coalStock:    () => Math.floor(resources.coal || 0),
  bronzeStock:  () => Math.floor(resources.bronze || 0),
  sculptureStock: () => Math.floor(resources.sculpture || 0),
  fishStock:      () => Math.floor(resources.fish || 0),
  clothingStock:  () => Math.floor(resources.clothing || 0),
  armsStock:      () => Math.floor(resources.arms || 0),
  tradePosts:   () => (typeof countTradePosts === 'function') ? countTradePosts() : 0,
  workshops:    () => countBuildingsOfType('workshop'),
  buildingCount: (obj) => countBuildingsOfType(obj && obj.buildingKey),
};

function evaluateObjectiveMetric(obj){
  if (!obj || !obj.metric) return 0;
  if (obj.metric === 'godTemple' && obj.godKey){
    return (typeof hasGodTemple === 'function' && hasGodTemple(obj.godKey)) ? 1 : 0;
  }
  if (obj.metric === 'godSatisfaction' && obj.godKey){
    return (typeof getGodSatisfactionValue === 'function')
      ? getGodSatisfactionValue(obj.godKey)
      : 0;
  }
  const fn = OBJECTIVE_METRICS[obj.metric];
  let value = typeof fn === 'function' ? fn(obj) : 0;
  if (typeof obj.baseline === 'number') value = Math.max(0, value - obj.baseline);
  return value;
}

/** Valeur brute (sans baseline épisode) — pour ajuster les seuils en campagne. */
function evaluateObjectiveMetricRaw(obj){
  if (!obj || !obj.metric) return 0;
  const copy = Object.assign({}, obj);
  delete copy.baseline;
  return evaluateObjectiveMetric(copy);
}
window.evaluateObjectiveMetricRaw = evaluateObjectiveMetricRaw;

function objectiveTrackingId(obj){
  if (!obj) return '';
  if (typeof campaignObjectiveIdentity === 'function') return campaignObjectiveIdentity(obj);
  if (obj.metric === 'buildingCount' && obj.buildingKey) return 'buildingCount:' + obj.buildingKey;
  return obj.key || obj.metric || '';
}

function getObjectiveDisplayName(obj){
  if (!obj) return '';
  if (obj.metric === 'godTemple' && obj.godKey){
    return t('campaign.objective.godTemple', { god: t('god.' + obj.godKey) });
  }
  if (obj.metric === 'godSatisfaction' && obj.godKey){
    return t('campaign.objective.godSatisfaction', { god: t('god.' + obj.godKey) });
  }
  if (obj.metric === 'buildingCount' && obj.buildingKey && obj.nameKey){
    return t(obj.nameKey);
  }
  return t(obj.nameKey);
}

function resetObjectiveTracking(){
  objectiveNearNotified = {};
}

function showSandboxVictoryRecap(){
  const pop = computeTotalPopulation();
  const colonies = (typeof completedColonies !== 'undefined') ? completedColonies.length : 0;
  const adventures = (typeof completedAdventures !== 'undefined') ? completedAdventures.length : 0;
  const conquered = (worldCities || []).filter(c => c.conquered).length;
  const body = t('objective.victoryRecap', {
    pop,
    colonies,
    adventures,
    conquered,
    wheat: Math.floor(totalWheatProduced),
  });
  if (typeof showChoice === 'function'){
    showChoice({
      title: t('objective.victoryTitle'),
      body,
      dismissible: true,
      choices: [{ label: t('dialog.ok'), type: 'primary', onPick: () => {} }],
    });
  } else {
    showNotification(t('objective.victory'), 'good');
  }
  debugInfo('Victoire : tous les objectifs sont atteints !', { pop, colonies, adventures });
}

/* ===================== VERIFICATION ===================== */
function checkObjectives(){
  const objectives = (typeof activeObjectives !== 'undefined') ? activeObjectives : OBJECTIVES;
  let allDone = true;
  objectives.forEach(obj => {
    obj.current = evaluateObjectiveMetric(obj);
    obj.done = obj.current >= obj.target;
    if (!obj.done){
      allDone = false;
      if (obj.target > 0){
        const pct = obj.current / obj.target;
        const trackId = objectiveTrackingId(obj);
        if (pct >= 0.8 && trackId && !objectiveNearNotified[trackId]){
          objectiveNearNotified[trackId] = true;
          showNotification(t('objective.nearComplete', {
            name: getObjectiveDisplayName(obj),
            current: Math.floor(obj.current),
            target: obj.target,
          }), 'info');
        }
      }
    }
  });

  if (allDone && typeof isColonyPhase === 'function' && isColonyPhase()){
    if (typeof completeColony === 'function') completeColony();
    renderObjectivesPanel();
    return;
  }

  if (allDone && !victoryAnnounced){
    victoryAnnounced = true;
    if (typeof isCampaignActive === 'function' && isCampaignActive()
        && typeof onCampaignEpisodeVictory === 'function'){
      onCampaignEpisodeVictory();
    } else {
      showSandboxVictoryRecap();
    }
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
    const pct = obj.target > 0 ? Math.min(100, Math.round((current / obj.target) * 100)) : 0;
    const nearClass = (!obj.done && pct >= 80) ? ' objective-near' : '';
    return `<li class="${obj.done ? 'objective-done' : ''}${nearClass}">${icon} ${getObjectiveDisplayName(obj)} (${current}/${obj.target})</li>`;
  }).join('');

  if (victoryBanner) victoryBanner.style.display = victoryAnnounced ? '' : 'none';
  if (defeatBanner){
    defeatBanner.style.display = defeatAnnounced ? '' : 'none';
    if (defeatAnnounced) defeatBanner.textContent = t('defeat.' + defeatReason);
  }
}

window.resetObjectiveTracking = resetObjectiveTracking;
