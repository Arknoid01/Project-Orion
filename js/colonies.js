/* ===================== COLONIES (AVENTURES SECONDAIRES) ===================== */
// Une colonie = carte séparée avec ses propres objectifs. À la victoire, le joueur
// revient sur la cité mère avec troupes et ressources en récompense.

const COLONY_LAUNCH_COST = 250;

const COLONY_DEFINITIONS = [
  {
    id: 'nemea',
    nameKey: 'colony.nemea.name',
    descKey: 'colony.nemea.desc',
    icon: '🏝️',
    mapSeed: 424242,
    startingTreasury: 1000,
    startingResources: { wheat: 45, marble: 0, sculpture: 0, olives: 15, oil: 0, grapes: 0, wine: 0, wool: 0 },
    objectives: [
      { key: 'pop', nameKey: 'objective.population', metric: 'population', target: 18 },
      { key: 'wheat', nameKey: 'objective.wheatProduced', metric: 'wheatProduced', target: 60 },
    ],
    rewards: { troops: 25, treasury: 400, resources: { wheat: 80, marble: 15 } },
  },
  {
    id: 'thasos',
    nameKey: 'colony.thasos.name',
    descKey: 'colony.thasos.desc',
    icon: '⛰️',
    mapSeed: 818181,
    startingTreasury: 850,
    startingResources: { wheat: 30, marble: 12, sculpture: 0, olives: 0, oil: 0, grapes: 0, wine: 0, wool: 0 },
    objectives: [
      { key: 'pop', nameKey: 'objective.population', metric: 'population', target: 12 },
      { key: 'marble', nameKey: 'colony.objective.marble', metric: 'marbleStock', target: 30 },
    ],
    rewards: { troops: 15, treasury: 600, resources: { marble: 50, sculpture: 10 } },
  },
  {
    id: 'ionia',
    nameKey: 'colony.ionia.name',
    descKey: 'colony.ionia.desc',
    icon: '🍷',
    mapSeed: 919191,
    startingTreasury: 950,
    startingResources: { wheat: 35, marble: 0, sculpture: 0, olives: 0, oil: 0, grapes: 45, wine: 12, wool: 0 },
    objectives: [
      { key: 'pop', nameKey: 'objective.population', metric: 'population', target: 20 },
      { key: 'wine', nameKey: 'colony.objective.wine', metric: 'wineStock', target: 25 },
    ],
    rewards: { troops: 20, treasury: 350, resources: { wine: 60, grapes: 40 } },
  },
];

let gamePhase = 'main'; // 'main' | 'colony'
let activeColonyId = null;
let completedColonies = [];
let colonyTroopBonus = 0;
let mainCitySnapshot = null;

function getColonyDef(id){
  return COLONY_DEFINITIONS.find(c => c.id === id) || null;
}

function isColonyPhase(){
  return gamePhase === 'colony';
}

function cloneJson(obj){
  return JSON.parse(JSON.stringify(obj));
}

function captureMainCitySnapshot(){
  return {
    grid: cloneJson(grid),
    resources: Object.assign({}, resources),
    treasury,
    favor,
    taxRate,
    productionMultiplier,
    productionEffectTicksLeft,
    totalWheatProduced,
    victoryAnnounced,
    everHadPopulation,
    zeroPopulationStreak,
    bankruptStreak,
    defeatAnnounced,
    defeatReason,
    festivalTicksLeft,
    diplomacy: cloneJson(diplomacy),
    worldCities: cloneJson(worldCities),
    selectedWorldCityId,
    tradeRoutes: cloneJson(tradeRoutes),
    selectedTradeCityId,
    army: Object.assign({}, army),
    godAgents: cloneJson(godAgents || []),
    monster: monster ? cloneJson(monster) : null,
    hero: hero ? cloneJson(hero) : null,
    migrants: cloneJson(migrants || []),
    militaryCampaign: (typeof serializeMilitaryCampaign === 'function') ? serializeMilitaryCampaign() : null,
    mapSeed,
    activeObjectives: activeObjectives.map(o => Object.assign({}, o)),
    completedColonies: completedColonies.slice(),
    colonyTroopBonus,
    tickCount: DEBUG.tickCount,
    ...(typeof serializeGodDispositions === 'function' ? serializeGodDispositions() : {}),
    ...(typeof serializeAdventureState === 'function' ? serializeAdventureState() : {}),
  };
}

