/* ===================== ESCALIERS DE ROUTE (dénivelé montagne) ===================== */
// Permet de relier deux cases de route voisines dont le niveau diffère de 1
// (ex. plaine → col rocheuse). Pose possible sur roche / marbre interdit aux routes plates.

function stairCellLevel(col, row){
  return typeof cellLevel === 'function' ? cellLevel(col, row) : (grid[row][col].level || 1);
}

function isStairTerrain(terrain){
  return terrain !== 'water';
}

/** Voisin route avec |Δ niveau| === 1 — requis pour poser ou convertir un escalier. */
function hasStairRoadNeighbor(col, row){
  const lv = stairCellLevel(col, row);
  const dirs = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    if (!inBounds(c, r)) continue;
    const n = grid[r][c];
    if (!n || !n.hasRoad) continue;
    if (Math.abs(stairCellLevel(c, r) - lv) === 1) return true;
  }
  return false;
}

function canPlaceStairsTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart) return false;
  if (!isStairTerrain(cell.terrain)) return false;
  if (cell.roadStairs) return false;
  if (cell.hasRoad && !cell.roadStairs) return hasStairRoadNeighbor(col, row);
  if (cell.hasRoad) return false;
  return hasStairRoadNeighbor(col, row);
}

function canPlaceStairs(col, row){
  if (!canPlaceStairsTerrain(col, row)) return false;
  const cost = typeof STAIR_COST === 'number' ? STAIR_COST : 8;
  return typeof canAfford === 'function' ? canAfford(cost) : true;
}

function placeStairs(col, row){
  const cell = grid[row][col];
  cell.hasRoad = true;
  cell.roadStairs = true;
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
}

/** Deux cases adjacentes sont connectées pour la patrouille des walkers. */
function roadTileConnects(colA, rowA, colB, rowB){
  if (!inBounds(colA, rowA) || !inBounds(colB, rowB)) return false;
  const a = grid[rowA][colA];
  const b = grid[rowB][colB];
  if (a.patrolBlock || b.patrolBlock) return false;

  const lvA = stairCellLevel(colA, rowA);
  const lvB = stairCellLevel(colB, rowB);
  const diff = Math.abs(lvA - lvB);

  // Bâtiment de service → route voisine (case sans route vers case route).
  if (!a.hasRoad || !b.hasRoad){
    const roadCol = a.hasRoad ? colA : colB;
    const roadRow = a.hasRoad ? rowA : rowB;
    const roadCell = a.hasRoad ? a : b;
    if (!roadCell.hasRoad) return false;
    const lvR = a.hasRoad ? lvA : lvB;
    const lvO = a.hasRoad ? lvB : lvA;
    const d = Math.abs(lvR - lvO);
    if (d === 0) return true;
    if (d === 1 && roadCell.roadStairs) return true;
    return false;
  }

  if (diff === 0) return true;
  if (diff !== 1) return false;
  return !!(a.roadStairs || b.roadStairs);
}

/** Direction visuelle : vers le voisin plus bas (montée depuis cette direction). */
function stairVisualDir(col, row){
  const lv = stairCellLevel(col, row);
  const dirs = [
    [col, row - 1, 'n'],
    [col + 1, row, 'e'],
    [col, row + 1, 's'],
    [col - 1, row, 'w'],
  ];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    const d = dirs[i][2];
    if (!inBounds(c, r)) continue;
    const n = grid[r][c];
    if (!n || !n.hasRoad) continue;
    if (stairCellLevel(c, r) < lv) return d;
  }
  for (let j = 0; j < dirs.length; j++){
    const c2 = dirs[j][0];
    const r2 = dirs[j][1];
    const d2 = dirs[j][2];
    if (!inBounds(c2, r2)) continue;
    const n2 = grid[r2][c2];
    if (!n2 || !n2.hasRoad) continue;
    if (stairCellLevel(c2, r2) > lv) return d2;
  }
  return 's';
}

function drawStairsOverlay(cx, cy, col, row){
  if (typeof ctx === 'undefined' || !ctx) return;
  const dir = stairVisualDir(col, row);
  const steps = 4;
  const pad = TILE_W * 0.08;
  ctx.save();
  ctx.strokeStyle = 'rgba(45,38,32,0.55)';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(180,165,140,0.85)';

  for (let i = 0; i < steps; i++){
    const t = (i + 1) / (steps + 1);
    let x0, y0, x1, y1, x2, y2, x3, y3;
    if (dir === 'n'){
      const y = cy - TILE_H * 0.35 * t;
      const w = TILE_W * (0.15 + t * 0.25);
      x0 = cx - w; y0 = y; x1 = cx + w; y1 = y;
      x2 = cx + w * 0.85; y2 = y + 3; x3 = cx - w * 0.85; y3 = y + 3;
    } else if (dir === 's'){
      const y = cy + TILE_H * 0.35 * t;
      const w = TILE_W * (0.15 + t * 0.25);
      x0 = cx - w; y0 = y; x1 = cx + w; y1 = y;
      x2 = cx + w * 0.85; y2 = y - 3; x3 = cx - w * 0.85; y3 = y - 3;
    } else if (dir === 'e'){
      const x = cx + TILE_W * 0.35 * t;
      const h = TILE_H * (0.12 + t * 0.22);
      x0 = x; y0 = cy - h; x1 = x; y1 = cy + h;
      x2 = x - 3; y2 = cy + h * 0.85; x3 = x - 3; y3 = cy - h * 0.85;
    } else {
      const x = cx - TILE_W * 0.35 * t;
      const h = TILE_H * (0.12 + t * 0.22);
      x0 = x; y0 = cy - h; x1 = x; y1 = cy + h;
      x2 = x + 3; y2 = cy + h * 0.85; x3 = x + 3; y3 = cy - h * 0.85;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(214,175,70,0.9)';
  ctx.font = '11px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🪜', cx, cy + TILE_H * 0.05);
  ctx.restore();
}
