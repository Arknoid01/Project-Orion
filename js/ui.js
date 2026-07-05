/* ===================== NOTIFICATIONS & CHRONIQUE ===================== */
// Bannière temporaire + chronique consultable via 📜 (barre d'outils flottante).
// category : 'event' | 'oracle' | 'chronicle'
const NOTIFICATION_HISTORY_MAX = 60;
let notificationHistory = [];
let notificationTimer = null;

function _escNotifHtml(text){
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _historyCalendarMeta(){
  if (typeof getCalendarState !== 'function'){
    return { gameDay: 0, gameYear: 1, gameMonth: '', gameDayOfMonth: 1 };
  }
  const s = getCalendarState();
  return {
    gameDay: s.day,
    gameYear: s.year,
    gameMonth: s.month,
    gameDayOfMonth: s.dayOfMonth,
  };
}

function formatChronicleDate(entry){
  if (!entry || !entry.gameMonth) return '';
  const month = t('calendar.month.' + entry.gameMonth);
  return t('chronicle.date', {
    month,
    year: entry.gameYear || 1,
    day: entry.gameDayOfMonth || 1,
  });
}

function pushNotificationHistory(message, type, meta){
  meta = meta || {};
  const cal = _historyCalendarMeta();
  notificationHistory.unshift({
    message: String(message),
    type: type || 'info',
    time: Date.now(),
    category: meta.category || 'event',
    major: !!meta.major,
    gameDay: cal.gameDay,
    gameYear: cal.gameYear,
    gameMonth: cal.gameMonth,
    gameDayOfMonth: cal.gameDayOfMonth,
  });
  if (notificationHistory.length > NOTIFICATION_HISTORY_MAX){
    notificationHistory.length = NOTIFICATION_HISTORY_MAX;
  }
}

/** Entrée majeure dans la chronique (📜) avec toast. */
function chronicleLog(message, type){
  showNotification(message, type || 'good', { category: 'chronicle', major: true });
}

function notifyMajor(message, type){
  if (typeof chronicleLog === 'function') chronicleLog(message, type || 'good');
  else showNotification(message, type || 'good');
}

function showNotification(message, type, opts){
  opts = opts || {};
  const el = document.getElementById('notification');
  if (!el){
    pushNotificationHistory(message, type, opts);
    if (typeof debugInfo === 'function') debugInfo('[notification ignorée, élément absent]', { message });
    return;
  }
  pushNotificationHistory(message, type, opts);
  const prefix = opts.toastPrefix || (
    opts.category === 'oracle' ? '🔮 ' : opts.category === 'chronicle' ? '📜 ' : ''
  );
  el.textContent = prefix + message;
  el.className = `show notif-${type || 'info'}`;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => { el.className = ''; }, opts.category === 'oracle' ? 5500 : 4500);
  const panel = document.getElementById('notificationHistoryPanel');
  if (panel && panel.classList.contains('open') && typeof renderNotificationHistoryPanel === 'function'){
    renderNotificationHistoryPanel();
  }
}

function _chronicleCategoryIcon(category){
  if (category === 'oracle') return '🔮';
  if (category === 'chronicle') return '📜';
  return '·';
}

function renderNotificationHistoryPanel(){
  const list = document.getElementById('notificationHistoryList');
  if (!list) return;
  if (!notificationHistory.length){
    let html = `<p class="manageHint">${t('notification.empty')}</p>`;
    if (typeof hasOracleAccess === 'function' && !hasOracleAccess()){
      html += `<p class="manageHint chronicleOracleHint">${t('notification.oracleHint')}</p>`;
    }
    list.innerHTML = html;
    return;
  }
  list.innerHTML = notificationHistory.map(entry => {
    const cls = [
      'notifHistoryItem',
      entry.type === 'good' ? 'notif-good' : entry.type === 'bad' ? 'notif-bad' : 'notif-info',
      entry.category === 'oracle' ? 'notif-oracle' : '',
      entry.category === 'chronicle' ? 'notif-chronicle' : '',
      entry.major ? 'notif-major' : '',
    ].filter(Boolean).join(' ');
    const date = formatChronicleDate(entry);
    const icon = _chronicleCategoryIcon(entry.category);
    return `<div class="${cls}">`
      + `<span class="notifHistoryIcon" aria-hidden="true">${icon}</span>`
      + `<div class="notifHistoryBody">`
      + `<span class="notifHistoryTime">${_escNotifHtml(date)}</span>`
      + `<span class="notifHistoryText">${_escNotifHtml(entry.message)}</span>`
      + `</div></div>`;
  }).join('');
}

function toggleNotificationHistoryPanel(){
  const panel = document.getElementById('notificationHistoryPanel');
  if (!panel) return;
  const wasOpen = panel.classList.contains('open');
  if (typeof togglePanel === 'function') togglePanel('notificationHistoryPanel');
  else panel.classList.toggle('open');
  if (!wasOpen && panel.classList.contains('open')) renderNotificationHistoryPanel();
}

window.renderNotificationHistoryPanel = renderNotificationHistoryPanel;
window.toggleNotificationHistoryPanel = toggleNotificationHistoryPanel;
window.chronicleLog = chronicleLog;
window.notifyMajor = notifyMajor;
window.pushNotificationHistory = pushNotificationHistory;

