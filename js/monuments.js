/* ===================== TEMPLES MONUMENTAUX (2×2) ===================== */
// Bâtiment grandTemple : occupe 4 cases, sprite plus grand, coût élevé (or + ressources).
// À la construction, le joueur choisit un dieu patron (showChoice) ; chaque dieu accorde
// un avantage passif tant que le temple existe. Un seul temple par dieu dans la cité.

function monumentSize(type){
  const def = BUILDING_DEFS[type];
  return (def && def.footprint) || 1;
}

function isMonumentAnchor(col, row){
  const cell = grid[row][col];
  return !!(cell.building && BUILDING_DEFS[cell.building] && BUILDING_DEFS[cell.building].isMonument);
}

function monumentAnchorAt(col, row){
  const cell = grid[row][col];
  if (isMonumentAnchor(col, row)) return { col, row };
  if (cell.monumentPart) return cell.monumentPart;
  return null;
}

function forEachMonument(callback){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      if (!isMonumentAnchor(col, row)) continue;
      const cell = grid[row][col];
      callback(cell.building, col, row, cell);
    }
  }
}

function hasGodTemple(godKey){
  let found = false;
  forEachMonument((_type, _col, _row, cell) => {
    if (cell.godPatron === godKey) found = true;
  });
  return found;
}

function activeGodPatrons(){
  const gods = new Set();
  forEachMonument((_type, _col, _row, cell) => {
    if (cell.godPatron) gods.add(cell.godPatron);
  });
  return gods;
}

function hasGodBenefit(benefit){
  for (const g of GODS){
    if (g.benefit !== benefit) continue;
    if (activeGodPatrons().has(g.key)) return true;
  }
  return false;
}

function godByKey(godKey){
  return GODS.find(g => g.key === godKey);
}

function godTempleCostLabel(godKey){
  const god = godByKey(godKey);
  if (!god) return '';
  const parts = [];
  if (god.cost) parts.push(`🪙 ${god.cost} dr.`);
  if (god.costResources){
    for (const [res, amt] of Object.entries(god.costResources)){
      parts.push(`${amt} ${t('resource.' + res)}`);
    }
  }
  return parts.join(' · ');
}

function canAffordGodTemple(godKey){
  const god = godByKey(godKey);
  if (!god) return false;
  if (god.cost && !canAfford(god.cost)) return false;
  if (god.costResources){
    for (const [res, amt] of Object.entries(god.costResources)){
      if ((resources[res] || 0) < amt) return false;
    }
  }
  return true;
}

function spendGodTemple(godKey){
  const god = godByKey(godKey);
  if (!canAffordGodTemple(godKey)) return false;
  if (god.cost) treasury -= god.cost;
  if (god.costResources){
    for (const [res, amt] of Object.entries(god.costResources)) resources[res] -= amt;
  }
  return true;
}

/* ===================== PLACEMENT & COUT ===================== */
function canAffordBuilding(type){
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  if (def.cost && !canAfford(def.cost)) return false;
  if (def.costResources){
    for (const [res, amt] of Object.entries(def.costResources)){
      if ((resources[res] || 0) < amt) return false;
    }
  }
  return true;
}

function spendBuilding(type){
  const def = BUILDING_DEFS[type];
  if (!canAffordBuilding(type)) return false;
  if (def.cost) treasury -= def.cost;
  if (def.costResources){
    for (const [res, amt] of Object.entries(def.costResources)) resources[res] -= amt;
  }
  return true;
}

function canPlaceMonumentTerrain(anchorCol, anchorRow, type){
  const def = BUILDING_DEFS[type];
  const size = monumentSize(type);
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      if (!inBounds(c, r)) return false;
      const cell = grid[r][c];
      if (cell.building || cell.monumentPart || cell.hasRoad) return false;
      if (cell.terrain !== def.validTerrain && !terrainMatchesBuilding(cell.terrain, def.validTerrain)) return false;
    }
  }
  return true;
}

function monumentFootprintTiles(anchorCol, anchorRow, size){
  const tiles = [];
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++) tiles.push({ col: c, row: r });
  }
  return tiles;
}

function placeMonument(anchorCol, anchorRow, type, godKey){
  const size = monumentSize(type);
  if (!canPlaceMonumentTerrain(anchorCol, anchorRow, type)) return false;
  if (!spendGodTemple(godKey)) return false;
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      const cell = grid[r][c];
      if (c === anchorCol && r === anchorRow){
        cell.building = type;
        cell.godPatron = godKey;
        cell.monumentPart = null;
      } else {
        cell.building = null;
        cell.godPatron = null;
        cell.monumentPart = { col: anchorCol, row: anchorRow };
      }
    }
  }
  const god = GODS.find(g => g.key === godKey);
  showNotification(t('monument.godArrived', { god: t('god.' + godKey), icon: god ? god.icon : '🏛️' }), 'good');
  if (typeof onGodMonumentBuilt === 'function') onGodMonumentBuilt(godKey);
  spawnGodAgent(godKey, anchorCol, anchorRow, false);
  debugInfo('Temple monumental construit', { col: anchorCol, row: anchorRow, god: godKey });
  recomputeAllWalkers();
  recomputeBeauty();
  return true;
}

function demolishMonument(anchorCol, anchorRow){
  const patron = grid[anchorRow][anchorCol]?.godPatron || null;
  removeGodAgentsAt(anchorCol, anchorRow);
  const size = MONUMENT_FOOTPRINT;
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      if (!inBounds(c, r)) continue;
      const cell = grid[r][c];
      cell.building = null;
      cell.monumentPart = null;
      cell.godPatron = null;
    }
  }
  if (typeof onGodMonumentDemolished === 'function') onGodMonumentDemolished(patron);
  recomputeAllWalkers();
}

