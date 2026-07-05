/* ===================== CAMPAGNE / SCENARIOS ===================== */
// Chaque scénario définit ses objectifs, trésor de départ et nombre de cités voisines.
// Le menu principal permet de choisir un scénario avant de lancer une partie.

let currentScenarioId = 'sandbox';
let activeObjectives = OBJECTIVES.slice();

const SCENARIOS = [
  {
    id: 'sandbox',
    nameKey: 'scenario.sandbox',
    descKey: 'scenario.sandboxDesc',
    icon: '🏛️',
    objectives: null,
    startingTreasury: STARTING_TREASURY,
    worldCityCount: WORLD_CITY_COUNT,
  },
  {
    id: 'colonization',
    nameKey: 'scenario.colonization',
    descKey: 'scenario.colonizationDesc',
    icon: '🏠',
    objectives: [
      { key: 'colony', nameKey: 'objective.colony', metric: 'coloniesCompleted', target: 2 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 35 },
    ],
    startingTreasury: 1500,
    worldCityCount: 4,
  },
  {
    id: 'defense',
    nameKey: 'scenario.defense',
    descKey: 'scenario.defenseDesc',
    icon: '🛡️',
    objectives: [
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 40 },
      { key: 'barracks', nameKey: 'scenario.objective.barracks', metric: 'barracks', target: 1 },
      { key: 'militaryPoints', nameKey: 'campaign.objective.militaryPoints', metric: 'militaryPoints', target: 45 },
    ],
    startingTreasury: 1100,
    worldCityCount: 5,
  },
  {
    id: 'conquest',
    nameKey: 'scenario.conquest',
    descKey: 'scenario.conquestDesc',
    icon: '⚔️',
    objectives: [
      { key: 'barracks', nameKey: 'scenario.objective.barracks', metric: 'barracks', target: 1 },
      { key: 'conquered', nameKey: 'scenario.objective.conquer', metric: 'citiesConquered', target: 2 },
      { key: 'fleet', nameKey: 'objective.fleetShips', metric: 'fleetShips', target: 2 },
    ],
    startingTreasury: 2000,
    worldCityCount: 8,
  },
  {
    id: 'prosperity',
    nameKey: 'scenario.prosperity',
    descKey: 'scenario.prosperityDesc',
    icon: '🏺',
    objectives: [
      { key: 'agora', nameKey: 'objective.agora', metric: 'agora', target: 1 },
      { key: 'cultureVenues', nameKey: 'objective.cultureVenues', metric: 'cultureVenues', target: 1 },
      { key: 'villa', nameKey: 'objective.villa', metric: 'villa', target: 1 },
      { key: 'favor', nameKey: 'objective.favor', metric: 'favor', target: 70 },
    ],
    startingTreasury: 1800,
    worldCityCount: 5,
  },
  {
    id: 'culture',
    nameKey: 'scenario.culture',
    descKey: 'scenario.cultureDesc',
    icon: '🎭',
    objectives: [
      { key: 'agora', nameKey: 'objective.agora', metric: 'agora', target: 1 },
      { key: 'cultureServed', nameKey: 'objective.cultureServed', metric: 'cultureServed', target: 3 },
      { key: 'domaine', nameKey: 'objective.domaine', metric: 'domaine', target: 1 },
    ],
    startingTreasury: 1600,
    worldCityCount: 4,
  },
  {
    id: 'trade',
    nameKey: 'scenario.trade',
    descKey: 'scenario.tradeDesc',
    icon: '⚓',
    objectives: [
      { key: 'tradePosts', nameKey: 'campaign.objective.tradePosts', metric: 'tradePosts', target: 2 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 35 },
      { key: 'fleet', nameKey: 'objective.fleetShips', metric: 'fleetShips', target: 1 },
    ],
    startingTreasury: 2200,
    worldCityCount: 7,
  },
  {
    id: 'monuments',
    nameKey: 'scenario.monuments',
    descKey: 'scenario.monumentsDesc',
    icon: '🏛️',
    objectives: [
      { key: 'templeZeus', nameKey: 'campaign.objective.godTemple', metric: 'godTemple', godKey: 'zeus', target: 1 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 45 },
    ],
    startingTreasury: 2400,
    worldCityCount: 5,
  },
  {
    id: 'beauty',
    nameKey: 'scenario.beauty',
    descKey: 'scenario.beautyDesc',
    icon: '🌳',
    objectives: [
      { key: 'statues', nameKey: 'scenario.objective.statues', metric: 'buildingCount', buildingKey: 'statue', target: 2 },
      { key: 'gardens', nameKey: 'scenario.objective.gardens', metric: 'buildingCount', buildingKey: 'garden', target: 2 },
      { key: 'residence', nameKey: 'objective.residence', metric: 'residence', target: 1 },
    ],
    startingTreasury: 1900,
    worldCityCount: 4,
  },
  {
    id: 'industry',
    nameKey: 'scenario.industry',
    descKey: 'scenario.industryDesc',
    icon: '⚒️',
    objectives: [
      { key: 'workshops', nameKey: 'campaign.objective.workshops', metric: 'workshops', target: 1 },
      { key: 'sculptureStock', nameKey: 'campaign.objective.sculptureStock', metric: 'sculptureStock', target: 8 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 30 },
    ],
    startingTreasury: 1700,
    worldCityCount: 5,
  },
  {
    id: 'faith',
    nameKey: 'scenario.faith',
    descKey: 'scenario.faithDesc',
    icon: '🛕',
    objectives: [
      { key: 'temple', nameKey: 'scenario.objective.temple', metric: 'buildingCount', buildingKey: 'temple', target: 1 },
      { key: 'apolloSat', nameKey: 'campaign.objective.godSatisfaction', metric: 'godSatisfaction', godKey: 'apollo', target: 65 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 35 },
    ],
    startingTreasury: 2000,
    worldCityCount: 5,
  },
  {
    id: 'adventures',
    nameKey: 'scenario.adventures',
    descKey: 'scenario.adventuresDesc',
    icon: '⚔️',
    objectives: [
      { key: 'adventures', nameKey: 'scenario.objective.adventures', metric: 'adventuresCompleted', target: 2 },
      { key: 'heroTemple', nameKey: 'scenario.objective.heroTemple', metric: 'buildingCount', buildingKey: 'heroTemple', target: 1 },
    ],
    startingTreasury: 2100,
    worldCityCount: 6,
  },
  {
    id: 'harvest',
    nameKey: 'scenario.harvest',
    descKey: 'scenario.harvestDesc',
    icon: '🌾',
    objectives: [
      { key: 'wheatProduced', nameKey: 'objective.wheatProduced', metric: 'wheatProduced', target: 120 },
      { key: 'granary', nameKey: 'scenario.objective.granary', metric: 'buildingCount', buildingKey: 'granary', target: 1 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 28 },
    ],
    startingTreasury: 1400,
    worldCityCount: 4,
    mapProfile: { landStyle: 'continent', boostTerrains: ['wheat'] },
  },
];