/* ===================== TIROIR MOBILE ===================== */
function toggleDrawer(){
  const drawer = document.getElementById('sideDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer) drawer.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('open');
}

function closeDrawerIfMobile(){
  // ne ferme que si le tiroir est en mode "overlay" (mobile) ; inoffensif sur desktop
  if (window.innerWidth <= 860){
    const drawer = document.getElementById('sideDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }
}

/* ===================== ETAT UI ===================== */
let selectedBuilding = null; // clé de BUILDING_DEFS
let demolishMode = false;
let roadMode = false;
let stairsMode = false;
let blockMode = false; // pose/retrait de borne de blocage de patrouille
let hoverTile = null;
let inspectedTile = null; // { col, row } de la dernière case cliquée, pour rafraîchir l'inspecteur à chaque tick
let zonePlacementStart = null; // 1er coin pour pose en zone (2 clics)

/* ===================== POSE EN ZONE (2 clics) ===================== */
function tilesInRect(c1, r1, c2, r2){
  const cMin = Math.min(c1, c2);
  const cMax = Math.max(c1, c2);
  const rMin = Math.min(r1, r2);
  const rMax = Math.max(r1, r2);
  const tiles = [];
  for (let row = rMin; row <= rMax; row++){
    for (let col = cMin; col <= cMax; col++){
      if (inBounds(col, row)) tiles.push({ col, row });
    }
  }
  return tiles;
}

function supportsZonePlacement(){
  if (roadMode) return true;
  if (!selectedBuilding) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  if (!def || def.isMonument || def.costResources) return false;
  if (def.footprint && def.footprint > 1) return false;
  return true;
}

function zonePlaceableTiles(c1, r1, c2, r2){
  return tilesInRect(c1, r1, c2, r2).filter(t => {
    if (roadMode) return canPlaceRoadTerrain(t.col, t.row);
    return canPlaceTerrain(t.col, t.row);
  });
}

function zonePlacementCost(tiles){
  if (roadMode) return tiles.length * ROAD_COST;
  const def = BUILDING_DEFS[selectedBuilding];
  return def ? tiles.length * def.cost : 0;
}

function clearZonePlacementStart(){
  zonePlacementStart = null;
}

function updateZonePlacementUI(){
  if (!supportsZonePlacement()) return;
  const targets = [
    { text: 'catalogBuildInfoText', cost: 'catalogBuildInfoCost' },
    { text: 'buildInfoText', cost: 'buildInfoCost' },
  ];
  const hint = zonePlacementStart ? t('build.zoneSecondClick') : t('build.zoneFirstClick');
  let costLine = '';
  if (roadMode){
    costLine = t('build.cost') + ' : 🪙 ' + ROAD_COST + ' dr. / ' + t('build.zonePerTile');
  } else if (selectedBuilding){
    costLine = buildingCostSummary(selectedBuilding) + ' / ' + t('build.zonePerTile');
  }
  if (zonePlacementStart && hoverTile && inBounds(hoverTile.col, hoverTile.row)){
    const tiles = zonePlaceableTiles(
      zonePlacementStart.col, zonePlacementStart.row,
      hoverTile.col, hoverTile.row
    );
    costLine = t('build.zoneCost', { cost: zonePlacementCost(tiles), tiles: tiles.length });
  }
  targets.forEach(ids => {
    const textEl = document.getElementById(ids.text);
    const costEl = document.getElementById(ids.cost);
    if (textEl) textEl.textContent = hint;
    if (costEl) costEl.textContent = costLine;
  });
}

function placeCellBuilding(col, row, key){
  const cell = grid[row][col];
  cell.building = key;
  if (key === 'maison'){
    cell.houseLevel = 0;
    cell.population = 0;
    if (typeof queueHouseSettlement !== 'function' || !queueHouseSettlement(col, row)){
      cell.population = HOUSE_LEVELS[0].population;
    }
  }
  if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
  else if (typeof invalidateDecorAt === 'function') invalidateDecorAt([{ col, row }]);
  if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
  if (typeof onBuildingPlaced === 'function') onBuildingPlaced(key, col, row);
}

function confirmZonePlacement(c1, r1, c2, r2){
  const tiles = zonePlaceableTiles(c1, r1, c2, r2);
  if (tiles.length === 0) return { ok: false, reason: 'none' };
  const cost = zonePlacementCost(tiles);
  if (!canAfford(cost)) return { ok: false, reason: 'afford' };
  if (!spend(cost)) return { ok: false, reason: 'afford' };
  if (roadMode){
    tiles.forEach(t => { grid[t.row][t.col].hasRoad = true; });
    if (typeof patchThreeDecors === 'function') patchThreeDecors(tiles);
    if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
    return { ok: true, kind: 'road', count: tiles.length, cost };
  }
  const def = BUILDING_DEFS[selectedBuilding];
  tiles.forEach(t => placeCellBuilding(t.col, t.row, selectedBuilding));
  return { ok: true, kind: 'building', count: tiles.length, cost, icon: def.icon, name: t(def.name) };
}

function handleZonePlacementClick(col, row){
  if (!zonePlacementStart){
    zonePlacementStart = { col, row };
    updateZonePlacementUI();
    return;
  }
  const result = confirmZonePlacement(zonePlacementStart.col, zonePlacementStart.row, col, row);
  zonePlacementStart = null;
  updateZonePlacementUI();
  if (result.ok){
    recomputeAllWalkers();
    if (result.kind === 'road'){
      showNotification(t('build.zoneBuiltRoads', { n: result.count, cost: result.cost }), 'good');
    } else {
      showNotification(t('build.zoneBuiltBuildings', {
        icon: result.icon, n: result.count, cost: result.cost,
      }), 'good');
    }
  } else if (result.reason === 'afford'){
    showNotification(t('economy.cantAfford'), 'bad');
  } else {
    showNotification(t('build.zoneNone'), 'bad');
  }
  recomputeBeauty();
  renderInspector(col, row);
  renderTradePanel();
  render();
  updateResourceBar();
  if (typeof renderHud === 'function') renderHud();
}

/* ===================== REGLES DE PLACEMENT ===================== */
// Vérifie uniquement le terrain/occupation (sans le coût) — sert à distinguer
// "emplacement invalide" de "trop cher" pour la notification au clic.
function canPlaceTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  if (!def) return false;
  if (def.footprint && def.footprint > 1){
    return typeof canPlaceMonumentTerrain === 'function' && canPlaceMonumentTerrain(col, row, selectedBuilding);
  }
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  if (cell.terrain !== def.validTerrain && !terrainMatchesBuilding(cell.terrain, def.validTerrain)) return false;
  if (def.requiresNearWater && typeof isAdjacentToWater === 'function' && !isAdjacentToWater(col, row)) return false;
  if (def.requiresNearHarbor && typeof isAdjacentToHarbor === 'function' && !isAdjacentToHarbor(col, row)) return false;
  return true;
}

// Version complète (terrain + budget) utilisée pour la surbrillance de survol.
function canPlace(col, row){
  if (!canPlaceTerrain(col, row)) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  if (def.isMonument) return true;
  if (def.costResources || (def.footprint && def.footprint > 1)){
    return typeof canAffordBuilding === 'function' && canAffordBuilding(selectedBuilding);
  }
  return canAfford(def.cost);
}

function canPlaceRoadTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  return isRoadTerrain(cell.terrain);
}

function canPlaceRoad(col, row){
  return canPlaceRoadTerrain(col, row) && canAfford(ROAD_COST);
}

function canToggleBlock(col, row){
  if (!inBounds(col, row)) return false;
  return grid[row][col].hasRoad === true;
}

/* ===================== SELECTION (boutons + callGameAction de la nouvelle UI) ===================== */
// Fonctions canoniques, appelables des DEUX interfaces : les boutons de l'ancienne
// (#roadBtn etc.) ET les cartes de la nouvelle (via callGameAction('selectRoadMode')
// etc., déjà présent dans son HTML). Une seule logique, pas de duplication.
function selectBuilding(key){
  if (!BUILDING_DEFS[key]){
    showNotification(t('action.notYetAvailable'), 'bad'); // ex: 'barracks' (Guerre, pas encore construit)
    return;
  }
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  stairsMode = false;
  clearZonePlacementStart();
  selectedBuilding = (selectedBuilding === key) ? null : key;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
  updateBuildInfoPanel(selectedBuilding);
  if (supportsZonePlacement()) updateZonePlacementUI();
}

// Affiche nom, description et coût dans les panneaux de construction (#buildInfo et #catalogBuildInfo).
function updateBuildInfoPanel(key){
  const targets = [
    { title: 'buildInfoTitle', text: 'buildInfoText', cost: 'buildInfoCost' },
    { title: 'catalogBuildInfoTitle', text: 'catalogBuildInfoText', cost: 'catalogBuildInfoCost' },
  ];
  targets.forEach(ids => {
    const tEl = document.getElementById(ids.title);
    const dEl = document.getElementById(ids.text);
    const cEl = document.getElementById(ids.cost);
    if (!tEl && !dEl && !cEl) return;
    if (!key){
      if (tEl) tEl.textContent = t('build.selectTitle');
      if (dEl) dEl.textContent = t('build.selectHint');
      if (cEl) cEl.textContent = '';
      return;
    }
    const def = BUILDING_DEFS[key];
    if (!def) return;
    if (tEl) tEl.textContent = t(def.name);
    const descKey = 'building.desc.' + key;
    if (dEl) dEl.textContent = t(descKey) !== descKey ? t(descKey) : '';
    if (cEl){
      if (def.isMonument){
        cEl.textContent = '';
      } else if (def.costResources){
        cEl.textContent = t('build.cost') + ' : ' + (typeof monumentCostLabel === 'function' ? monumentCostLabel(key) : `${def.cost} dr.`);
      } else {
        cEl.textContent = t('build.cost') + ' : 🪙 ' + def.cost + ' dr.';
      }
    }
  });
}

function buildingCostSummary(key){
  const def = BUILDING_DEFS[key];
  if (!def) return '';
  if (def.isMonument) return '';
  if (def.costResources) return t('build.cost') + ' : ' + monumentCostLabel(key);
  return t('build.cost') + ' : 🪙 ' + def.cost + ' dr.';
}

function selectStairsMode(){
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  clearZonePlacementStart();
  stairsMode = !stairsMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
  updateStairsBuildInfo();
}

function updateStairsBuildInfo(){
  if (!stairsMode) return;
  const cost = typeof STAIR_COST === 'number' ? STAIR_COST : 8;
  const hint = t('stairs.hint');
  const costLine = t('build.cost') + ' : 🪙 ' + cost + ' dr. / ' + t('stairs.perTile');
  ['catalogBuildInfoText', 'buildInfoText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = hint;
  });
  ['catalogBuildInfoCost', 'buildInfoCost'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = costLine;
  });
}

