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
      { key: 'colony', nameKey: 'objective.colony', metric: 'coloniesCompleted', target: 1 },
      { key: 'population', nameKey: 'objective.population', metric: 'population', target: 30 },
    ],
    startingTreasury: 1350,
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
    ],
    startingTreasury: 2000,
    worldCityCount: 8,
  },
];

function getScenario(id){
  return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

function applyScenarioObjectives(scenario){
  activeObjectives = (scenario.objectives || OBJECTIVES).map(o => Object.assign({}, o));
}

function startScenario(scenarioId){
  const scenario = getScenario(scenarioId);
  currentScenarioId = scenario.id;
  applyScenarioObjectives(scenario);
  resetGameForScenario(scenario);
  hideMainMenu();
  if (typeof centerMapView === 'function') centerMapView();
}

function resetGameForScenario(scenario){
  initGrid();
  resources = mergeResources(
    typeof STARTING_RESOURCES !== 'undefined' ? STARTING_RESOURCES : {},
  );
  treasury = scenario.startingTreasury;
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
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
  generateWorldCities(scenario.worldCityCount);
  initDiplomacy();
  initTrade();
  initArmy();
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
  if (subtitle) subtitle.textContent = t('scenario.menuSubtitle');
  if (title) title.textContent = t('home.newGameTitle');
  if (!el) return;
  el.innerHTML = SCENARIOS.map(s => {
    const active = s.id === currentScenarioId ? ' scenario-active' : '';
    return `<button class="scenarioCard${active}" onclick="startScenario('${s.id}')">
      <span class="scenarioIcon">${s.icon}</span>
      <span class="scenarioName">${t(s.nameKey)}</span>
      <span class="scenarioDesc">${t(s.descKey)}</span>
    </button>`;
  }).join('');
}