function openMonumentGodDialog(anchorCol, anchorRow, type){
  if (!canPlaceMonumentTerrain(anchorCol, anchorRow, type)){
    showNotification(t('monument.invalidSite'), 'bad');
    return;
  }
  const choices = GODS.map(g => {
    const taken = hasGodTemple(g.key);
    return {
      label: `${g.icon} ${t('god.' + g.key)}`,
      type: 'primary',
      disabled: taken || !canAffordGodTemple(g.key),
      hint: taken ? t('monument.godTaken') : godTempleCostLabel(g.key),
      onPick: () => {
        if (placeMonument(anchorCol, anchorRow, type, g.key)){
          render();
          updateResourceBar();
          saveGame({ silent: true });
        }
      },
    };
  });
  choices.push({ label: t('dialog.no'), type: 'neutral' });
  showChoice({
    title: t('monument.chooseGod'),
    body: t('monument.chooseGodBody'),
    choices,
  });
}

/* ===================== CENTRE ECRAN DU FOOTPRINT 2×2 ===================== */
function monumentScreenCenter(anchorCol, anchorRow, size){
  let sx = 0, sy = 0, n = 0;
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      const p = tileCenter(c, r);
      sx += p.x;
      sy += p.y;
      n++;
    }
  }
  return { x: sx / n, y: sy / n };
}

/* ===================== AVANTAGES DIVINS ===================== */
function tickMonumentBenefits(){
  // Zeus : plancher géré dans tickGodSatisfaction()
}

function processMonumentMonthly(){
  const caps = computeCaps();
  const patrons = activeGodPatrons();

  if (patrons.has('demeter')){
    resources.wheat = caps.wheat || resources.wheat;
    showNotification(t('monument.demeterBlessing'), 'good');
  }
  if (patrons.has('apollo')){
    if (typeof adjustGodSatisfaction === 'function'){
      adjustGodSatisfaction('apollo', GOD_APOLLO_FAVOR_MONTHLY);
      if (typeof syncGlobalFavor === 'function') syncGlobalFavor();
    } else {
      favor = Math.min(FAVOR_MAX, favor + GOD_APOLLO_FAVOR_MONTHLY);
    }
    showNotification(t('monument.apolloBlessing'), 'good');
  }
  updateResourceBar();
}

function godWineMultiplier(){ return hasGodBenefit('wineBoost') ? GOD_WINE_MULTIPLIER : 1; }
function godTradeMultiplier(){ return hasGodBenefit('tradeBoost') ? (1 + GOD_TRADE_BONUS) : 1; }
function godMilitaryBonus(){ return hasGodBenefit('military') ? GOD_MILITARY_BONUS : 0; }
function godDiseaseMultiplier(){ return hasGodBenefit('healthBlessing') ? GOD_APOLLO_DISEASE_MULT : 1; }
function prodGodMultiplier(resource){
  if (resource === 'grapes' || resource === 'wine') return godWineMultiplier();
  return 1;
}

function godLabel(key){
  const g = GODS.find(x => x.key === key);
  return g ? `${g.icon} ${t('god.' + key)}` : key;
}

function monumentCostLabel(type, godKey){
  if (godKey && typeof godTempleCostLabel === 'function') return godTempleCostLabel(godKey);
  const def = BUILDING_DEFS[type];
  if (!def) return '';
  const parts = [];
  if (def.cost) parts.push(`${def.cost} dr.`);
  if (def.costResources){
    for (const [res, amt] of Object.entries(def.costResources)) parts.push(`${amt} ${t('resource.' + res)}`);
  }
  return parts.join(' · ');
}

/* ===================== DIEUX ERRANTS (promenade cosmétique) ===================== */
// Quand un temple monumental est consacré, le dieu patron apparaît et se promène
// librement dans la cité (même déplacement que les monstres, sans attaquer).
let godAgents = [];

function resetGodAgents(){ godAgents = []; }

function initGodAgentsFromMonuments(){
  godAgents = [];
  if (typeof forEachMonument !== 'function') return;
  forEachMonument((_type, col, row, cell) => {
    if (cell.godPatron) spawnGodAgent(cell.godPatron, col, row, false);
  });
}

function spawnGodAgent(godKey, templeCol, templeRow, notify){
  const g = GODS.find(x => x.key === godKey);
  if (!g) return;
  godAgents = godAgents.filter(a => a.templeCol !== templeCol || a.templeRow !== templeRow);
  godAgents.push({
    godKey, icon: g.icon,
    col: templeCol, row: templeRow,
    prevCol: templeCol, prevRow: templeRow,
    moveCooldown: GOD_MOVE_EVERY_TICKS,
    templeCol, templeRow,
    facing: 'down', mirrorX: false,
  });
  if (notify !== false) showNotification(t('monument.godArrived', { god: t('god.' + godKey), icon: g.icon }), 'good');
}

function removeGodAgentsAt(templeCol, templeRow){
  godAgents = godAgents.filter(a => a.templeCol !== templeCol || a.templeRow !== templeRow);
}

function tickGodAgents(){
  if (!godAgents.length || typeof walkableNeighbors !== 'function') return;
  godAgents.forEach(agent => {
    agent.prevCol = agent.col;
    agent.prevRow = agent.row;
    agent.moveCooldown--;
    if (agent.moveCooldown > 0) return;
    agent.moveCooldown = GOD_MOVE_EVERY_TICKS;
    const neighbors = walkableNeighbors(agent.col, agent.row);
    if (neighbors.length){
      const n = neighbors[Math.floor(Math.random() * neighbors.length)];
      agent.col = n.col;
      agent.row = n.row;
    }
    if (typeof updateAgentFacing === 'function') updateAgentFacing(agent);
  });
}