function selectRoadMode(){
  selectedBuilding = null;
  demolishMode = false;
  blockMode = false;
  stairsMode = false;
  clearZonePlacementStart();
  roadMode = !roadMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
  updateZonePlacementUI();
}

function selectBlockMode(){
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  stairsMode = false;
  clearZonePlacementStart();
  blockMode = !blockMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
}

function selectDemolishMode(){
  selectedBuilding = null;
  roadMode = false;
  blockMode = false;
  stairsMode = false;
  clearZonePlacementStart();
  demolishMode = !demolishMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
  if (demolishMode) updateDemolishBuildInfo();
  else updateBuildInfoPanel(null);
}

function updateDemolishBuildInfo(){
  if (!demolishMode) return;
  const rate = Math.round(DEMOLISH_REFUND_RATE * 100);
  const hint = t('demolish.hint', { rate });
  ['catalogBuildInfoText', 'buildInfoText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = hint;
  });
  ['catalogBuildInfoCost', 'buildInfoCost'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// Pastille "sélection actuelle" de la nouvelle interface (#selectedBuildPill).
// Inoffensif si absent (ancienne interface).
function updateSelectedBuildPill(){
  const pill = document.getElementById('selectedBuildPill');
  const nameEl = document.getElementById('selectedBuildName');
  if (!pill || !nameEl) return;
  if (selectedBuilding){
    nameEl.textContent = t(BUILDING_DEFS[selectedBuilding].name);
    pill.classList.add('show');
  } else if (roadMode){
    nameEl.textContent = t('action.road');
    pill.classList.add('show');
  } else if (stairsMode){
    nameEl.textContent = t('action.stairs');
    pill.classList.add('show');
  } else if (blockMode){
    nameEl.textContent = t('action.block');
    pill.classList.add('show');
  } else if (demolishMode){
    nameEl.textContent = t('action.demolish');
    pill.classList.add('show');
  } else {
    pill.classList.remove('show');
  }
}

// Annule le mode en cours (bâtiment/route/borne/démolir) et repasse en mode
// observation (clic sur une case = inspection, voir openTileObserver dans
// observer.js). Branché sur la pastille #selectedBuildPill (cliquable) et sur Échap.
function cancelSelection(){
  selectedBuilding = null;
  roadMode = false;
  blockMode = false;
  demolishMode = false;
  stairsMode = false;
  clearZonePlacementStart();
  refreshButtonStates();
  render();
  updateSelectedBuildPill();
  updateBuildInfoPanel(null);
}

/* ===================== MODE CLIC CARTE ===================== */
// observer : clic ouvre l'observateur · explore : clic centre la caméra sans panneau
const MAP_CLICK_MODE_KEY = 'orion_map_click_mode';
let mapClickMode = 'observer';

function loadMapClickMode(){
  try {
    const saved = localStorage.getItem(MAP_CLICK_MODE_KEY);
    if (saved === 'explore' || saved === 'observer') mapClickMode = saved;
  } catch { /* localStorage indisponible */ }
}

function saveMapClickMode(){
  try { localStorage.setItem(MAP_CLICK_MODE_KEY, mapClickMode); } catch { /* ignore */ }
}

function centerViewOnTile(col, row){
  if (typeof isThreeReady === 'function' && isThreeReady() && typeof centerThreeOnTile === 'function'){
    centerThreeOnTile(col, row);
  } else if (typeof tileCenter === 'function' && typeof centerCameraOn === 'function'){
    const c = tileCenter(col, row);
    centerCameraOn(c.x, c.y);
  }
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
}
window.centerViewOnTile = centerViewOnTile;

function updateMapModeBtn(){
  const btn = document.getElementById('mapModeBtn');
  if (!btn) return;
  const isObserver = mapClickMode === 'observer';
  btn.textContent = isObserver ? '👁️' : '🚶';
  btn.classList.toggle('active', !isObserver);
  btn.title = typeof t === 'function'
    ? (isObserver ? t('hud.mapModeObserver') : t('hud.mapModeExplore'))
    : '';
  btn.setAttribute('aria-pressed', isObserver ? 'false' : 'true');
}
window.updateMapModeBtn = updateMapModeBtn;

function setMapClickMode(mode){
  if (mode !== 'observer' && mode !== 'explore') return;
  mapClickMode = mode;
  saveMapClickMode();
  if (mode === 'explore' && typeof closePanels === 'function') closePanels();
  updateMapModeBtn();
  const info = document.getElementById('infoBar');
  if (info && typeof t === 'function'){
    info.textContent = mode === 'explore' ? t('info.exploreMode') : t('info.hover');
  }
}
window.setMapClickMode = setMapClickMode;

function toggleMapClickMode(){
  setMapClickMode(mapClickMode === 'observer' ? 'explore' : 'observer');
}
window.toggleMapClickMode = toggleMapClickMode;

function getMapClickMode(){
  return mapClickMode;
}
window.getMapClickMode = getMapClickMode;

loadMapClickMode();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancelSelection();
});

