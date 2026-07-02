/* ===================== ETAT DE LA CARTE ===================== */
let grid = []; // grid[row][col] = { terrain, building, hasRoad, elevation, ... }

async function initGrid(){
  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  else if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  if (typeof generateProceduralMap === 'function'){
    await generateProceduralMap();
  } else {
    grid = [];
    for (let row = 0; row < GRID_ROWS; row++){
      const line = [];
      for (let col = 0; col < GRID_COLS; col++){
        line.push(makeEmptyCell('grass', 0.4));
      }
      grid.push(line);
    }
  }
}

function makeEmptyCell(terrain, elevation){
  const level = (typeof levelFromElevation === 'function')
    ? levelFromElevation(elevation)
    : 1;
  const cell = {
    terrain: terrain || 'grass',
    building: null,
    hasRoad: false,
    roadStairs: false,
    houseLevel: 0,
    population: 0,
    patrolBlock: false,
    beauty: 0,
    level,
    elevation: elevation || 0,
    slope: 0,
  };
  if (typeof syncCellLevelElevation === 'function') syncCellLevelElevation(cell);
  return cell;
}

/* ===================== ORDRE DE DESSIN (cache) ===================== */
let mapDrawOrder = null;
let terrainDataVersion = 0;

function bumpTerrainVersion(){
  terrainDataVersion++;
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof invalidatePixiTerrain === 'function') invalidatePixiTerrain();
  if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  if (typeof invalidateThreeTerrain === 'function') invalidateThreeTerrain();
}

function invalidateMapDrawOrder(){ mapDrawOrder = null; }

function getMapDrawOrder(){
  if (!mapDrawOrder){
    mapDrawOrder = [];
    for (let row = 0; row < GRID_ROWS; row++){
      for (let col = 0; col < GRID_COLS; col++){
        mapDrawOrder.push({ col, row, key: tileSortKey(col, row) });
      }
    }
    mapDrawOrder.sort((a, b) => a.key - b.key);
  }
  return mapDrawOrder;
}

function inBounds(col, row){
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

/* ===================== MATHS GRILLE ISO ===================== */
function tileCenter(col, row){
  if (typeof usesLayeredTerrain === 'function' && usesLayeredTerrain()
      && typeof tileSurfaceAnchor === 'function'){
    return tileSurfaceAnchor(col, row);
  }
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : 1;
  let elevOffset = 0;
  if (typeof usesTerrainBlocks === 'function' && usesTerrainBlocks()){
    elevOffset = typeof blockElevationOffset === 'function'
      ? blockElevationOffset(level)
      : Math.max(0, level - 1) * cellBlockStep();
  } else {
    const elev = inBounds(col, row) ? (grid[row][col].elevation || 0) : 0;
    elevOffset = elev * ELEVATION_PIXELS;
  }
  return {
    x: OFFSET_X + (col - row) * (TILE_W / 2),
    y: OFFSET_Y + (col + row) * (TILE_H / 2) - elevOffset,
  };
}

/** Sommet visuel du losange (cap) — corrige le décalage des cubes PNG empilés. */
function natureDecorTileNorth(col, row){
  const anchor = (typeof usesLayeredTerrain === 'function' && usesLayeredTerrain()
      && typeof tileSurfaceAnchor === 'function')
    ? tileSurfaceAnchor(col, row)
    : tileCenter(col, row);
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()
      && typeof blockTopSpriteForCell === 'function'
      && typeof terrainBlockMetrics === 'function'
      && inBounds(col, row)){
    const cell = grid[row][col];
    const sprite = blockTopSpriteForCell(cell, false);
    if (sprite){
      const m = terrainBlockMetrics(sprite);
      if (m && m.capBackOffset){
        return { x: anchor.x, y: anchor.y - m.capBackOffset };
      }
    }
  }
  return anchor;
}

/** Centre du losange walkable (clics / surbrillance). */
function tileDiamondCenter(col, row){
  const north = tileCenter(col, row);
  return { x: north.x, y: north.y + TILE_H / 2 };
}

/** Pied des entités / base des bâtiments = sommet sud du losange (tileCenter + TILE_H). */
function tileEntityFoot(col, row){
  const north = tileCenter(col, row);
  return { x: north.x, y: north.y + TILE_H };
}

function tilePickPoint(col, row){
  return typeof tileDiamondCenter === 'function'
    ? tileDiamondCenter(col, row)
    : tileCenter(col, row);
}

