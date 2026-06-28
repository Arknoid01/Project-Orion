/* ===================== ETAT DE LA CARTE ===================== */
let grid = []; // grid[row][col] = { terrain, building, hasRoad, elevation, ... }

function initGrid(){
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
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
  return {
    terrain: terrain || 'grass',
    building: null,
    hasRoad: false,
    houseLevel: 0,
    population: 0,
    patrolBlock: false,
    beauty: 0,
    elevation: elevation || 0,
    slope: 0,
  };
}

/* ===================== ORDRE DE DESSIN (cache) ===================== */
let mapDrawOrder = null;

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

/* ===================== MATHS ISOMETRIQUES ===================== */
function tileCenter(col, row){
  const elev = inBounds(col, row) ? (grid[row][col].elevation || 0) : 0;
  const elevOffset = elev * ELEVATION_PIXELS;
  return {
    x: OFFSET_X + (col - row) * (TILE_W / 2),
    y: OFFSET_Y + (col + row) * (TILE_H / 2) - elevOffset,
  };
}

function screenToTile(mx, my){
  const lx = mx - OFFSET_X;
  const ly = my - OFFSET_Y;
  const col = Math.round(lx / TILE_W + ly / TILE_H);
  const row = Math.round(ly / TILE_H - lx / TILE_W);
  return { col, row };
}

// Case dont le centre (avec relief) est la plus proche du point monde cliqué —
// corrige l'imprécision du clic au zoom et sur terrain en pente.
function pickTileAtWorld(mx, my){
  const approx = screenToTile(mx, my);
  let bestCol = approx.col;
  let bestRow = approx.row;
  let bestDist = Infinity;
  for (let dr = -3; dr <= 3; dr++){
    for (let dc = -3; dc <= 3; dc++){
      const c = approx.col + dc;
      const r = approx.row + dr;
      if (!inBounds(c, r)) continue;
      const { x, y } = tileCenter(c, r);
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

function inBounds(col, row){
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

function tileSortKey(col, row){
  const elev = inBounds(col, row) ? (grid[row][col].elevation || 0) : 0;
  return col + row + elev * 3.5;
}