// Ajuste le taux d'imposition depuis la fiche "Gestion de la ville" de
// l'observateur (boutons +/- intégrés directement dans la ligne, voir observer.js).
function adjustTaxRate(deltaPercent){
  setTaxRate(taxRate + deltaPercent / 100);
  if (typeof openCityManagement === 'function') openCityManagement(); // réaffiche avec la nouvelle valeur
}

/* ===================== PALETTE DE BATIMENTS ===================== */
// Défensif : sur une interface qui n'a pas encore de #buildingButtons (migration UI
// en cours), on ne construit juste pas la palette -- pas de crash.
function buildPalette(){
  const container = document.getElementById('buildingButtons');
  if (!container) return;
  Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'buildBtn';
    btn.dataset.key = key;
    const reqLabel = t('terrainReq.' + def.validTerrain);
    const costLabel = def.isMonument ? '' : t('economy.cost', { n: def.cost });
    btn.innerHTML = `<span class="swatch" style="background:${def.color}"></span>
      <span>${def.icon} ${t(def.name)}<small>${reqLabel}${costLabel ? ' · ' + costLabel : ''}</small></span>`;
    btn.addEventListener('click', () => selectBuilding(key));
    container.appendChild(btn);
  });
}

function refreshButtonStates(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === selectedBuilding);
  });
  const demolishBtn = document.getElementById('demolishBtn');
  const roadBtn = document.getElementById('roadBtn');
  const blockBtn = document.getElementById('blockBtn');
  if (demolishBtn) demolishBtn.classList.toggle('active', demolishMode);
  if (roadBtn) roadBtn.classList.toggle('active', roadMode);
  if (blockBtn) blockBtn.classList.toggle('active', blockMode);
  const stairsBtn = document.getElementById('stairsBtn');
  if (stairsBtn) stairsBtn.classList.toggle('active', stairsMode);
}

// Grise les actions dont le coût dépasse le trésor (rafraîchi à chaque tick).
function refreshAffordability(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    const def = BUILDING_DEFS[btn.dataset.key];
    const unaffordable = def.isMonument ? false
      : (typeof canAffordBuilding === 'function' && def.costResources)
        ? !canAffordBuilding(btn.dataset.key)
        : !canAfford(def.cost);
    btn.classList.toggle('unaffordable', unaffordable);
  });
  document.querySelectorAll('#quickBuild .card[data-qb-kind]').forEach(btn => {
    const kind = btn.dataset.qbKind;
    let affordable = true;
    if (kind === 'road') affordable = canAfford(ROAD_COST);
    else if (kind === 'stairs') affordable = canAfford(typeof STAIR_COST === 'number' ? STAIR_COST : 8);
    else if (kind === 'building'){
      const def = BUILDING_DEFS[btn.dataset.qbKey];
      if (def){
        affordable = def.isMonument || ((typeof canAffordBuilding === 'function' && def.costResources)
          ? canAffordBuilding(btn.dataset.qbKey)
          : canAfford(def.cost));
      }
    }
    btn.classList.toggle('unaffordable', !affordable);
  });
  const roadBtn = document.getElementById('roadBtn');
  if (roadBtn) roadBtn.classList.toggle('unaffordable', !canAfford(ROAD_COST));
  const stairsBtn = document.getElementById('stairsBtn');
  if (stairsBtn) stairsBtn.classList.toggle('unaffordable', !canAfford(typeof STAIR_COST === 'number' ? STAIR_COST : 8));
}

