/* ===================== ETAT DES WALKERS ===================== */
// Un walker = un bâtiment de service + son trajet de patrouille figé + maisons éligibles.
// Mode WALKER_PASS_DELIVERY (Zeus-like) : la maison n'est servie que lorsque le walker
// passe sur une case route adjacente, avec un inventaire limité rechargé au bâtiment.
let walkers = []; // { col, row, type, path, pathIndex, direction, servedHouses, inventory, servedToday }
let lastWalkerServiceDay = -1;
/** Besoins servis aujourd'hui — persiste entre recalculs de patrouille (pose route/bâtiment). */
let passServiceToday = new Map(); // clé `${serviceType}:${col},${row}` → jour de service

function passServiceKey(serviceType, col, row){
  return `${serviceType}:${col},${row}`;
}

function markPassService(serviceType, col, row){
  passServiceToday.set(passServiceKey(serviceType, col, row), getWalkerServiceDay());
}

function isPassServedToday(serviceType, col, row){
  return passServiceToday.get(passServiceKey(serviceType, col, row)) === getWalkerServiceDay();
}

function syncWalkerServedToday(w){
  w.servedToday = new Set();
  for (const house of w.servedHouses){
    if (isPassServedToday(w.serviceType, house.col, house.row)){
      w.servedToday.add(tileKey(house.col, house.row));
    }
  }
  if (w.serviceType === 'fire'){
    forEachBuilding((type, col, row) => {
      if (type === 'maison') return;
      const bdef = BUILDING_DEFS[type];
      if (bdef && bdef.isDecoration) return;
      if (isWalkerEligibleFireBuilding(w, col, row) && isPassServedToday('fire', col, row)){
        w.servedToday.add(tileKey(col, row));
      }
    });
  }
}
/* ===================== GENERATION DU TRAJET ===================== */
function tileKey(col, row){ return `${col},${row}`; }
function roadNeighbors(col, row){
  const here = inBounds(col, row) ? grid[row][col] : null;
  if (!here) return [];
  const onRoad = !!here.hasRoad;
  const candidates = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  return candidates
    .filter(([c, r]) => {
      if (!inBounds(c, r)) return false;
      const cell = grid[r][c];
      if (cell.patrolBlock || here.patrolBlock) return false;
      if (typeof roadTileConnects === 'function'){
        if (!roadTileConnects(col, row, c, r)) return false;
      } else if (!cell.hasRoad){
        return false;
      }
      if (onRoad) return !!cell.hasRoad;
      return !!cell.hasRoad;
    })
    .map(([c, r]) => ({ col: c, row: r }));
}
function pickDeterministic(rng, arr){
  return arr[Math.floor(rng() * arr.length)];
}
function walkRoadArm(firstCol, firstRow, fromCol, fromRow, maxLen){
  const arm = [{ col: firstCol, row: firstRow }];
  let col = firstCol;
  let row = firstRow;
  let prevCol = fromCol;
  let prevRow = fromRow;
  while (arm.length < maxLen){
    const nexts = roadNeighbors(col, row).filter(n => !(n.col === prevCol && n.row === prevRow));
    if (nexts.length !== 1) break;
    arm.push(nexts[0]);
    prevCol = col;
    prevRow = row;
    col = nexts[0].col;
    row = nexts[0].row;
  }
  return arm;
}
function sortRoadExits(hubCol, hubRow, exits){
  return exits.slice().sort((a, b) => {
    const ac = a.col - hubCol;
    const ar = a.row - hubRow;
    const bc = b.col - hubCol;
    const br = b.row - hubRow;
    const angA = Math.atan2(ar, ac);
    const angB = Math.atan2(br, bc);
    return angA - angB || ac - bc || ar - br;
  });
}
function appendArmReturn(path, arm, hub){
  if (!arm.length) return;
  for (let i = arm.length - 2; i >= 0; i--) path.push({ col: arm[i].col, row: arm[i].row });
  const last = path[path.length - 1];
  if (!last || last.col !== hub.col || last.row !== hub.row){
    path.push({ col: hub.col, row: hub.row });
  }
}
function shortestPathInReach(fromCol, fromRow, toCol, toRow, reachKeys){
  const goalKey = tileKey(toCol, toRow);
  if (!reachKeys.has(goalKey)) return null;
  const startKey = tileKey(fromCol, fromRow);
  if (startKey === goalKey) return [];
  const queue = [{ col: fromCol, row: fromRow, path: [] }];
  const visited = new Set([startKey]);
  while (queue.length){
    const cur = queue.shift();
    for (const n of roadNeighbors(cur.col, cur.row)){
      const nk = tileKey(n.col, n.row);
      if (!reachKeys.has(nk) || visited.has(nk)) continue;
      const nextPath = cur.path.concat([{ col: n.col, row: n.row }]);
      if (nk === goalKey) return nextPath;
      visited.add(nk);
      queue.push({ col: n.col, row: n.row, path: nextPath });
    }
  }
  return null;
}
function appendPatrolSteps(path, steps){
  if (!steps || !steps.length) return;
  const last = path[path.length - 1];
  for (let i = 0; i < steps.length; i++){
    const step = steps[i];
    if (i === 0 && last && last.col === step.col && last.row === step.row) continue;
    path.push(step);
  }
}
/** Patrouille qui visite toutes les routes dans la portée (évite les zones non couvertes). */
function computePatrolPath(startCol, startRow, maxSteps){
  const reach = computeServiceReach(startCol, startRow, maxSteps);
  const reachKeys = new Set(reach.map(t => tileKey(t.col, t.row)));
  const roadTiles = reach.filter(t => grid[t.row][t.col].hasRoad);
  const path = [{ col: startCol, row: startRow }];
  if (roadTiles.length === 0) return path;

  const visitedRoads = new Set();
  if (grid[startRow][startCol].hasRoad) visitedRoads.add(tileKey(startCol, startRow));

  if (!grid[startRow][startCol].hasRoad){
    const entries = roadNeighbors(startCol, startRow)
      .filter(n => reachKeys.has(tileKey(n.col, n.row)));
    if (entries.length === 0) return path;
    const rng = mulberry32(hashSeed(startCol, startRow));
    const entry = entries.length === 1 ? entries[0] : pickDeterministic(rng, entries);
    appendPatrolSteps(path, [entry]);
    visitedRoads.add(tileKey(entry.col, entry.row));
  }

  let guard = 0;
  while (visitedRoads.size < roadTiles.length && guard < roadTiles.length * 4){
    guard++;
    const current = path[path.length - 1];
    let bestPath = null;
    let bestLen = Infinity;
    for (const t of roadTiles){
      const k = tileKey(t.col, t.row);
      if (visitedRoads.has(k)) continue;
      const sub = shortestPathInReach(current.col, current.row, t.col, t.row, reachKeys);
      if (!sub || sub.length >= bestLen) continue;
      bestLen = sub.length;
      bestPath = sub;
    }
    if (!bestPath) break;
    appendPatrolSteps(path, bestPath);
    for (const step of bestPath){
      if (grid[step.row][step.col].hasRoad) visitedRoads.add(tileKey(step.col, step.row));
    }
  }

  const home = { col: startCol, row: startRow };
  const current = path[path.length - 1];
  if (current.col !== home.col || current.row !== home.row){
    const back = shortestPathInReach(current.col, current.row, home.col, home.row, reachKeys);
    appendPatrolSteps(path, back);
    if (path[path.length - 1].col !== home.col || path[path.length - 1].row !== home.row){
      path.push(home);
    }
  }
  return path;
}
/* ===================== COUVERTURE DE MAISONS ===================== */
function computeServiceReach(serviceCol, serviceRow, maxSteps){
  const result = [{ col: serviceCol, row: serviceRow }];
  const visited = new Set([tileKey(serviceCol, serviceRow)]);
  const queue = [{ col: serviceCol, row: serviceRow, dist: 0 }];
  while (queue.length){
    const cur = queue.shift();
    if (cur.dist >= maxSteps) continue;
    for (const n of roadNeighbors(cur.col, cur.row)){
      const k = tileKey(n.col, n.row);
      if (visited.has(k)) continue;
      visited.add(k);
      result.push(n);
      queue.push({ col: n.col, row: n.row, dist: cur.dist + 1 });
    }
  }
  return result;
}
function computeServedHouses(serviceCol, serviceRow, maxSteps, capacity){
  const coverage = computeServiceReach(serviceCol, serviceRow, maxSteps);
  const candidates = [];
  const seen = new Set();
  for (const tile of coverage){
    const neighbors = [[tile.col - 1, tile.row], [tile.col + 1, tile.row], [tile.col, tile.row - 1], [tile.col, tile.row + 1]];
    for (const [c, r] of neighbors){
      if (!inBounds(c, r) || grid[r][c].building !== 'maison') continue;
      const k = tileKey(c, r);
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push({
        col: c,
        row: r,
        dist: Math.abs(c - serviceCol) + Math.abs(r - serviceRow),
      });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist || a.col - b.col || a.row - b.row);
  return candidates.slice(0, capacity).map(({ col, row }) => ({ col, row }));
}
/** Ordre d'apparition le long du trajet (priorité Zeus : premières maisons sur la route). */
function orderServedHousesByPath(path, houses){
  const firstIndex = new Map();
  for (let i = 0; i < path.length; i++){
    const tile = path[i];
    for (const h of houses){
      const k = tileKey(h.col, h.row);
      if (firstIndex.has(k)) continue;
      const manhattan = Math.abs(h.col - tile.col) + Math.abs(h.row - tile.row);
      if (manhattan === 1) firstIndex.set(k, i);
    }
  }
  return houses.slice().sort((a, b) => {
    const ia = firstIndex.get(tileKey(a.col, a.row));
    const ib = firstIndex.get(tileKey(b.col, b.row));
    return (ia != null ? ia : 9999) - (ib != null ? ib : 9999) || a.col - b.col || a.row - b.row;
  });
}
/* ===================== LIVRAISON AU PASSAGE (Zeus-like) ===================== */
function walkerPassDeliveryEnabled(){
  return typeof WALKER_PASS_DELIVERY !== 'undefined' && WALKER_PASS_DELIVERY;
}
function walkerCarryCapacity(def){
  if (def.carryCapacity != null) return def.carryCapacity;
  if (typeof WALKER_CARRY_BY_SERVICE !== 'undefined' && def.serviceType){
    const v = WALKER_CARRY_BY_SERVICE[def.serviceType];
    if (v != null) return v;
  }
  return def.capacity || 8;
}
function initWalkerPassState(w, def){
  const carry = walkerCarryCapacity(def);
  w.carryCapacity = carry;
  w.inventory = carry;
  w.servedToday = new Set();
}
function walkerStepsPerTick(w){
  if (!walkerPassDeliveryEnabled()) return 1;
  const len = w.path.length;
  if (len <= 1) return 0;
  const dayTicks = typeof DAY_DURATION_TICKS !== 'undefined' ? DAY_DURATION_TICKS : 10;
  return Math.max(1, Math.ceil(len / dayTicks));
}
function getWalkerServiceDay(){
  return Math.floor(DEBUG.tickCount / DAY_DURATION_TICKS);
}
function ensureWalkerServiceDay(){
  if (!walkerPassDeliveryEnabled()) return;
  const day = getWalkerServiceDay();
  if (day === lastWalkerServiceDay) return;
  lastWalkerServiceDay = day;
  resetWalkerDailyService();
}
function resetWalkerDailyService(){
  passServiceToday.clear();
  walkers.forEach(w => {
    w.servedToday = new Set();
    w.inventory = w.carryCapacity != null ? w.carryCapacity : walkerCarryCapacity(BUILDING_DEFS[w.type] || {});
  });
  if (typeof resetMarketDay === 'function') resetMarketDay();
}
function isWalkerEligibleHouse(w, col, row){
  if (grid[row][col].building !== 'maison') return false;
  if (walkerPassDeliveryEnabled()) return isTileInServiceReach(w, col, row);
  return w.servedHouses.some(h => h.col === col && h.row === row);
}
function housesAdjacentToTile(col, row){
  const out = [];
  for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
    if (!inBounds(c, r)) continue;
    if (grid[r][c].building === 'maison') out.push({ col: c, row: r });
  }
  return out;
}
function houseRequiresNeed(col, row, need){
  const cell = grid[row][col];
  if (!cell || cell.building !== 'maison') return false;
  const levels = [HOUSE_LEVELS[cell.houseLevel], HOUSE_LEVELS[cell.houseLevel + 1]].filter(Boolean);
  return levels.some(l => l.requires && l.requires.includes(need));
}
function buildingsAdjacentToTile(col, row){
  const out = [];
  for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
    if (!inBounds(c, r)) continue;
    const cell = grid[r][c];
    if (!cell.building || cell.building === 'maison') continue;
    const def = BUILDING_DEFS[cell.building];
    if (def && def.isDecoration) continue;
    out.push({ col: c, row: r, type: cell.building });
  }
  return out;
}
function isTileInServiceReach(w, col, row){
  const def = BUILDING_DEFS[w.type];
  const range = def && def.range != null ? def.range : 18;
  const reachKeys = new Set(
    computeServiceReach(w.col, w.row, range).map(t => tileKey(t.col, t.row)));
  if (reachKeys.has(tileKey(col, row))) return true;
  for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
    if (reachKeys.has(tileKey(c, r))) return true;
  }
  return false;
}
function isWalkerEligibleFireBuilding(w, col, row){
  return isTileInServiceReach(w, col, row);
}
function countFireEligibleBuildings(w){
  let count = 0;
  forEachBuilding((type, col, row) => {
    if (type === 'maison') return;
    const bdef = BUILDING_DEFS[type];
    if (bdef && bdef.isDecoration) return;
    if (isWalkerEligibleFireBuilding(w, col, row)) count++;
  });
  return count;
}
function deliverFireServiceAtTile(w, col, row){
  for (const house of housesAdjacentToTile(col, row)){
    if (!isWalkerEligibleHouse(w, house.col, house.row)) continue;
    const key = tileKey(house.col, house.row);
    if (w.servedToday.has(key) || isPassServedToday('fire', house.col, house.row)) continue;
    servePassAt(w, house.col, house.row);
  }
  for (const b of buildingsAdjacentToTile(col, row)){
    if (!isWalkerEligibleFireBuilding(w, b.col, b.row)) continue;
    const key = tileKey(b.col, b.row);
    if (w.servedToday.has(key) || isPassServedToday('fire', b.col, b.row)) continue;
    servePassAt(w, b.col, b.row);
  }
}
function isGranaryRoadLinked(serviceCol, serviceRow, maxSteps){
  let linked = false;
  const reach = computeServiceReach(serviceCol, serviceRow, maxSteps);
  forEachBuilding((type, col, row) => {
    if (type !== 'granary') return;
    if (reach.some(t => t.col === col && t.row === row)) linked = true;
  });
  return linked;
}
function isCultureVenueLinked(serviceCol, serviceRow, maxSteps){
  const reachKeys = new Set(
    computeServiceReach(serviceCol, serviceRow, maxSteps).map(t => tileKey(t.col, t.row)));
  let linked = false;
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (!def || !def.isVenue) return;
    if (reachKeys.has(tileKey(col, row))) linked = true;
    for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
      if (reachKeys.has(tileKey(c, r))) linked = true;
    }
  });
  return linked;
}
function tryRefillWalkerAtHome(w){
  if (!w.path.length) return;
  const home = w.path[0];
  const cur = w.path[w.pathIndex];
  if (!home || !cur || home.col !== cur.col || home.row !== cur.row) return;
  w.inventory = w.carryCapacity != null ? w.carryCapacity : walkerCarryCapacity(BUILDING_DEFS[w.type] || {});
}
function servePassAt(w, col, row){
  const key = tileKey(col, row);
  w.servedToday.add(key);
  markPassService(w.serviceType, col, row);
}
function deliverWalkerServiceAtTile(w, col, row){
  if (!walkerPassDeliveryEnabled()) return;
  if (w.serviceType === 'fire'){
    deliverFireServiceAtTile(w, col, row);
    return;
  }
  for (const house of housesAdjacentToTile(col, row)){
    if (!isWalkerEligibleHouse(w, house.col, house.row)) continue;
    const key = tileKey(house.col, house.row);
    if (w.servedToday.has(key) || isPassServedToday(w.serviceType, house.col, house.row)) continue;
    if (w.serviceType === 'water'){
      if (!houseRequiresNeed(house.col, house.row, 'water')) continue;
      servePassAt(w, house.col, house.row);
      continue;
    }
    if (w.serviceType === 'religion'){
      if (!houseRequiresNeed(house.col, house.row, 'religion')) continue;
      servePassAt(w, house.col, house.row);
      continue;
    }
    if (w.serviceType === 'culture'){
      if (!houseRequiresNeed(house.col, house.row, 'culture')) continue;
      const def = BUILDING_DEFS[w.type];
      const range = def && def.range != null ? def.range : 18;
      if (!isCultureVenueLinked(w.col, w.row, range)) continue;
      servePassAt(w, house.col, house.row);
      continue;
    }
    if (w.serviceType === 'health'){
      // santé = protection contre la maladie pour TOUTES les maisons, pas seulement palais
      servePassAt(w, house.col, house.row);
      continue;
    }
    if (w.serviceType === 'tax'){
      servePassAt(w, house.col, house.row);
      continue;
    }
    if (w.serviceType === 'market'){
      if (typeof deliverMarketAtHouse === 'function'){
        if (deliverMarketAtHouse(w, house.col, house.row)){
          servePassAt(w, house.col, house.row);
        }
      }
    }
  }
}
function processWalkerSegmentPass(w, fromTile, toTile){
  if (!walkerPassDeliveryEnabled()) return;
  if (fromTile) deliverWalkerServiceAtTile(w, fromTile.col, fromTile.row);
  if (toTile && (fromTile?.col !== toTile.col || fromTile?.row !== toTile.row)){
    deliverWalkerServiceAtTile(w, toTile.col, toTile.row);
  }
}
/* ===================== RECALCUL / DEPLACEMENT ===================== */
function recomputeAllWalkers(){
  const prevInventory = new Map();
  if (walkerPassDeliveryEnabled()){
    walkers.forEach(w => {
      prevInventory.set(`${w.col},${w.row},${w.type}`, w.inventory);
    });
  }
  walkers = [];
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (!def.isService) return;
    const path = computePatrolPath(col, row, def.range);
    const houseCap = walkerPassDeliveryEnabled() ? 9999 : def.capacity;
    let servedHouses = computeServedHouses(col, row, def.range, houseCap);
    servedHouses = orderServedHousesByPath(path, servedHouses);
    const w = {
      col, row, type, serviceType: def.serviceType, path,
      pathIndex: 0, prevPathIndex: 0, direction: 1,
      facing: 'down', mirrorX: false, servedHouses,
      moveStartTime: performance.now(),
    };
    if (walkerPassDeliveryEnabled()){
      initWalkerPassState(w, def);
      const prevInv = prevInventory.get(`${col},${row},${type}`);
      if (prevInv != null) w.inventory = Math.min(prevInv, w.carryCapacity);
      syncWalkerServedToday(w);
    }
    walkers.push(w);
  });
  lastWalkerServiceDay = getWalkerServiceDay();
  debugInfo(`Patrouilles recalculées : ${walkers.length} bâtiment(s) de service actif(s)`);
  if (typeof markHouseIconsDirty === 'function') markHouseIconsDirty();
  if (typeof invalidateCityMap === 'function') invalidateCityMap();
}
function advanceWalkerStep(w, now){
  if (w.path.length <= 1) return false;
  const startIdx = w.pathIndex;
  let guard = 0;
  do {
    w.prevPathIndex = w.pathIndex;
    w.pathIndex += w.direction;
    if (w.pathIndex >= w.path.length - 1){
      w.pathIndex = w.path.length - 1;
      w.direction = -1;
    } else if (w.pathIndex <= 0){
      w.pathIndex = 0;
      w.direction = 1;
    }
    guard++;
    const from = w.path[w.prevPathIndex];
    const to = w.path[w.pathIndex];
    if (from && to && (from.col !== to.col || from.row !== to.row)) break;
  } while (guard < w.path.length && w.pathIndex !== startIdx);
  const from = w.path[w.prevPathIndex];
  const to = w.path[w.pathIndex];
  if (!from || !to || (from.col === to.col && from.row === to.row)) return false;
  w.moveStartTime = now;
  processWalkerSegmentPass(w, from, to);
  tryRefillWalkerAtHome(w);
  if (typeof applyIsoFacingFromDelta === 'function'){
    applyIsoFacingFromDelta(w, to.col - from.col, to.row - from.row);
  }
  return true;
}
function advanceWalkers(){
  ensureWalkerServiceDay();
  const now = performance.now();
  walkers.forEach(w => {
    const steps = walkerStepsPerTick(w);
    for (let i = 0; i < steps; i++){
      if (!advanceWalkerStep(w, now)) break;
    }
  });
  if (walkerPassDeliveryEnabled() && typeof markHouseIconsDirty === 'function'){
    markHouseIconsDirty();
  }
}
function isHouseServedBy(serviceType, col, row){
  const inReach = w => w.serviceType === serviceType && (
    walkerPassDeliveryEnabled()
      ? isTileInServiceReach(w, col, row)
      : w.servedHouses.some(h => h.col === col && h.row === row));
  if (!walkers.some(inReach)) return false;
  if (walkerPassDeliveryEnabled()){
    return isPassServedToday(serviceType, col, row);
  }
  return true;
}
function isHouseEligibleForService(serviceType, col, row){
  return walkers.some(w => w.serviceType === serviceType && (
    walkerPassDeliveryEnabled()
      ? isTileInServiceReach(w, col, row)
      : w.servedHouses.some(h => h.col === col && h.row === row)));
}
function isTileFireServed(col, row){
  if (walkerPassDeliveryEnabled()){
    return isPassServedToday('fire', col, row);
  }
  return walkers.some(w => {
    if (w.serviceType !== 'fire') return false;
    const def = BUILDING_DEFS[w.type];
    const range = def && def.range != null ? def.range : 18;
    return computeServiceReach(w.col, w.row, range).some(t => t.col === col && t.row === row);
  });
}
function isTileFireEligible(col, row){
  if (!walkerPassDeliveryEnabled()){
    return isTileFireServed(col, row);
  }
  return walkers.some(w => w.serviceType === 'fire' && isWalkerEligibleFireBuilding(w, col, row));
}
window.isTileFireEligible = isTileFireEligible;
window.isTileFireServed = isTileFireServed;
function findServingWalker(serviceType, col, row){
  return walkers.find(w => w.serviceType === serviceType && (
    walkerPassDeliveryEnabled()
      ? isTileInServiceReach(w, col, row)
      : w.servedHouses.some(h => h.col === col && h.row === row))) || null;
}
function countWalkerEligibleHouses(w){
  let n = 0;
  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    if (isTileInServiceReach(w, col, row)) n++;
  });
  return n;
}
function getWalkerPassStats(w){
  const eligibleHouses = countWalkerEligibleHouses(w);
  const eligibleBuildings = w.serviceType === 'fire' ? countFireEligibleBuildings(w) : 0;
  const eligible = eligibleHouses + eligibleBuildings;
  const served = w.servedToday ? w.servedToday.size : 0;
  return { eligible, served, inventory: w.inventory, carry: w.carryCapacity };
}
window.isTileInServiceReach = isTileInServiceReach;
function serviceCoverageTileCount(serviceCol, serviceRow, maxSteps){
  return computeServiceReach(serviceCol, serviceRow, maxSteps).length;
}
function isPatrolWalker(agent){
  return !!(agent && agent.serviceType != null && Array.isArray(agent.path) && agent.direction != null);
}
function getWalkerMovementDelta(walker){
  if (!isPatrolWalker(walker) || walker.path.length <= 1) return null;
  const i = Number.isFinite(walker.pathIndex) ? walker.pathIndex : 0;
  if (i < 0 || i >= walker.path.length) return null;
  const prev = Number.isFinite(walker.prevPathIndex) ? walker.prevPathIndex : i;
  if (prev !== i){
    const from = walker.path[prev];
    const to = walker.path[i];
    if (from && to) return { dcol: to.col - from.col, drow: to.row - from.row };
  }
  const j = i + walker.direction;
  if (j >= 0 && j < walker.path.length){
    const from = walker.path[i];
    const to = walker.path[j];
    if (from && to) return { dcol: to.col - from.col, drow: to.row - from.row };
  }
  if (i > 0){
    const from = walker.path[i - 1];
    const to = walker.path[i];
    if (from && to) return { dcol: to.col - from.col, drow: to.row - from.row };
  }
  return null;
}
function getWalkerInterp(walker, now){
  if (!walker?.path?.length){
    return { col: walker?.col ?? 0, row: walker?.row ?? 0, t: 0, fromTile: null, toTile: null };
  }
  if (walker.path.length <= 1){
    const tile = walker.path[0];
    return { col: tile.col, row: tile.row, t: 0, fromTile: tile, toTile: tile };
  }
  const pathIndex = Math.min(
    Math.max(0, Number.isFinite(walker.pathIndex) ? walker.pathIndex : 0),
    walker.path.length - 1,
  );
  let fromIdx = Number.isFinite(walker.prevPathIndex) ? walker.prevPathIndex : pathIndex;
  fromIdx = Math.min(Math.max(0, fromIdx), walker.path.length - 1);
  let toIdx = pathIndex;
  if (fromIdx === toIdx){
    const nextIdx = toIdx + (walker.direction || 1);
    if (nextIdx >= 0 && nextIdx < walker.path.length){
      fromIdx = toIdx;
      toIdx = nextIdx;
    }
  }
  const fromTile = walker.path[fromIdx];
  const toTile = walker.path[toIdx];
  if (!fromTile || !toTile){
    return { col: walker.col ?? 0, row: walker.row ?? 0, t: 0, fromTile, toTile };
  }
  const tickMs = typeof TICK_DURATION_MS !== 'undefined' ? TICK_DURATION_MS : 1000;
  const start = Number.isFinite(walker.moveStartTime) ? walker.moveStartTime
    : (typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : now);
  const elapsed = now - start;
  if (fromTile.col === toTile.col && fromTile.row === toTile.row){
    return {
      fromTile, toTile, fromIdx, toIdx, t: 1,
      col: toTile.col, row: toTile.row,
    };
  }
  const t = Math.min(1, Math.max(0, elapsed / tickMs));
  return {
    fromTile,
    toTile,
    fromIdx,
    toIdx,
    t,
    col: fromTile.col + (toTile.col - fromTile.col) * t,
    row: fromTile.row + (toTile.row - fromTile.row) * t,
  };
}
function getWalkerScreenPos(walker, now){
  const interp = getWalkerInterp(walker, now);
  if (!interp.fromTile || !interp.toTile){
    return tileDiamondCenter(interp.col, interp.row);
  }
  if (interp.fromTile.col === interp.toTile.col && interp.fromTile.row === interp.toTile.row){
    return tileDiamondCenter(interp.col, interp.row);
  }
  const fromPos = tileDiamondCenter(interp.fromTile.col, interp.fromTile.row);
  const toPos = tileDiamondCenter(interp.toTile.col, interp.toTile.row);
  return {
    x: fromPos.x + (toPos.x - fromPos.x) * interp.t,
    y: fromPos.y + (toPos.y - fromPos.y) * interp.t,
  };
}
window.isHouseEligibleForService = isHouseEligibleForService;
window.houseRequiresNeed = houseRequiresNeed;
window.getWalkerPassStats = getWalkerPassStats;
window.isGranaryRoadLinked = isGranaryRoadLinked;
window.isCultureVenueLinked = isCultureVenueLinked;
