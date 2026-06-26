/* ===================== ETAT DE LA CARTE ===================== */
// hasRoad : pas encore utilisé (arrive avec le système de routes), prévu dès maintenant
// pour éviter de redécouper la structure de cellule plus tard.
let grid = []; // grid[row][col] = { terrain, building, hasRoad }

/* ===================== GENERATION DE LA CARTE ===================== */
function terrainAt(col, row){
  // coin mer en bas à droite
  if (row >= GRID_ROWS - 2 && col >= GRID_COLS - 4) return 'water';
  // champs de blé en haut à gauche
  if (row < 4 && col < 5) return 'wheat';
  // gisement de marbre en haut à droite
  if (row < 3 && col >= GRID_COLS - 4) return 'marble';
  return 'grass';
}

function initGrid(){
  grid = [];
  for (let row = 0; row < GRID_ROWS; row++){
    const line = [];
    for (let col = 0; col < GRID_COLS; col++){
      line.push({ terrain: terrainAt(col, row), building: null, hasRoad: false });
    }
    grid.push(line);
  }
}

/* ===================== MATHS ISOMETRIQUES ===================== */
function tileCenter(col, row){
  return {
    x: OFFSET_X + (col - row) * (TILE_W / 2),
    y: OFFSET_Y + (col + row) * (TILE_H / 2)
  };
}

function screenToTile(mx, my){
  const lx = mx - OFFSET_X;
  const ly = my - OFFSET_Y;
  const col = Math.round(lx / TILE_W + ly / TILE_H);
  const row = Math.round(ly / TILE_H - lx / TILE_W);
  return { col, row };
}

function inBounds(col, row){
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}