/* ===================== CATALOGUE DE CONSTRUCTION (quickBuild) ===================== */
const QUICK_BUILD_SECTIONS = [
  { labelKey: 'catalog.housing', items: [{ kind: 'building', key: 'maison' }] },
  { labelKey: 'catalog.tools', items: [
    { kind: 'road' }, { kind: 'stairs' }, { kind: 'block' }, { kind: 'demolish' },
  ]},
  { labelKey: 'catalog.production', items: [
    { kind: 'building', key: 'farm' }, { kind: 'building', key: 'carrotFarm', shortKey: 'catalog.carrotShort' },
    { kind: 'building', key: 'huntingPavilion', shortKey: 'catalog.huntShort' },
    { kind: 'building', key: 'quarry' },
    { kind: 'building', key: 'oliveGrove' }, { kind: 'building', key: 'vineyard' },
    { kind: 'building', key: 'sheepFarm' }, { kind: 'building', key: 'fishery' },
    { kind: 'building', key: 'charcoalPit', shortKey: 'catalog.charcoalShort' },
    { kind: 'building', key: 'workshop' }, { kind: 'building', key: 'oilPress' },
    { kind: 'building', key: 'winery', shortKey: 'catalog.wineryShort' },
    { kind: 'building', key: 'weaver' }, { kind: 'building', key: 'foundry' },
  ]},
  { labelKey: 'catalog.storage', items: [
    { kind: 'building', key: 'granary' }, { kind: 'building', key: 'warehouse' },
    { kind: 'building', key: 'tradingPost' },
  ]},
  { labelKey: 'catalog.maritime', items: [
    { kind: 'building', key: 'harbor', shortKey: 'catalog.harborShort' },
    { kind: 'building', key: 'shipyard', shortKey: 'catalog.shipyardShort' },
  ]},
  { labelKey: 'catalog.culture', items: [
    { kind: 'building', key: 'agora' },
    { kind: 'building', key: 'theatre' },
    { kind: 'building', key: 'gymnasium' },
    { kind: 'building', key: 'stoa' },
    { kind: 'building', key: 'academy' },
  ]},
  { labelKey: 'catalog.services', items: [
    { kind: 'building', key: 'fountain' }, { kind: 'building', key: 'market' },
    { kind: 'building', key: 'temple' }, { kind: 'building', key: 'clinic', shortKey: 'catalog.clinicShort' },
    { kind: 'building', key: 'taxOffice', shortKey: 'catalog.taxShort' },
    { kind: 'building', key: 'watchtower', shortKey: 'catalog.towerShort' },
  ]},
  { labelKey: 'catalog.decor', items: [
    { kind: 'building', key: 'statue' }, { kind: 'building', key: 'garden' },
    { kind: 'building', key: 'colonnade' },
  ]},
  { labelKey: 'catalog.mythology', items: [
    { kind: 'building', key: 'grandTemple', shortKey: 'catalog.grandTempleShort' },
    { kind: 'building', key: 'heroTemple', shortKey: 'catalog.heroTempleShort' },
  ]},
  { labelKey: 'catalog.military', items: [
    { kind: 'building', key: 'barracks' },
    { kind: 'building', key: 'armory', shortKey: 'catalog.armoryShort' },
  ]},
];

function quickBuildCardHtml(item){
  if (item.kind === 'road'){
    return `<button class="card" data-qb-kind="road" onclick="callGameAction('selectRoadMode')">🛣️<span>${t('catalog.roadShort')}</span></button>`;
  }
  if (item.kind === 'stairs'){
    return `<button class="card" data-qb-kind="stairs" onclick="callGameAction('selectStairsMode')">🪜<span>${t('catalog.stairsShort')}</span></button>`;
  }
  if (item.kind === 'block'){
    return `<button class="card" data-qb-kind="block" onclick="callGameAction('selectBlockMode')">🚧<span>${t('catalog.block')}</span></button>`;
  }
  if (item.kind === 'demolish'){
    return `<button class="card" data-qb-kind="demolish" onclick="callGameAction('selectDemolishMode')">🔨<span>${t('catalog.demolishShort')}</span></button>`;
  }
  const def = BUILDING_DEFS[item.key];
  if (!def) return '';
  const label = item.shortKey ? t(item.shortKey) : t(def.name);
  return `<button class="card" data-qb-kind="building" data-qb-key="${item.key}" onclick="callGameAction('selectBuilding', '${item.key}')">${def.icon}<span>${label}</span></button>`;
}

function renderQuickBuildCatalog(){
  const container = document.getElementById('quickBuildSections');
  if (!container) return;
  const openIndices = [...container.querySelectorAll('.catalogCategory.open')]
    .map(el => Number(el.dataset.sectionIndex));
  container.innerHTML = QUICK_BUILD_SECTIONS.map((section, index) => {
    const cards = section.items.map(quickBuildCardHtml).join('');
    const openClass = openIndices.includes(index) ? ' open' : (index === 0 && openIndices.length === 0 ? ' open' : '');
    return `<section class="catalogCategory${openClass}" data-section-index="${index}">
      <button class="catalogHeader" onclick="toggleCatalog(this)">
        <span>${t(section.labelKey)}</span><b>${section.items.length}</b>
      </button>
      <div class="catalogBody">${cards}</div>
    </section>`;
  }).join('');
  const title = document.getElementById('catalogBuildInfoTitle');
  const text = document.getElementById('catalogBuildInfoText');
  if (title) title.textContent = t('build.selectTitle');
  if (text) text.textContent = t('build.selectHint');
}

/* ===================== INSPECTEUR ===================== */
// Arrondi d'affichage des cadences (1 décimale max).
function fmtRate(n){ return `${Math.round(n * 10) / 10}`; }
function resLabel(key){ return t('resource.' + key); }

// --- Maison : niveau, population, cachet, besoins du prochain niveau ---
function houseInspectorHtml(cell, col, row){
  const levelDef = HOUSE_LEVELS[cell.houseLevel];
  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];
  const needsHtml = nextDef
    ? nextDef.requires.map(need => {
        const ok = NEED_CHECKERS[need](col, row);
        return `<li class="${ok ? 'need-ok' : 'need-missing'}">${ok ? '✅' : '❌'} ${t('need.' + need)}</li>`;
      }).join('')
    : `<li>${t('need.maxLevel')}</li>`;
  return `
    <p><strong>${t(levelDef.nameKey)}</strong> — ${t('inspector.level')} ${cell.houseLevel}</p>
    <p>👥 ${t('inspector.population')} : ${cell.population}</p>
    <p>🎨 ${t('inspector.beauty')} : ${Math.round(cell.beauty || 0)} / ${BEAUTY_THRESHOLD}</p>
    <p class="${isHouseServedBy('fire', col, row) ? 'need-ok' : 'need-missing'}">
      ${isHouseServedBy('fire', col, row) ? '✅' : '❌'} ${t('inspector.fireRisk')}</p>
    <p class="${isHouseServedBy('health', col, row) ? 'need-ok' : 'need-missing'}">
      ${isHouseServedBy('health', col, row) ? '✅' : '❌'} ${t('inspector.diseaseRisk')}</p>
    ${emigrationChance() > 0 ? `<p class="need-missing">⚠️ ${t('migration.emigrationRisk')} : ${Math.round(emigrationChance() * 100)}%/tick</p>` : ''}
    <p class="needsTitle">${t('inspector.nextNeeds')}</p>
    <ul class="needsList">${needsHtml}</ul>`;
}