function applySnapshotToGame(snapshot){
  grid = sanitizeGrid(cloneJson(snapshot.grid));
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  resources = mergeResources(snapshot.resources || {});
  treasury = snapshot.treasury;
  favor = snapshot.favor;
  taxRate = snapshot.taxRate;
  productionMultiplier = snapshot.productionMultiplier || 1;
  productionEffectTicksLeft = snapshot.productionEffectTicksLeft || 0;
  totalWheatProduced = snapshot.totalWheatProduced || 0;
  victoryAnnounced = !!snapshot.victoryAnnounced;
  everHadPopulation = !!snapshot.everHadPopulation;
  zeroPopulationStreak = snapshot.zeroPopulationStreak || 0;
  bankruptStreak = snapshot.bankruptStreak || 0;
  defeatAnnounced = !!snapshot.defeatAnnounced;
  defeatReason = snapshot.defeatReason || null;
  festivalTicksLeft = snapshot.festivalTicksLeft || 0;
  worldCities = cloneJson(snapshot.worldCities || []);
  selectedWorldCityId = snapshot.selectedWorldCityId;
  diplomacy = cloneJson(snapshot.diplomacy || {});
  tradeRoutes = cloneJson(snapshot.tradeRoutes || {});
  selectedTradeCityId = snapshot.selectedTradeCityId;
  army = Object.assign({ morale: 1 }, snapshot.army || {});
  godAgents = cloneJson(snapshot.godAgents || []);
  monster = snapshot.monster ? cloneJson(snapshot.monster) : null;
  hero = snapshot.hero ? cloneJson(snapshot.hero) : null;
  migrants = cloneJson(snapshot.migrants || []);
  mapSeed = snapshot.mapSeed || 0;
  activeObjectives = (snapshot.activeObjectives || []).map(o => Object.assign({}, o));
  completedColonies = (snapshot.completedColonies || []).slice();
  colonyTroopBonus = snapshot.colonyTroopBonus || 0;
  DEBUG.tickCount = snapshot.tickCount || 0;
  if (typeof restoreGodDispositions === 'function' && snapshot.godSatisfaction){
    restoreGodDispositions(snapshot);
  }
  if (typeof restoreAdventureState === 'function' && snapshot.adventureMissions){
    restoreAdventureState(snapshot);
  }
  if (typeof restoreMilitaryCampaign === 'function'){
    restoreMilitaryCampaign(snapshot.militaryCampaign || null);
  } else if (typeof resetMilitaryAgents === 'function'){
    resetMilitaryAgents();
  }
  ensureWorldState();
  ensureDiplomacyState();
  ensureTradeState();
  ensureArmyState();
}

function resetColonyLocalState(colonyDef){
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  if (typeof clearZonePlacementStart === 'function') clearZonePlacementStart();
  favor = 50;
  taxRate = TAX_RATE_DEFAULT;
  productionMultiplier = 1;
  productionEffectTicksLeft = 0;
  totalWheatProduced = 0;
  victoryAnnounced = false;
  everHadPopulation = false;
  zeroPopulationStreak = 0;
  bankruptStreak = 0;
  defeatAnnounced = false;
  defeatReason = null;
  festivalTicksLeft = 0;
  worldCities = [];
  selectedWorldCityId = null;
  if (typeof initDiplomacy === 'function') initDiplomacy();
  if (typeof initTrade === 'function') initTrade();
  initArmy();
  resetCreatures();
  resetMigrants();
  resetInvasion();
  if (typeof resetGodAgents === 'function') resetGodAgents();
  if (typeof resetMarketDay === 'function') resetMarketDay();
  if (typeof resetMilitaryAgents === 'function') resetMilitaryAgents();
  treasury = colonyDef.startingTreasury;
  resources = mergeResources(colonyDef.startingResources || {});
  if (typeof generateProceduralMap === 'function'){
    generateProceduralMap(colonyDef.mapSeed);
  } else {
    initGrid();
  }
  activeObjectives = colonyDef.objectives.map(o => Object.assign({}, o));
  recomputeAllWalkers();
  recomputeLabor();
}

