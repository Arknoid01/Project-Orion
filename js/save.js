/* ===================== SAUVEGARDE (localStorage, multi-emplacements) ===================== */
const LEGACY_SAVE_KEY = 'olympos_save_v1';
const SAVE_KEY_PREFIX = 'olympos_save_v1_slot_';
const SAVE_META_KEY = 'olympos_save_meta_v1';
const SAVE_VERSION = 9;
const SAVE_SLOT_COUNT = 5;

let activeSaveSlot = 0;

function getSaveSlotStorageKey(slot){
  return SAVE_KEY_PREFIX + slot;
}

function readSaveMeta(){
  try {
    const raw = localStorage.getItem(SAVE_META_KEY);
    if (!raw) return { activeSlot: 0 };
    const meta = JSON.parse(raw);
    return meta && typeof meta === 'object' ? meta : { activeSlot: 0 };
  } catch {
    return { activeSlot: 0 };
  }
}

function writeSaveMeta(meta){
  try { localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

function getActiveSaveSlot(){
  return activeSaveSlot;
}

function setActiveSaveSlot(slot){
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return;
  activeSaveSlot = slot;
  const meta = readSaveMeta();
  meta.activeSlot = slot;
  writeSaveMeta(meta);
}

function migrateLegacySaveIfNeeded(){
  try {
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!legacy) return;
    if (localStorage.getItem(getSaveSlotStorageKey(0))) return;
    localStorage.setItem(getSaveSlotStorageKey(0), legacy);
    localStorage.removeItem(LEGACY_SAVE_KEY);
    setActiveSaveSlot(0);
    debugInfo('Sauvegarde migrée vers l\'emplacement 1');
  } catch { /* ignore */ }
}

function readRawSaveSlot(slot){
  try {
    return localStorage.getItem(getSaveSlotStorageKey(slot));
  } catch {
    return null;
  }
}

function parseSavePayload(raw){
  if (!raw) return null;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    debugError('Sauvegarde corrompue (JSON invalide)', { error: err.message });
    return null;
  }
  if (!payload || !Array.isArray(payload.grid)) return null;
  if (payload.version !== SAVE_VERSION && payload.version !== 8 && payload.version !== 7 && payload.version !== 6
      && payload.version !== 5 && payload.version !== 4 && payload.version !== 3
      && payload.version !== 2 && payload.version !== 1){
    debugWarn('Sauvegarde dans un format inattendu, ignorée');
    return null;
  }
  if (payload.grid.length !== GRID_ROWS || payload.grid.some(row => !Array.isArray(row) || row.length !== GRID_COLS)){
    debugWarn('Dimensions de grille incompatibles dans la sauvegarde, ignorée');
    return null;
  }
  return payload;
}

function buildSaveSlotSummary(payload){
  if (!payload) return null;
  const meta = payload.saveMeta || {};
  const tickCount = payload.tickCount || 0;
  let calendarYear = meta.calendarYear;
  let calendarDay = meta.calendarDay;
  if (typeof getCalendarState === 'function' && typeof DAY_DURATION_TICKS !== 'undefined'){
    const day = Math.floor(tickCount / DAY_DURATION_TICKS) + 1;
    calendarDay = day;
    if (typeof MONTHS !== 'undefined' && typeof DAYS_PER_MONTH !== 'undefined'){
      calendarYear = Math.floor((day - 1) / (DAYS_PER_MONTH * MONTHS.length)) + 1;
    }
  }
  return {
    slot: typeof meta.slot === 'number' ? meta.slot : null,
    savedAt: meta.savedAt || 0,
    scenarioId: payload.scenarioId || meta.scenarioId || 'sandbox',
    playerCityName: meta.playerCityName || payload.playerCityName || null,
    population: typeof meta.population === 'number' ? meta.population : null,
    treasury: typeof payload.treasury === 'number' ? payload.treasury : null,
    calendarYear: calendarYear || 1,
    calendarDay: calendarDay || 1,
    tickCount,
  };
}

function peekSaveSlot(slot){
  return buildSaveSlotSummary(parseSavePayload(readRawSaveSlot(slot)));
}