// --- Bâtiment : production / transformation / stockage / service / déco ---
function buildingInspectorHtml(type, col, row){
  const def = BUILDING_DEFS[type];
  let html = `<p><strong>${def.icon} ${t(def.name)}</strong></p>`;
  html += `<p>🧱 ${t('inspector.terrain')} : ${t('terrainName.' + def.validTerrain)}</p>`;

  let eco = `💰 ${t('inspector.cost')} : ${def.cost} dr.`;
  if (def.upkeep) eco += ` · ${t('inspector.upkeep')} : ${def.upkeep}${t('inspector.perTick')}`;
  html += `<p>${eco}</p>`;

  if (def.workers){
    html += `<p>👷 ${t('inspector.workers')} : ${def.workers} · ${t('inspector.laborRate')} : ${Math.round(employment.ratio * 100)}%</p>`;
  }

  // production simple (matière première depuis le terrain)
  if (def.produces && !def.consumes){
    if (def.isSeasonalCrop){
      const labels = (typeof getSeasonalHarvestMonthLabels === 'function')
        ? getSeasonalHarvestMonthLabels(def.produces)
        : [];
      const cfg = (typeof getSeasonalCropConfig === 'function') ? getSeasonalCropConfig(def.produces) : null;
      const factor = productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
      const yieldEst = cfg ? Math.round(cfg.yieldBase * factor) : 0;
      const harvestList = labels.length ? labels.join(', ') : '—';
      const state = (typeof getCalendarState === 'function') ? getCalendarState() : null;
      const inHarvest = state && typeof isSeasonalHarvestMonth === 'function'
        && isSeasonalHarvestMonth(def.produces, state.monthIndex);
      html += `<p>🌾 ${t('inspector.seasonalCrop')} : ${resLabel(def.produces)}</p>`;
      html += `<p>📅 ${t('inspector.harvestMonths')} : ${harvestList}</p>`;
      html += `<p>📦 ${t('inspector.harvestYield')} : ~${yieldEst} ${resLabel(def.produces)} / ${t('inspector.harvestPerBuilding')}</p>`;
      html += `<p class="${inHarvest ? 'need-ok' : ''}">${inHarvest ? '✅ ' + t('inspector.harvestNow') : '⏳ ' + t('inspector.harvestWait')}</p>`;
      if (employment.ratio < 1) html += `<p class="need-missing">⚠️ ${t('inspector.laborShortage')}</p>`;
    } else {
      const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
      html += `<p>📦 ${t('inspector.produces')} : ${resLabel(def.produces)} — ${fmtRate(eff)}${t('inspector.perTick')} (${t('inspector.baseRate')} ${def.rate})</p>`;
      if (employment.ratio < 1) html += `<p class="need-missing">⚠️ ${t('inspector.laborShortage')}</p>`;
    }
  }

  // transformation (consomme une matière -> produit un bien)
  if (def.consumes){
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    const inputs = Object.entries(def.consumes).map(([r, amt]) => `${amt} ${resLabel(r)}`).join(' + ');
    html += `<p>🔄 ${t('inspector.transforms')} : ${inputs} → ${fmtRate(eff)} ${resLabel(def.produces)}${t('inspector.perTick')}</p>`;
    for (const [inRes, amt] of Object.entries(def.consumes)){
      const ok = (resources[inRes] || 0) >= amt;
      html += `<p class="${ok ? 'need-ok' : 'need-missing'}">${ok ? '✅' : '❌'} ${resLabel(inRes)} : ${Math.floor(resources[inRes] || 0)}</p>`;
    }
    if (employment.ratio < 1) html += `<p class="need-missing">⚠️ ${t('inspector.laborShortage')}</p>`;
  }

  // stockage (augmente les plafonds de la ville)
  if (def.storageBonus){
    const parts = Object.entries(def.storageBonus).map(([r, n]) => `${resLabel(r)} +${n}`).join(', ');
    html += `<p>🏬 ${t('inspector.storage')} : ${parts}</p>`;
  }

  // service à walker (couverture des maisons)
  if (def.isService){
    const walker = walkers.find(w => w.col === col && w.row === row);
    const passStats = walker && typeof getWalkerPassStats === 'function' ? getWalkerPassStats(walker) : null;
    const served = passStats ? passStats.served : (walker ? walker.servedHouses.length : 0);
    const eligible = passStats ? passStats.eligible : def.capacity;
    const connected = !!walker && walker.path.length > 1;
    html += `<p>🚶 ${t('inspector.service')} : ${t('service.' + def.serviceType)}</p>`;
    html += `<p>📡 ${t('inspector.range')} : ${def.range} · ${t('inspector.capacity')} : ${def.capacity}</p>`;
    html += `<p class="${served > 0 ? 'need-ok' : ''}">🏠 ${t('inspector.served')} : ${served}/${eligible}${passStats ? ' ' + t('inspector.servedToday') : ''}</p>`;
    if (passStats && typeof WALKER_PASS_DELIVERY !== 'undefined' && WALKER_PASS_DELIVERY){
      html += `<p>🧺 ${t('inspector.walkerInventory')} : ${passStats.inventory}/${passStats.carry}</p>`;
      html += `<p class="icon-legend">💡 ${t('iconStatus.legend')}</p>`;
    }
    html += `<p class="${connected ? 'need-ok' : 'need-missing'}">${connected ? '✅ ' + t('inspector.connected') : '❌ ' + t('inspector.notConnected')}</p>`;
    if (def.serviceType === 'market'){
      const goods = MARKET_GOODS.map(g => `${resLabel(g.resource)} (${Math.floor(resources[g.resource])})`).join(', ');
      html += `<p>🛒 ${t('inspector.distributes')} : ${goods}</p>`;
    }
    if (def.serviceType === 'tax'){
      const estimate = served * taxCollectionRate(); // approximation : population moyenne ignorée ici
      html += `<p>💰 ${t('government.collection')} (${t('government.thisOffice')}) ≈ ${estimate.toFixed(1)} dr.${t('inspector.perTick')}</p>`;
    }
    if (def.serviceType === 'culture'){
      const venues = typeof countCultureVenues === 'function' ? countCultureVenues() : 0;
      const linked = typeof isCultureVenueLinked === 'function'
        && isCultureVenueLinked(col, row, def.range);
      html += `<p class="${linked ? 'need-ok' : 'need-missing'}">${linked ? '✅' : '❌'} ${t('inspector.cultureVenuesLinked')}</p>`;
      html += `<p>🎭 ${t('inspector.cultureVenues')} : ${venues}</p>`;
    }
  }

  if (def.isVenue){
    html += `<p>🎭 ${t('inspector.venue')} : ${t('venue.kind.' + def.venueKind)}</p>`;
    if (def.beauty) html += `<p>🎨 ${t('inspector.charm')} : ${def.beauty} · ${t('inspector.range')} : ${def.range}</p>`;
    const onRoad = typeof hasRoadOnOrAdjacent === 'function' && hasRoadOnOrAdjacent(col, row);
    const cultureLinked = typeof isVenueCultureNetworkLinked === 'function'
      && isVenueCultureNetworkLinked(col, row);
    html += `<p class="${onRoad ? 'need-ok' : 'need-missing'}">${onRoad ? '✅' : '❌'} ${t('inspector.venueRoadAccess')}</p>`;
    html += `<p class="${cultureLinked ? 'need-ok' : 'need-missing'}">${cultureLinked ? '✅' : '❌'} ${t('inspector.venueCultureLinked')}</p>`;
  }

  // décoration (diffuse du cachet)
  if (def.isDecoration){
    html += `<p>🎨 ${t('inspector.decoration')} — ${t('inspector.charm')} : ${def.beauty} · ${t('inspector.range')} : ${def.range}</p>`;
  }

  // comptoir de commerce (routes commerciales par cité, voir trade.js / world.js)
  if (def.isTradePost){
    let exp = 0, imp = 0;
    (worldCities || []).forEach(c => {
      const r = (typeof tradeRoutes !== 'undefined' && tradeRoutes[c.id]) ? tradeRoutes[c.id] : null;
      if (!r) return;
      exp += Object.values(r.export || {}).filter(Boolean).length;
      imp += Object.values(r.import || {}).filter(Boolean).length;
    });
    html += `<p>🚢 ${t('trade.exportSection')} : ${exp} ${t('world.routes')}</p>`;
    html += `<p>📦 ${t('inspector.exportRate')} : ${EXPORT_QTY_PER_POST}${t('inspector.perMonth')}</p>`;
    html += `<p>🛬 ${t('trade.importSection')} : ${imp} ${t('world.routes')}</p>`;
  }

  return html;
}

