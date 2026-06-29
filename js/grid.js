/* ===================== ETAT DE LA CARTE ===================== */
let grid = []; // grid[row][col] = { terrain, building, hasRoad, elevation, ... }

function initGrid(){
  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  else if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  if (typeof generateProceduralMap === 'function'){
    generateProceduralMap();
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
  return dx + dy <= 1.02;
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

function tileSortKey(col, row){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : 0;
  const maxL = typeof terrainBlockMaxLevel === 'function' ? terrainBlockMaxLevel() : 4;
  return (col + row) * (maxL + 1) + Math.max(0, level);
}
