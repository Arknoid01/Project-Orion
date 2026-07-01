/* ===================== ETAT DES WALKERS ===================== */
// Un walker = un bâtiment de service + son trajet de patrouille figé + sa couverture
// de maisons (calculée une seule fois, pas à chaque tick). Le déplacement visuel est
// un aller-retour cosmétique sur ce même trajet, sans impact sur la couverture.
let walkers = []; // { col, row, type, path:[{col,row}...], pathIndex, direction, servedHouses:[{col,row}...] }

/* ===================== GENERATION DU TRAJET ===================== */
function tileKey(col, row){ return `${col},${row}`; }

function roadNeighbors(col, row){
  const candidates = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  return candidates
    .filter(([c, r]) => {
      if (!inBounds(c, r)) return false;
      if (typeof roadTileConnects === 'function'){
        return roadTileConnects(col, row, c, r);
      }
      return grid[r][c].hasRoad && !grid[r][c].patrolBlock;
    })
    .map(([c, r]) => ({ col: c, row: r }));
}

function pickDeterministic(rng, arr){
  return arr[Math.floor(rng() * arr.length)];
}

// DFS qui serpente le long des routes connectées, sans repasser deux fois sur la même
// case, jusqu'à épuiser le budget maxSteps ou arriver dans une impasse. Le choix de
// branche à un carrefour est déterministe (seed basé sur la position du bâtiment),
// donc reproductible — et la borne de blocage permet au joueur de l'influencer.
function computePatrolPath(startCol, startRow, maxSteps){
  const path = [{ col: startCol, row: startRow }];
  const firstNeighbors = roadNeighbors(startCol, startRow);
  if (firstNeighbors.length === 0) return path; // pas connecté à une route : immobile

  const rng = mulberry32(hashSeed(startCol, startRow));
  const visited = new Set([tileKey(startCol, startRow)]);
  let current = pickDeterministic(rng, firstNeighbors);

  while (current && path.length <= maxSteps){
    path.push(current);
    visited.add(tileKey(current.col, current.row));
    const next = roadNeighbors(current.col, current.row).filter(n => !visited.has(tileKey(n.col, n.row)));
    current = next.length > 0 ? pickDeterministic(rng, next) : null;
  }
  return path;
}

/* ===================== COUVERTURE DE MAISONS ===================== */
function computeServedHouses(path, capacity){
  const served = [];
  const seen = new Set();
  for (const tile of path){
    if (served.length >= capacity) break;
    const neighbors = [[tile.col - 1, tile.row], [tile.col + 1, tile.row], [tile.col, tile.row - 1], [tile.col, tile.row + 1]];
    for (const [c, r] of neighbors){
      if (served.length >= capacity) break;
      if (!inBounds(c, r) || grid[r][c].building !== 'maison') continue;
      const k = tileKey(c, r);
      if (seen.has(k)) continue;
      seen.add(k);
      served.push({ col: c, row: r });
    }
  }
  return served;
}

/* ===================== RECALCUL / DEPLACEMENT ===================== */
function recomputeAllWalkers(){
  walkers = [];
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (!def.isService) return;
    const path = computePatrolPath(col, row, def.range);
    const servedHouses = computeServedHouses(path, def.capacity);
    walkers.push({ col, row, type, serviceType: def.serviceType, path, pathIndex: 0, prevPathIndex: 0, direction: 1, facing: 'down', mirrorX: false, servedHouses });
  });
  debugInfo(`Patrouilles recalculées : ${walkers.length} bâtiment(s) de service actif(s)`);
}

function advanceWalkers(){
  walkers.forEach(w => {
    if (w.path.length <= 1) return; // pas connecté à une route, ne bouge pas
    w.prevPathIndex = w.pathIndex;
    w.pathIndex += w.direction;
    if (w.pathIndex >= w.path.length - 1){ w.pathIndex = w.path.length - 1; w.direction = -1; }
    else if (w.pathIndex <= 0){ w.pathIndex = 0; w.direction = 1; }

    const from = w.path[w.prevPathIndex];
    const to = w.path[w.pathIndex];
    if (typeof applyIsoFacingFromDelta === 'function'){
      applyIsoFacingFromDelta(w, to.col - from.col, to.row - from.row);
    }
  });
}

function isHouseServedBy(serviceType, col, row){
  return walkers.some(w => w.serviceType === serviceType && w.servedHouses.some(h => h.col === col && h.row === row));
}

/** true si l'agent utilise la sémantique patrouille (pathIndex = case courante, direction ±1). */
function isPatrolWalker(agent){
  return !!(agent && agent.serviceType != null && Array.isArray(agent.path) && agent.direction != null);
}

/** Delta grille du segment de route en cours (respecte le sens de patrouille). */
function getWalkerMovementDelta(walker){
  if (!isPatrolWalker(walker) || walker.path.length <= 1) return null;
  const i = Number.isFinite(walker.pathIndex) ? walker.pathIndex : 0;
  if (i < 0 || i >= walker.path.length) return null;
  const j = i + walker.direction;
  if (j >= 0 && j < walker.path.length){
    const from = walker.path[i];
    const to = walker.path[j];
    if (!from || !to) return null;
    return { dcol: to.col - from.col, drow: to.row - from.row };
  }
  const from = walker.path[Math.max(0, i - 1)];
  const to = walker.path[i];
  if (!from || !to) return null;
  return { dcol: to.col - from.col, drow: to.row - from.row };
}

/* ===================== POSITION ECRAN INTERPOLEE ===================== */
// Glisse visuellement entre la case précédente et la case actuelle en fonction du temps
// écoulé depuis le dernier tick — la simulation reste à 1 pas/seconde, seul l'affichage
// est rafraîchi en continu (voir loop.js).
function getWalkerScreenPos(walker, now){
  if (!walker.path || walker.path.length === 0){
    return tileDiamondCenter(walker.col ?? 0, walker.row ?? 0);
  }
  const i = Number.isFinite(walker.pathIndex)
    ? Math.min(Math.max(0, walker.pathIndex), walker.path.length - 1)
    : 0;
  const tile = walker.path[i];
  if (!tile) return tileDiamondCenter(walker.col ?? 0, walker.row ?? 0);
  if (walker.path.length <= 1) return tileDiamondCenter(tile.col, tile.row);

  const j = i + (walker.direction || 1);
  const fromTile = (j >= 0 && j < walker.path.length)
    ? walker.path[i]
    : walker.path[Math.max(0, i - 1)];
  const toTile = (j >= 0 && j < walker.path.length)
    ? walker.path[j]
    : walker.path[i];
  if (!fromTile || !toTile) return tileDiamondCenter(tile.col, tile.row);
  const elapsed = now - lastTickTimestamp;
  const t = Math.min(1, Math.max(0, elapsed / TICK_DURATION_MS));

  const fromPos = tileDiamondCenter(fromTile.col, fromTile.row);
  const toPos = tileDiamondCenter(toTile.col, toTile.row);
  return {
    x: fromPos.x + (toPos.x - fromPos.x) * t,
    y: fromPos.y + (toPos.y - fromPos.y) * t,
  };
}