function listSaveSlots(){
  const slots = [];
  for (let i = 0; i < SAVE_SLOT_COUNT; i++){
    slots.push({ slot: i, summary: peekSaveSlot(i) });
  }
  return slots;
}

function findSaveSlotForNewGame(){
  for (let i = 0; i < SAVE_SLOT_COUNT; i++){
    if (!peekSaveSlot(i)) return i;
  }
  let oldestSlot = 0;
  let oldestAt = Infinity;
  for (let i = 0; i < SAVE_SLOT_COUNT; i++){
    const summary = peekSaveSlot(i);
    if (summary && summary.savedAt < oldestAt){
      oldestAt = summary.savedAt;
      oldestSlot = i;
    }
  }
  return oldestSlot;
}

function assignSaveSlotForNewGame(){
  setActiveSaveSlot(findSaveSlotForNewGame());
}

function formatSaveScenarioLabel(scenarioId){
  if (!scenarioId) return t('save.unknownScenario');
  if (String(scenarioId).startsWith('campaign:')) return t('save.campaignGame');
  if (typeof getScenario === 'function'){
    const s = getScenario(scenarioId);
    if (s && s.nameKey) return t(s.nameKey);
  }
  return scenarioId;
}

function formatSaveSlotDate(savedAt){
  if (!savedAt) return '';
  try {
    return new Date(savedAt).toLocaleString(currentLang === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function serializeGridForSave(sourceGrid){
  const out = [];
  for (let row = 0; row < GRID_ROWS; row++){
    const line = [];
    for (let col = 0; col < GRID_COLS; col++){
      const cell = (sourceGrid[row] && sourceGrid[row][col]) || {};
      line.push({
        terrain: cell.terrain || 'grass',
        building: cell.building || null,
        hasRoad: !!cell.hasRoad,
        roadStairs: !!cell.roadStairs,
        houseLevel: cell.houseLevel || 0,
        population: cell.population || 0,
        patrolBlock: !!cell.patrolBlock,
        beauty: typeof cell.beauty === 'number' ? cell.beauty : 0,
        elevation: typeof cell.elevation === 'number' ? cell.elevation : 0,
        level: typeof cell.level === 'number' ? cell.level : undefined,
        slope: typeof cell.slope === 'number' ? cell.slope : 0,
        monumentPart: cell.monumentPart || null,
        godPatron: cell.godPatron || null,
      });
    }
    out.push(line);
  }
  return out;
}

function buildSavePayload(slot){
  const cal = typeof getCalendarState === 'function' ? getCalendarState() : null;
  const population = typeof computeTotalPopulation === 'function' ? computeTotalPopulation() : null;
  return {
    version: SAVE_VERSION,
    grid: serializeGridForSave(grid),
    resources: Object.assign({}, resources || {}),
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
    venueEventTicksLeft,
    lastVenueEventDay,
    ...(typeof lastOracleCheckDay !== 'undefined' ? { lastOracleCheckDay } : {}),
    diplomacy,
    worldCities,
    selectedWorldCityId,
    tradeRoutes,
    selectedTradeCityId,
    army: Object.assign({}, army || {}),
    fleet: (typeof fleet !== 'undefined') ? Object.assign({}, fleet || {}) : { ships: 0 },
    shipyardAutoBuild: (typeof shipyardAutoBuild !== 'undefined') ? !!shipyardAutoBuild : true,
    godAgents: Array.isArray(godAgents) ? godAgents : [],
    monster: monster || null,
    hero: hero || null,
    migrants: Array.isArray(migrants) ? migrants : [],
    militaryCampaign: (typeof serializeMilitaryCampaign === 'function') ? serializeMilitaryCampaign() : null,
    scenarioId: currentScenarioId,
    mapSeed: (typeof mapSeed !== 'undefined') ? mapSeed : 0,
    ...(typeof serializeMapMetadataForSave === 'function' ? serializeMapMetadataForSave() : {}),
    ...(typeof serializeCampaignForSave === 'function' ? serializeCampaignForSave() : {}),
    tickCount: (typeof DEBUG !== 'undefined' && DEBUG) ? DEBUG.tickCount : 0,
    lang: currentLang,
    ...(typeof serializeGodDispositions === 'function' ? serializeGodDispositions() : {}),
    ...(typeof serializeAdventureState === 'function' ? serializeAdventureState() : {}),
    ...(typeof serializeColonyState === 'function' ? serializeColonyState() : {}),
    playerCityName: (typeof getPlayerCityName === 'function') ? getPlayerCityName() : (typeof playerCityName === 'string' ? playerCityName : 'Olympos'),
    saveMeta: {
      slot,
      savedAt: Date.now(),
      scenarioId: currentScenarioId,
      playerCityName: (typeof getPlayerCityName === 'function') ? getPlayerCityName() : (typeof playerCityName === 'string' ? playerCityName : 'Olympos'),
      population,
      treasury,
      calendarYear: cal ? cal.year : 1,
      calendarDay: cal ? cal.day : 1,
    },
  };
}

function saveGame(opts){
  opts = opts || {};
  const slot = typeof opts.slot === 'number' ? opts.slot : activeSaveSlot;
  try {
    const payload = buildSavePayload(slot);
    localStorage.setItem(getSaveSlotStorageKey(slot), JSON.stringify(payload));
    setActiveSaveSlot(slot);
    debugInfo(opts.silent ? 'Sauvegarde automatique' : 'Partie sauvegardée', { slot: slot + 1 });
    if (!opts.silent){
      showNotification(t('save.savedSlot', { n: slot + 1 }), 'good');
    }
  } catch (err) {
    debugError('Échec de la sauvegarde', { error: err.message });
    if (!opts.silent) showNotification(t('save.saveError'), 'bad');
  }
}

function sanitizeGrid(loadedGrid){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = loadedGrid[row][col] || {};
      loadedGrid[row][col] = {
        terrain: cell.terrain || 'grass',
        building: cell.building || null,
        hasRoad: !!cell.hasRoad,
        roadStairs: !!cell.roadStairs,
        houseLevel: cell.houseLevel || 0,
        population: cell.population || 0,
        patrolBlock: !!cell.patrolBlock,
        beauty: typeof cell.beauty === 'number' ? cell.beauty : 0,
        elevation: typeof cell.elevation === 'number' ? cell.elevation : 0.4,
        level: typeof cell.level === 'number' ? cell.level : undefined,
        slope: typeof cell.slope === 'number' ? cell.slope : 0,
        monumentPart: cell.monumentPart || null,
        godPatron: cell.godPatron || null,
      };
      if (typeof syncCellLevelElevation === 'function'){
        syncCellLevelElevation(loadedGrid[row][col]);
      }
    }
  }
  return loadedGrid;
}

function applySavePayload(payload){
  grid = sanitizeGrid(payload.grid);
  if (typeof payload.mapSeed === 'number') mapSeed = payload.mapSeed;
  if (typeof restoreMapMetadataFromSave === 'function') restoreMapMetadataFromSave(payload);
  if (typeof applyHeightMapToGrid === 'function'){
    applyHeightMapToGrid(mapSeed, {
      landStyleRestored: !!(payload.mapLandStyle),
      skipEdgePolish: true,
    });
  } else if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  resources = mergeResources(payload.resources || {});
  treasury = typeof payload.treasury === 'number' ? payload.treasury : STARTING_TREASURY;
  favor = typeof payload.favor === 'number' ? payload.favor : 50;
  if (typeof restoreGodDispositions === 'function' && payload.godSatisfaction){
    restoreGodDispositions(payload);
  } else if (typeof initGodDispositionsLegacy === 'function'){
    initGodDispositionsLegacy(favor);
  } else if (typeof initGodDispositions === 'function'){
    initGodDispositions(false);
  }
  taxRate = typeof payload.taxRate === 'number' ? payload.taxRate : TAX_RATE_DEFAULT;
  productionMultiplier = payload.productionMultiplier || 1;
  productionEffectTicksLeft = payload.productionEffectTicksLeft || 0;
  totalWheatProduced = payload.totalWheatProduced || 0;
  victoryAnnounced = !!payload.victoryAnnounced;
  everHadPopulation = !!payload.everHadPopulation;
  zeroPopulationStreak = typeof payload.zeroPopulationStreak === 'number' ? payload.zeroPopulationStreak : 0;
  bankruptStreak = typeof payload.bankruptStreak === 'number' ? payload.bankruptStreak : 0;
  defeatAnnounced = !!payload.defeatAnnounced;
  defeatReason = payload.defeatReason || null;
  festivalTicksLeft = payload.festivalTicksLeft || 0;
  venueEventTicksLeft = payload.venueEventTicksLeft || 0;
  if (typeof lastVenueEventDay !== 'undefined'){
    lastVenueEventDay = typeof payload.lastVenueEventDay === 'number' ? payload.lastVenueEventDay : -1;
  }
  if (typeof lastOracleCheckDay !== 'undefined' && typeof payload.lastOracleCheckDay === 'number'){
    lastOracleCheckDay = payload.lastOracleCheckDay;
  }
  if (Array.isArray(payload.worldCities)) worldCities = payload.worldCities;
  if (typeof payload.selectedWorldCityId === 'number') selectedWorldCityId = payload.selectedWorldCityId;
  ensureWorldState();
  if (payload.diplomacy) diplomacy = payload.diplomacy;
  ensureDiplomacyState();
  if (payload.tradeRoutes) tradeRoutes = payload.tradeRoutes;
  if (typeof payload.selectedTradeCityId === 'number') selectedTradeCityId = payload.selectedTradeCityId;
  ensureTradeState();
  if (payload.army) army = payload.army;
  ensureArmyState();
  if (payload.fleet) fleet = Object.assign({ ships: 0 }, payload.fleet);
  else if (typeof initFleet === 'function') initFleet();
  else if (typeof ensureFleetState === 'function') ensureFleetState();
  if (typeof shipyardAutoBuild !== 'undefined'){
    shipyardAutoBuild = payload.shipyardAutoBuild !== false;
  }
  if (Array.isArray(payload.godAgents)) godAgents = payload.godAgents;
  else if (typeof initGodAgentsFromMonuments === 'function') initGodAgentsFromMonuments();
  monster = payload.monster || null;
  hero = payload.hero || null;
  if (Array.isArray(payload.migrants)) migrants = payload.migrants;
  else if (typeof resetMigrants === 'function') resetMigrants();
  if (typeof restoreMilitaryCampaign === 'function'){
    restoreMilitaryCampaign(payload.militaryCampaign || null);
  } else if (typeof resetMilitaryAgents === 'function'){
    resetMilitaryAgents();
  }
  if (typeof restoreCampaignFromSave === 'function') restoreCampaignFromSave(payload);

  if (payload.scenarioId){
    currentScenarioId = payload.scenarioId;
    if (String(payload.scenarioId).startsWith('campaign:')){
      if (typeof restoreCampaignObjectivesAfterLoad === 'function') restoreCampaignObjectivesAfterLoad();
    } else if (typeof applyScenarioObjectives === 'function'){
      applyScenarioObjectives(getScenario(currentScenarioId));
    }
  }
  DEBUG.tickCount = payload.tickCount || 0;
  if (payload.lang) currentLang = payload.lang;
  document.documentElement.lang = currentLang;
  try { localStorage.setItem('olympos_lang', currentLang); } catch { /* ignore */ }
  if (typeof restoreColonyStateFromSave === 'function') restoreColonyStateFromSave(payload);

  if (payload.playerCityName) initPlayerCityName(payload.playerCityName);
  else if (payload.saveMeta && payload.saveMeta.playerCityName) initPlayerCityName(payload.saveMeta.playerCityName);
  else if (typeof initPlayerCityName === 'function') initPlayerCityName();

  if (typeof restoreAdventureState === 'function') restoreAdventureState(payload);
  else if (typeof resetAdventures === 'function') resetAdventures();

  if (typeof resumeDefeatStateAfterLoad === 'function') resumeDefeatStateAfterLoad();

  recomputeAllWalkers();
  recomputeLabor();
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
}

function loadGame(slot){
  migrateLegacySaveIfNeeded();
  if (slot == null){
    const meta = readSaveMeta();
    slot = typeof meta.activeSlot === 'number' ? meta.activeSlot : 0;
  }
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return false;

  const payload = parseSavePayload(readRawSaveSlot(slot));
  if (!payload) return false;

  try {
    applySavePayload(payload);
    setActiveSaveSlot(slot);
    debugInfo('Partie chargée depuis la sauvegarde', { slot: slot + 1 });
    return true;
  } catch (err) {
    debugError('Échec du chargement de la sauvegarde', { error: err.message });
    return false;
  }
}

function tryAutoLoadOnStartup(){
  migrateLegacySaveIfNeeded();
  const meta = readSaveMeta();
  if (typeof meta.activeSlot === 'number' && peekSaveSlot(meta.activeSlot)){
    return loadGame(meta.activeSlot);
  }
  let bestSlot = -1;
  let bestAt = -1;
  for (let i = 0; i < SAVE_SLOT_COUNT; i++){
    const summary = peekSaveSlot(i);
    if (summary && summary.savedAt > bestAt){
      bestAt = summary.savedAt;
      bestSlot = i;
    }
  }
  if (bestSlot >= 0) return loadGame(bestSlot);
  return false;
}

function deleteSaveSlot(slot){
  try {
    localStorage.removeItem(getSaveSlotStorageKey(slot));
    debugInfo('Emplacement de sauvegarde supprimé', { slot: slot + 1 });
  } catch (err) {
    debugError('Impossible de supprimer la sauvegarde', { error: err.message });
  }
}

function deleteSave(slot){
  deleteSaveSlot(typeof slot === 'number' ? slot : activeSaveSlot);
}

window.getActiveSaveSlot = getActiveSaveSlot;
window.setActiveSaveSlot = setActiveSaveSlot;
window.peekSaveSlot = peekSaveSlot;
window.listSaveSlots = listSaveSlots;
window.assignSaveSlotForNewGame = assignSaveSlotForNewGame;
window.formatSaveScenarioLabel = formatSaveScenarioLabel;
window.formatSaveSlotDate = formatSaveSlotDate;
window.tryAutoLoadOnStartup = tryAutoLoadOnStartup;
window.saveGameToSlot = function(slot){
  saveGame({ slot, silent: false });
  if (typeof closePanels === 'function') closePanels();
  if (typeof hideMainMenu === 'function') hideMainMenu();
};
window.loadGameFromSlot = function(slot){
  if (!peekSaveSlot(slot)){
    showNotification(t('save.slotEmpty', { n: slot + 1 }), 'bad');
    return;
  }
  if (loadGame(slot)){
    hideMainMenu();
    if (typeof closePanels === 'function') closePanels();
    applyGameUITranslations();
    refreshUI();
    if (typeof centerMapView === 'function') centerMapView();
    showNotification(t('save.loadedSlot', { n: slot + 1 }), 'good');
  } else {
    showNotification(t('save.loadError'), 'bad');
  }
};
window.deleteSaveSlotWithConfirm = function(slot){
  if (!peekSaveSlot(slot)) return;
  const msg = t('save.confirmDelete', { n: slot + 1 });
  if (typeof showConfirm === 'function'){
    showConfirm(t('save.deleteTitle'), msg, () => {
      deleteSaveSlot(slot);
      if (typeof renderSaveSlotList === 'function') renderSaveSlotList(window._saveSlotListMode || 'load');
      showNotification(t('save.deletedSlot', { n: slot + 1 }), 'good');
    });
  } else if (confirm(msg)){
    deleteSaveSlot(slot);
    if (typeof renderSaveSlotList === 'function') renderSaveSlotList(window._saveSlotListMode || 'load');
  }
};

migrateLegacySaveIfNeeded();
activeSaveSlot = readSaveMeta().activeSlot || 0;