function getScenario(id){
  return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

function scenarioObjectiveSource(scenario){
  // null = bac à sable sans objectifs ; undefined/absent = objectifs par défaut (OBJECTIVES)
  if (scenario.objectives === null) return [];
  return scenario.objectives || OBJECTIVES;
}

function applyScenarioObjectives(scenario, opts){
  opts = opts || {};
  activeObjectives = scenarioObjectiveSource(scenario).map(o => {
    const obj = Object.assign({}, o);
    if (opts.recordBaseline && typeof evaluateObjectiveMetric === 'function'){
      // Métriques cumulées depuis le début de la partie : viser un gain sur l'épisode.
      if (obj.metric === 'wheatProduced') obj.baseline = evaluateObjectiveMetric(obj);
    }
    return obj;
  });
}

async function startScenario(scenarioId){
  if (typeof assignSaveSlotForNewGame === 'function') assignSaveSlotForNewGame();
  const scenario = getScenario(scenarioId);
  currentScenarioId = scenario.id;
  if (typeof clearActiveCampaign === 'function') clearActiveCampaign();
  applyScenarioObjectives(scenario);
  if (typeof showGenLoading === 'function') showGenLoading();
  try {
    await resetGameForScenario(scenario);
  } catch (err){
    if (typeof showGenError === 'function') showGenError(err);
    else console.error(err);
    return;
  }
  hideMainMenu();
  if (typeof centerMapView === 'function') centerMapView();
  if (typeof waitForTerrainReady === 'function') await waitForTerrainReady();
  if (typeof render === 'function') render();
  if (typeof hideGenLoading === 'function') hideGenLoading();
  if (typeof showScenarioStoryIntro === 'function') showScenarioStoryIntro(scenario);
}

async function resetGameForScenario(scenario){
  if (typeof clearMapGenProfile === 'function') clearMapGenProfile();
  await initGrid({
    seed: scenario.mapSeed,
    mapGenOptions: { mapProfile: scenario.mapProfile || null },
  });
  resources = mergeResources(
    typeof STARTING_RESOURCES !== 'undefined' ? STARTING_RESOURCES : {},
  );
  treasury = scenario.startingTreasury;
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  stairsMode = false;
  if (typeof clearZonePlacementStart === 'function') clearZonePlacementStart();
  blockMode = false;
  DEBUG.tickCount = 0;
  favor = 50;
  taxRate = TAX_RATE_DEFAULT;
  productionMultiplier = 1;
  productionEffectTicksLeft = 0;
  if (typeof initGodDispositions === 'function') initGodDispositions(true);
  totalWheatProduced = 0;
  victoryAnnounced = false;
  lastMonthIndex = null;
  everHadPopulation = false;
  zeroPopulationStreak = 0;
  bankruptStreak = 0;
  defeatAnnounced = false;
  defeatReason = null;
  festivalTicksLeft = 0;
  venueEventTicksLeft = 0;
  if (typeof lastVenueEventDay !== 'undefined') lastVenueEventDay = -1;
  if (typeof resetOracleState === 'function') resetOracleState();
  if (typeof resetObjectiveTracking === 'function') resetObjectiveTracking();
  generateWorldCities(scenario.worldCityCount);
  if (typeof configureWorldTradeForMapProfile === 'function'){
    configureWorldTradeForMapProfile(scenario.mapProfile);
  }
  initDiplomacy();
  initTrade();
  initArmy();
  if (typeof initFleet === 'function') initFleet();
  resetCreatures();
  resetMigrants();
  resetInvasion();
  if (typeof resetGodAgents === 'function') resetGodAgents();
  if (typeof resetAdventures === 'function') resetAdventures();
  if (typeof resetMarketDay === 'function') resetMarketDay();
  gamePhase = 'main';
  activeColonyId = null;
  completedColonies = [];
  colonyTroopBonus = 0;
  mainCitySnapshot = null;
  recomputeAllWalkers();
  recomputeLabor();
  debugInfo('Scénario démarré', { scenario: scenario.id });
  refreshUI();
  saveGame({ silent: true });
}

function renderScenarioList(){
  const el = document.getElementById('scenarioList');
  const subtitle = document.getElementById('scenarioMenuSubtitle');
  const title = document.getElementById('newGameTitle');
  if (subtitle) subtitle.textContent = t('scenario.listSubtitle');
  if (title) title.textContent = t('scenario.listTitle');
  if (!el) return;
  const scenarios = SCENARIOS.filter(s => s.id !== 'sandbox');
  el.innerHTML = scenarios.map(s => {
    const active = s.id === currentScenarioId ? ' scenario-active' : '';
    return `<button class="scenarioCard${active}" onclick="promptThenStartScenario('${s.id}')">
      <span class="scenarioIcon">${s.icon}</span>
      <span class="scenarioName">${t(s.nameKey)}</span>
      <span class="scenarioDesc">${t(s.descKey)}</span>
    </button>`;
  }).join('');
}

function showCampaignMenu(){
  showMenuScreen('campaignMenuScreen');
  if (typeof renderCampaignPathList === 'function') renderCampaignPathList();
}
window.showCampaignMenu = showCampaignMenu;