function formatColonyRewards(rewards){
  const bits = [];
  if (rewards.troops) bits.push(`⚔️ +${rewards.troops}`);
  if (rewards.treasury) bits.push(`🪙 ${rewards.treasury} dr.`);
  for (const [res, amt] of Object.entries(rewards.resources || {})){
    if (amt > 0) bits.push(`${amt} ${t('resource.' + res)}`);
  }
  return bits.join(' · ');
}

function canLaunchColony(colonyId){
  if (gamePhase !== 'main') return false;
  if (!getColonyDef(colonyId)) return false;
  if (completedColonies.includes(colonyId)) return false;
  return canAfford(COLONY_LAUNCH_COST);
}

function confirmLaunchColony(colonyId){
  const def = getColonyDef(colonyId);
  if (!def) return;
  if (!canLaunchColony(colonyId)){
    showNotification(t('colony.cantLaunch'), 'bad');
    return;
  }
  if (typeof showChoice === 'function'){
    showChoice({
      title: t('colony.launchTitle', { name: t(def.nameKey) }),
      body: t('colony.launchBody', { cost: COLONY_LAUNCH_COST, rewards: formatColonyRewards(def.rewards) }),
      choices: [
        { label: t('colony.launchConfirm'), type: 'primary', onPick: () => launchColony(colonyId) },
        { label: t('dialog.cancel'), type: 'neutral' },
      ],
    });
  } else {
    launchColony(colonyId);
  }
}

function launchColony(colonyId){
  const def = getColonyDef(colonyId);
  if (!def || !canLaunchColony(colonyId)) return;
  if (!spend(COLONY_LAUNCH_COST)){
    showNotification(t('economy.cantAfford'), 'bad');
    return;
  }
  mainCitySnapshot = captureMainCitySnapshot();
  gamePhase = 'colony';
  activeColonyId = colonyId;
  resetColonyLocalState(def);
  if (typeof closePanels === 'function') closePanels();
  if (typeof centerMapView === 'function') centerMapView();
  showNotification(t('colony.started', { name: t(def.nameKey) }), 'good');
  debugInfo('Colonie lancée', { colonyId });
  refreshColonyUI();
  saveGame({ silent: true });
}

function applyColonyRewardsToSnapshot(snapshot, colonyDef){
  const rewards = colonyDef.rewards || {};
  snapshot.treasury = (snapshot.treasury || 0) + (rewards.treasury || 0);
  snapshot.colonyTroopBonus = (snapshot.colonyTroopBonus || 0) + (rewards.troops || 0);
  snapshot.resources = Object.assign({}, snapshot.resources);
  for (const [res, amt] of Object.entries(rewards.resources || {})){
    snapshot.resources[res] = (snapshot.resources[res] || 0) + amt;
  }
  if (!snapshot.completedColonies.includes(colonyDef.id)){
    snapshot.completedColonies.push(colonyDef.id);
  }
}

function returnToMainCity(snapshot, colonyDef, success){
  applySnapshotToGame(snapshot);
  gamePhase = 'main';
  activeColonyId = null;
  mainCitySnapshot = null;
  recomputeAllWalkers();
  recomputeLabor();
  if (typeof recomputeBeauty === 'function') recomputeBeauty();
  refreshColonyUI();
  if (typeof refreshUI === 'function') refreshUI();
  else {
    render();
    updateResourceBar();
    if (typeof renderHud === 'function') renderHud();
    renderObjectivesPanel();
  }
  saveGame({ silent: true });
  if (success && colonyDef){
    showNotification(t('colony.completedNotify', {
      name: t(colonyDef.nameKey),
      rewards: formatColonyRewards(colonyDef.rewards),
    }), 'good');
  }
}

function completeColony(){
  if (gamePhase !== 'colony' || !activeColonyId || !mainCitySnapshot) return;
  const def = getColonyDef(activeColonyId);
  if (!def) return;
  const snapshot = cloneJson(mainCitySnapshot);
  applyColonyRewardsToSnapshot(snapshot, def);
  returnToMainCity(snapshot, def, true);
  debugInfo('Colonie terminée avec succès', { colonyId: def.id });
}

