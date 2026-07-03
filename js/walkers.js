/* ===================== ETAT DES WALKERS ===================== */
// Un walker = un bâtiment de service + son trajet de patrouille figé + sa couverture
// de maisons (calculée une seule fois, pas à chaque tick). Le déplacement visuel est
// un aller-retour cosmétique sur ce même trajet, sans impact sur la couverture.
let walkers = []; // { col, row, type, path:[{col,row}...], pathIndex, direction, servedHouses:[{col,row}...] }

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
      // Sur une route : rester sur le réseau routier (pas de raccourci via bâtiments).
      if (onRoad) return !!cell.hasRoad;
      // Depuis le bâtiment de service : entrer uniquement sur une case route.
      return !!cell.hasRoad;
    })
    .map(([c, r]) => ({ col: c, row: r }));
}

function pickDeterministic(rng, arr){
  return arr[Math.floor(rng() * arr.length)];
}

/** Prolonge une route en ligne droite (1 voisin route) jusqu'à impasse / carrefour / budget. */
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

/** Trie les sorties route depuis le hub (ordre stable = gauche / droite reproductibles). */
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

/** Vérifie que deux cases du trajet sont identiques ou voisines (4-dir). */
function pathStepOk(a, b){
  if (!a || !b) return false;
  if (a.col === b.col && a.row === b.row) return true;
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

/** Ajoute le retour le long d'un bras de route jusqu'au hub (pas de téléportation). */
function appendArmReturn(path, arm, hub){
  if (!arm.length) return;
  for (let i = arm.length - 2; i >= 0; i--) path.push({ col: arm[i].col, row: arm[i].row });
  path.push({ col: hub.col, row: hub.row });
}

// Trajet de patrouille le long des routes. Sur une route droite (hub + 2 directions),
// le path enchaîne : bâtiment → hub → bras A → retour hub → bras B → retour hub.
// Chaque segment consécutif est adjacent — le ping-pong visual retrace le trajet normalement.
function computePatrolPath(startCol, startRow, maxSteps){
  const path = [{ col: startCol, row: startRow }];
  const entries = roadNeighbors(startCol, startRow);
  if (entries.length === 0) return path;

  const rng = mulberry32(hashSeed(startCol, startRow));
  const hub = entries.length === 1 ? entries[0] : pickDeterministic(rng, entries);
  path.push(hub);

  const exits = sortRoadExits(hub.col, hub.row, roadNeighbors(hub.col, hub.row)
    .filter(n => !(n.col === startCol && n.row === startRow)));

  if (exits.length === 2){
    const half = Math.max(1, Math.floor((maxSteps - 1) / 2));
    const armA = walkRoadArm(exits[0].col, exits[0].row, hub.col, hub.row, half);
    path.push(...armA);
    appendArmReturn(path, armA, hub);
    const armB = walkRoadArm(exits[1].col, exits[1].row, hub.col, hub.row, half);
    path.push(...armB);
    appendArmReturn(path, armB, hub);
    return path;
  }

  const visited = new Set(path.map(t => tileKey(t.col, t.row)));
  let current = exits.length > 0 ? pickDeterministic(rng, exits) : null;
  while (current && path.length <= maxSteps){
    path.push(current);
    visited.add(tileKey(current.col, current.row));
    const next = roadNeighbors(current.col, current.row)
      .filter(n => !visited.has(tileKey(n.col, n.row)));
    current = next.length > 0 ? pickDeterministic(rng, next) : null;
  }
  return path;
}

/* ===================== COUVERTURE DE MAISONS ===================== */
/** Cases atteignables depuis le bâtiment de service (BFS routes, maxSteps). */
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

/** Maisons orthogonalement adjacentes à une case de couverture, triées par distance au hub. */
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

/* ===================== RECALCUL / DEPLACEMENT ===================== */
function recomputeAllWalkers(){
  walkers = [];
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (!def.isService) return;
    const path = computePatrolPath(col, row, def.range);
    const servedHouses = computeServedHouses(col, row, def.range, def.capacity);
    walkers.push({
      col, row, type, serviceType: def.serviceType, path,
      pathIndex: 0, prevPathIndex: 0, direction: 1,
      facing: 'down', mirrorX: false, servedHouses,
      moveStartTime: performance.now(),
    });
  });
  debugInfo(`Patrouilles recalculées : ${walkers.length} bâtiment(s) de service actif(s)`);
  if (typeof markHouseIconsDirty === 'function') markHouseIconsDirty();
  if (typeof invalidateCityMap === 'function') invalidateCityMap();
}

function advanceWalkers(){
  const now = performance.now();
  walkers.forEach(w => {
    if (w.path.length <= 1) return; // pas connecté à une route, ne bouge pas
    w.prevPathIndex = w.pathIndex;
    w.pathIndex += w.direction;
    if (w.pathIndex >= w.path.length - 1){
      w.pathIndex = w.path.length - 1;
      w.direction = -1;
    } else if (w.pathIndex <= 0){
      w.pathIndex = 0;
      w.direction = 1;
    }
    w.moveStartTime = now;

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

/** Walker qui dessert une maison pour un type de service (null si aucun). */
function findServingWalker(serviceType, col, row){
  return walkers.find(w => w.serviceType === serviceType && w.servedHouses.some(h => h.col === col && h.row === row)) || null;
}

/** Nombre de cases route atteignables depuis un service (pour l'observateur). */
function serviceCoverageTileCount(serviceCol, serviceRow, maxSteps){
  return computeServiceReach(serviceCol, serviceRow, maxSteps).length;
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

/** Segment d'interpolation : prevPathIndex → pathIndex après tick, sinon case courante → suivante. */
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

  // Avant le premier tick (prev === index) : glisser vers la prochaine case du trajet.
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

  // Même case (doublon dans le trajet) : pas de pause d'une seconde entière.
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

/* ===================== POSITION ECRAN INTERPOLEE ===================== */
// Glisse visuellement entre prevPathIndex et pathIndex (tick écoulé depuis lastTickTimestamp).
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