// --- Case sans bâtiment : route ou terrain libre ---
function tileInspectorHtml(cell){
  const title = cell.roadStairs ? `🪜 ${t('inspector.tileTitleStairs')}`
    : (cell.hasRoad ? `🛣️ ${t('inspector.tileTitleRoad')}` : t('inspector.tileTitleEmpty'));
  let html = `<p><strong>${title}</strong></p>`;
  html += `<p>🧱 ${t('inspector.terrain')} : ${t('terrainName.' + cell.terrain)}</p>`;
  if (cell.beauty) html += `<p>🎨 ${t('inspector.beauty')} : ${Math.round(cell.beauty)} / ${BEAUTY_THRESHOLD}</p>`;
  return html;
}

// Défensif : sur une interface sans #inspector (migration UI en cours), on calcule
// quand même inspectedTile (d'autres systèmes en dépendent) mais on n'écrit rien au DOM.
function renderInspector(col, row){
  inspectedTile = inBounds(col, row) ? { col, row } : null;

  const panel = document.getElementById('inspector');
  if (!panel) return;

  const placeholder = panel.querySelector('.placeholder');
  let info = panel.querySelector('.houseInfo');

  if (!inspectedTile){
    if (placeholder) placeholder.style.display = '';
    if (info) info.style.display = 'none';
    return;
  }

  if (placeholder) placeholder.style.display = 'none';
  if (!info){
    info = document.createElement('div');
    info.className = 'houseInfo';
    panel.appendChild(info);
  }
  info.style.display = '';

  const cell = grid[row][col];
  if (cell.building === 'maison'){
    info.innerHTML = houseInspectorHtml(cell, col, row);
  } else if (cell.building){
    info.innerHTML = buildingInspectorHtml(cell.building, col, row);
  } else {
    info.innerHTML = tileInspectorHtml(cell);
  }
}

/* ===================== EVENEMENTS ===================== */
// Petit utilitaire : attache un listener seulement si l'élément existe dans
// l'interface actuelle -- aucune de ces lignes ne doit jamais faire planter le
// reste du fichier, qui que ce soit la page HTML chargée autour (voir le brief
// de migration UI : plusieurs interfaces peuvent coexister pendant la transition).
function on(id, event, handler){
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

on('demolishBtn', 'click', () => selectDemolishMode());
on('roadBtn', 'click', () => selectRoadMode());
on('blockBtn', 'click', () => selectBlockMode());

on('resetBtn', 'click', () => {
  if (typeof showConfirm === 'function'){
    showConfirm(t('action.reset'), t('action.confirmReset'), () => resetGame());
  } else if (confirm(t('action.confirmReset'))){
    resetGame();
  }
});

on('saveBtn', 'click', () => saveGame());
on('offeringBtn', 'click', () => makeOffering());
on('festivalBtn', 'click', () => holdFestival());

on('taxRateSlider', 'input', (e) => {
  setTaxRate(e.target.value / 100);
});

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (e.key === 'q' || e.key === 'Q') rotateMapLeft();
  if (e.key === 'e' || e.key === 'E') rotateMapRight();
});