function abandonColony(notify){
  if (gamePhase !== 'colony' || !mainCitySnapshot) return;
  const def = getColonyDef(activeColonyId);
  const snapshot = cloneJson(mainCitySnapshot);
  returnToMainCity(snapshot, null, false);
  if (notify !== false){
    showNotification(t('colony.abandoned', { name: def ? t(def.nameKey) : '' }), 'bad');
  }
  debugInfo('Colonie abandonnée', { colonyId: activeColonyId });
}

function buildColoniesObserverData(){
  const colonyRows = COLONY_DEFINITIONS.map(def => {
    const done = completedColonies.includes(def.id);
    const active = gamePhase === 'colony' && activeColonyId === def.id;
    let status = formatColonyRewards(def.rewards);
    if (done) status = t('colony.completed');
    else if (active) status = t('colony.inProgress');
    return [
      `${def.icon} ${t(def.nameKey)}`,
      status,
      done ? 'ok' : (active ? '' : ''),
    ];
  });

  const objectiveRows = (gamePhase === 'colony' && activeColonyId)
    ? activeObjectives.map(o => [
        t(o.nameKey),
        `${Math.floor(o.current || 0)}/${o.target}`,
        o.done ? 'ok' : '',
      ])
    : [[t('colony.selectHint'), '']];

  let actionsHtml = '';
  if (gamePhase === 'main'){
    actionsHtml = COLONY_DEFINITIONS.map(def => {
      const done = completedColonies.includes(def.id);
      const disabled = done || !canLaunchColony(def.id);
      return `<button class="actionBtn" ${disabled ? 'disabled' : ''} onclick="confirmLaunchColony('${def.id}')">${def.icon} ${t(def.nameKey)}</button>`;
    }).join('');
  } else {
    actionsHtml = `<button class="actionBtn" onclick="abandonColony(true)">${t('colony.abandon')}</button>`;
  }

  return {
    title: t('panel.colonies'),
    tiles: [
      {
        icon: '🏝️',
        title: t('panel.colonies'),
        status: `${completedColonies.length}/${COLONY_DEFINITIONS.length}`,
        rows: colonyRows,
      },
      {
        icon: '🎯',
        title: gamePhase === 'colony' ? t('panel.objectives') : t('colony.howTo'),
        status: gamePhase === 'colony' ? '' : `${COLONY_LAUNCH_COST} dr.`,
        rows: gamePhase === 'colony' ? objectiveRows : [
          [t('colony.howToText'), ''],
          [t('colony.launchCost', { cost: COLONY_LAUNCH_COST }), ''],
        ],
      },
    ],
    actions: false,
    actionsTitle: gamePhase === 'colony' ? t('colony.abandon') : t('colony.launch'),
    actionsHtml,
  };
}

function openColoniesPanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel) return;
  const data = buildColoniesObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}

function renderColonyHud(){
  const badge = document.getElementById('hudColonyBadge');
  const nameEl = document.getElementById('hudColonyName');
  if (!badge) return;
  if (gamePhase === 'colony' && activeColonyId){
    const def = getColonyDef(activeColonyId);
    badge.style.display = '';
    if (nameEl && def) nameEl.textContent = t(def.nameKey);
    badge.title = t('colony.inProgress');
  } else {
    badge.style.display = 'none';
  }
}

function refreshColonyUI(){
  renderColonyHud();
  if (typeof renderObjectivesPanel === 'function') renderObjectivesPanel();
}

function restoreColonyStateFromSave(payload){
  gamePhase = payload.gamePhase === 'colony' ? 'colony' : 'main';
  activeColonyId = payload.activeColonyId || null;
  completedColonies = Array.isArray(payload.completedColonies) ? payload.completedColonies.slice() : [];
  colonyTroopBonus = payload.colonyTroopBonus || 0;
  mainCitySnapshot = payload.mainCitySnapshot || null;
  if (gamePhase === 'colony' && activeColonyId){
    const def = getColonyDef(activeColonyId);
    if (def) activeObjectives = def.objectives.map(o => Object.assign({}, o));
  }
  refreshColonyUI();
}

function serializeColonyState(){
  return {
    gamePhase,
    activeColonyId,
    completedColonies,
    colonyTroopBonus,
    mainCitySnapshot: mainCitySnapshot ? cloneJson(mainCitySnapshot) : null,
  };
}