/** Le point (mx,my) est-il dans le losange walkable de la case ? */
function pointInIsoCell(mx, my, col, row){
  const foot = tilePickPoint(col, row);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  if (hw <= 0 || hh <= 0) return false;
  const dx = Math.abs(mx - foot.x) / hw;
  const dy = Math.abs(my - foot.y) / hh;
  if (dx + dy <= 1.02) return true;

  // Les décors hauts (arbres sur case forêt) débordent visuellement vers le haut
  // de leur case, au-delà du losange plat — un clic sur le feuillage visible
  // atterrissait donc sur la case voisine derrière. On élargit la zone cliquable
  // vers le haut spécifiquement pour les cases forêt, pour suivre la zone visuelle
  // réelle du sprite plutôt que la seule empreinte au sol.
  if (Array.isArray(grid) && grid[row] && grid[row][col] && grid[row][col].terrain === 'forest'){
    const liftedFootY = foot.y - TILE_H * 1.6;
    const dyLifted = Math.abs(my - liftedFootY) / hh;
    if (dx + dyLifted <= 1.02) return true;
  }
  return false;
}

function screenToTile(mx, my){
  const lx = mx - OFFSET_X;
  const ly = my - OFFSET_Y;
  const col = Math.round(lx / TILE_W + ly / TILE_H);
  const row = Math.round(ly / TILE_H - lx / TILE_W);
  return { col, row };
}

function pickTileAtWorld(mx, my){
  const approx = screenToTile(mx, my);

  // Passe prioritaire : un feuillage d'arbre visible à l'écran occulte ce qu'il y a
  // derrière. Si le point cliqué tombe dans la zone élargie (feuillage) d'une case
  // forêt, elle gagne directement, même si une case voisine matche aussi le test au
  // sol classique (sinon le tri par profondeur favorise systématiquement la voisine
  // plus proche de la caméra, qui n'est pourtant pas ce qui est visuellement cliqué).
  for (let dr = -2; dr <= 2; dr++){
    for (let dc = -2; dc <= 2; dc++){
      const c = approx.col + dc;
      const r = approx.row + dr;
      if (!inBounds(c, r)) continue;
      if (!grid[r] || !grid[r][c] || grid[r][c].terrain !== 'forest') continue;
      if (pointInIsoCell(mx, my, c, r)){
        // pointInIsoCell renvoie true soit pour le test au sol normal, soit pour la
        // zone feuillage élargie : on revérifie ici que c'est bien la zone élargie
        // (au-dessus du losange normal) qui matche, pour ne pas voler la priorité
        // aux vrais clics au sol sur une case forêt adjacente non concernée.
        const foot = tilePickPoint(c, r);
        const hw = TILE_W / 2, hh = TILE_H / 2;
        const dxN = Math.abs(mx - foot.x) / hw;
        const dyN = Math.abs(my - foot.y) / hh;
        const normalHit = (dxN + dyN) <= 1.02;
        if (!normalHit) return { col: c, row: r }; // zone feuillage uniquement -> priorité immédiate
      }
    }
  }

  const hits = [];
  for (let dr = -2; dr <= 2; dr++){
    for (let dc = -2; dc <= 2; dc++){
      const c = approx.col + dc;
      const r = approx.row + dr;
      if (!inBounds(c, r)) continue;
      if (pointInIsoCell(mx, my, c, r)) hits.push({ col: c, row: r, depth: c + r });
    }
  }
  if (hits.length > 0){
    hits.sort((a, b) => b.depth - a.depth);
    return { col: hits[0].col, row: hits[0].row };
  }
  let bestCol = approx.col;
  let bestRow = approx.row;
  let bestDist = Infinity;
  for (let dr = -3; dr <= 3; dr++){
    for (let dc = -3; dc <= 3; dc++){
      const c = approx.col + dc;
      const r = approx.row + dr;
      if (!inBounds(c, r)) continue;
      const { x, y } = tilePickPoint(c, r);
      const d = Math.hypot(x - mx, y - my);
      if (d < bestDist){
        bestDist = d;
        bestCol = c;
        bestRow = r;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

/** Pick unifié : Three.js raycast ou fallback iso 2D. */
function pickTileAtScreen(clientX, clientY){
  if (typeof isThreeReady === 'function' && isThreeReady()
      && typeof threeRayPick === 'function'){
    const pick = threeRayPick(clientX, clientY);
    return {
      col: pick.col,
      row: pick.row,
      hit: pick.hit,
      clientX,
      clientY,
      x: pick.x,
      y: pick.y,
      z: pick.z,
    };
  }
  const pickFn = typeof clientToMapWorld === 'function' ? clientToMapWorld : clientToWorld;
  const { mx, my } = pickFn(clientX, clientY);
  const { col, row } = pickTileAtWorld(mx, my);
  return { col, row, hit: inBounds(col, row), mx, my, clientX, clientY };
}

function tileSortKey(col, row){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : 0;
  const maxL = typeof terrainBlockMaxLevel === 'function' ? terrainBlockMaxLevel() : 4;
  return (col + row) * (maxL + 1) + Math.max(0, level);
}
