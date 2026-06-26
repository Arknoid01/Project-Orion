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
    .filter(([c, r]) => inBounds(c, r) && grid[r][c].hasRoad && !grid[r][c].patrolBlock)
    .map(([c, r]) => ({ col: c, row: r }));
}

function pickDeterministic(rng, arr){
  return arr[Math.floor(rng() * arr.length)];
}

// Construit un trajet linéaire (utilisé tel quel par l'aller-retour). Quand le bâtiment
// a exactement 2 sorties (route qui passe tout droit), on explore les DEUX sens, recollés
// avec le bâtiment au centre — sinon une seule moitié de la route serait jamais visitée.
// Pour 1, 3 ou 4 sorties (impasse ou carrefour), un seul sens est choisi de façon
// déterministe, ce qui garde l'intérêt "plusieurs marchés nécessaires" à un carrefour complexe.
function computePatrolPath(startCol, startRow, maxSteps){
  const startTile = { col: startCol, row: startRow };
  const neighbors = roadNeighbors(startCol, startRow);
  if (neighbors.length === 0) return { path: [startTile], startIndex: 0 }; // pas connecté : immobile

  const rng = mulberry32(hashSeed(startCol, startRow));

  if (neighbors.length === 2){
    const branchA = walkBranch(rng, neighbors[0], startTile, maxSteps);
    const branchB = walkBranch(rng, neighbors[1], startTile, maxSteps);
    const path = [...[...branchA].reverse(), startTile, ...branchB];
    return { path, startIndex: branchA.length };
  }

  const branch = walkBranch(rng, pickDeterministic(rng, neighbors), startTile, maxSteps);
  return { path: [startTile, ...branch], startIndex: 0 };
}

// Suit une seule direction le long des routes connectées, sans repasser deux fois sur la
// même case, jusqu'à épuiser maxSteps ou arriver dans une impasse.
function walkBranch(rng, firstTile, startTile, maxSteps){
  const path = [];
  const visited = new Set([tileKey(startTile.col, startTile.row)]);
  let current = firstTile;
  while (current && path.length < maxSteps){
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
    const { path, startIndex } = computePatrolPath(col, row, def.range);
    const servedHouses = computeServedHouses(path, def.capacity);
    walkers.push({
      col, row, type, serviceType: def.serviceType,
      path, pathIndex: startIndex, prevPathIndex: startIndex, direction: 1, facing: 'right',
      servedHouses,
    });
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
    // En isométrique, un déplacement n'est jamais purement vertical à l'écran : chaque pas a
    // toujours une composante gauche OU droite. On utilise donc uniquement les poses gauche/droite
    // (déjà présentes dans la feuille), plutôt que haut/bas qui ne correspondraient à rien de réel.
    if (to.col > from.col || to.row < from.row) w.facing = 'right';
    else if (to.col < from.col || to.row > from.row) w.facing = 'left';
    // si from === to (cas limite), on garde le dernier facing connu plutôt que de le changer
  });
}

function isHouseServedBy(serviceType, col, row){
  return walkers.some(w => w.serviceType === serviceType && w.servedHouses.some(h => h.col === col && h.row === row));
}

/* ===================== POSITION ECRAN INTERPOLEE ===================== */
// Glisse visuellement entre la case précédente et la case actuelle en fonction du temps
// écoulé depuis le dernier tick — la simulation reste à 1 pas/seconde, seul l'affichage
// est rafraîchi en continu (voir loop.js).
function getWalkerScreenPos(walker, now){
  const tile = walker.path[walker.pathIndex];
  if (walker.path.length <= 1) return tileCenter(tile.col, tile.row);

  const fromTile = walker.path[walker.prevPathIndex];
  const elapsed = now - lastTickTimestamp;
  const t = Math.min(1, Math.max(0, elapsed / TICK_DURATION_MS));

  const fromPos = tileCenter(fromTile.col, fromTile.row);
  const toPos = tileCenter(tile.col, tile.row);
  return {
    x: fromPos.x + (toPos.x - fromPos.x) * t,
    y: fromPos.y + (toPos.y - fromPos.y) * t,
  };
}