// canvas existe toujours (render.js le crée avant ui.js dans l'ordre de chargement),
// donc pas besoin de garde ici -- mais infoBar (à l'intérieur du handler) si.
function initCanvasListeners(){
const _c = (typeof isThreeReady === 'function' && isThreeReady() && window._threeRenderer)
  ? window._threeRenderer.domElement
  : (document.getElementById('gameCanvas') || canvas);
let _hoverPickAt = 0;
let _hoverLastCol = null;
let _hoverLastRow = null;

_c.addEventListener('mousemove', (e) => {
  const now = performance.now();
  if (now - _hoverPickAt < 32) return;
  _hoverPickAt = now;

  const pick = typeof pickTileAtScreen === 'function'
    ? pickTileAtScreen(e.clientX, e.clientY)
    : null;
  if (!pick || !pick.hit){
    if (_hoverLastCol != null){
      hoverTile = null;
      _hoverLastCol = _hoverLastRow = null;
      if (typeof markRenderDirty === 'function') markRenderDirty();
    }
    const infoMiss = document.getElementById('infoBar');
    if (infoMiss) infoMiss.textContent = t('info.hover');
    return;
  }
  const { col, row } = pick;
  const tileChanged = col !== _hoverLastCol || row !== _hoverLastRow;
  hoverTile = { col, row };
  _hoverLastCol = col;
  _hoverLastRow = row;

  const info = document.getElementById('infoBar');
  if (info){
    if (inBounds(col, row)){
      const cell = grid[row][col];
      const buildingLabel = cell.building ? t(BUILDING_DEFS[cell.building].name) : t('info.empty');
      let text = t('info.tile', { col, row, terrain: t('terrainName.' + cell.terrain), building: buildingLabel });
      if (cell.roadStairs) text += ` — ${t('info.hasStairs')}`;
      else if (cell.hasRoad) text += ` — ${t('info.hasRoad')}`;
      if (cell.beauty) text += ` — ${t('info.beauty', { n: Math.round(cell.beauty) })}`;
      info.textContent = text;
    } else {
      info.textContent = t('info.hover');
    }
  }
  if (supportsZonePlacement()) updateZonePlacementUI();
  if (tileChanged && typeof markRenderDirty === 'function') markRenderDirty();
  // Le rendu est géré par requestAnimationFrame (loop.js) — pas de render() ici.
});

_c.addEventListener('contextmenu', (e) => {
  if (!zonePlacementStart) return;
  e.preventDefault();
  clearZonePlacementStart();
  render();
});

/** Démolition d'une case (bâtiment, route, monument) — utilisé par le mode démolition et l'observateur. */
function demolishAtTile(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(col, row) : null;

  if (anchor && grid[anchor.row][anchor.col].building){
    const ac = grid[anchor.row][anchor.col];
    debugInfo('Démolition : temple monumental', anchor);
    notifyDemolishRefund(ac.building, ac.godPatron);
    demolishMonument(anchor.col, anchor.row);
  } else if (cell.building){
    if (cell.building === 'maison'){
      // Bug 2 : la maison est retirée IMMÉDIATEMENT ; un colon part ensuite (cosmétique,
      // sans détruire quoi que ce soit à l'arrivée au bord de carte).
      debugInfo(`Démolition : ${t(BUILDING_DEFS.maison.name)}`, { col, row });
      notifyDemolishRefund('maison');
      if (typeof queueMigrantOut === 'function'){
        queueMigrantOut(col, row, { destroyOnComplete: false, notify: false, reason: 'destroy' });
      }
      if (typeof destroyHouseAt === 'function'){
        destroyHouseAt(col, row);
      } else {
        cell.building = null;
        cell.houseLevel = 0;
        cell.population = 0;
        if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
        if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
        if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
      }
    } else {
      debugInfo(`Démolition : ${t(BUILDING_DEFS[cell.building].name)}`, { col, row });
      notifyDemolishRefund(cell.building);
      cell.building = null;
      cell.houseLevel = 0;
      cell.population = 0;
      if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
      if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
      if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
    }
  } else if (cell.hasRoad){
    debugInfo(cell.roadStairs ? 'Escalier supprimé' : 'Route supprimée', { col, row });
    notifyDemolishRefund(cell.roadStairs ? 'stairs' : 'road');
    cell.hasRoad = false;
    cell.roadStairs = false;
    cell.patrolBlock = false;
    if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
    if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
  } else {
    return false;
  }
  recomputeAllWalkers();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  return true;
}
window.demolishAtTile = demolishAtTile;

_c.addEventListener('click', (e) => {
  const pick = typeof pickTileAtScreen === 'function'
    ? pickTileAtScreen(e.clientX, e.clientY)
    : null;
  if (!pick || !pick.hit) return;
  const { col, row } = pick;
  if (!inBounds(col, row)) return;

  if (typeof handleBuildingSpriteDebugClick === 'function' && handleBuildingSpriteDebugClick(col, row)){
    render();
    return;
  }

  const cell = grid[row][col];

  if (demolishMode){
    demolishAtTile(col, row);
  } else if (blockMode){
    if (canToggleBlock(col, row)){
      cell.patrolBlock = !cell.patrolBlock;
      debugInfo(cell.patrolBlock ? 'Borne de blocage posée' : 'Borne de blocage retirée', { col, row });
      recomputeAllWalkers();
    }
  } else if (stairsMode){
    if (typeof canPlaceStairs === 'function' && canPlaceStairs(col, row)){
      const cost = typeof STAIR_COST === 'number' ? STAIR_COST : 8;
      if (!spend(cost)){
        showNotification(t('economy.cantAfford'), 'bad');
      } else {
        if (typeof placeStairs === 'function') placeStairs(col, row);
        debugInfo('Escalier posé', { col, row });
        showNotification(t('stairs.placed', { cost }), 'good');
        recomputeAllWalkers();
      }
    }
  } else if (supportsZonePlacement()){
    handleZonePlacementClick(col, row);
    return;
  } else if (selectedBuilding && canPlaceTerrain(col, row)){
    const def = BUILDING_DEFS[selectedBuilding];
    if (def.isMonument){
      openMonumentGodDialog(col, row, selectedBuilding);
    } else if (!spend(def.cost)){
      showNotification(t('economy.cantAfford'), 'bad');
    } else {
      debugInfo(`Construction : ${t(def.name)}`, { col, row });
      placeCellBuilding(col, row, selectedBuilding);
      recomputeAllWalkers();
    }
  } else if (!demolishMode && !roadMode && !blockMode && !stairsMode && !selectedBuilding){
    if (mapClickMode === 'explore'){
      centerViewOnTile(col, row);
    } else {
      // Mode observateur : marcheur sous le doigt, sinon la case.
      const now = performance.now();
      const hitWalker = (typeof findWalkerNear === 'function')
        ? findWalkerNear(
            (typeof isThreeReady === 'function' && isThreeReady()) ? e.clientX : pick.mx,
            (typeof isThreeReady === 'function' && isThreeReady()) ? e.clientY : pick.my,
            now,
          )
        : null;
      if (hitWalker && typeof openWalkerObserver === 'function'){
        openWalkerObserver(hitWalker);
      } else if (typeof openTileObserver === 'function'){
        openTileObserver(col, row);
      }
    }
  }
  recomputeBeauty(); // retour visuel immédiat du cachet (le tick le recalcule aussi)
  renderInspector(col, row);
  renderTradePanel(); // le nombre de comptoirs (donc la capacité d'export) a pu changer
  render();
  updateResourceBar();
  if (typeof renderHud === 'function') renderHud();
});
} // fin initCanvasListeners

// Appel immédiat pour le mode Canvas2D normal (sans Pixi)
// En mode Pixi, initCanvasListeners() sera rappelé après remplacement du canvas
initCanvasListeners();
updateMapModeBtn();
