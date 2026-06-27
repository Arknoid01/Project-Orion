/* ===================== AGENTS DE MIGRATION (VISUEL) ===================== */
// Colons qui arrivent par la route (immigration) ou partent vers la sortie (émigration).
// La logique probabiliste reste dans houses.js / migration.js ; ici on ne fait que
// retarder l'application du changement de niveau le temps du trajet visible.

let migrants = []; // { type:'in'|'out', col, row, prevCol, prevRow, path, pathIndex, houseCol, houseRow, moveCooldown }

function resetMigrants(){ migrants = []; }

function findEdgeRoadTiles(){
  const tiles = [];
  for (let c = 0; c < GRID_COLS; c++){
    if (grid[0][c].hasRoad) tiles.push({ col: c, row: 0 });
    if (grid[GRID_ROWS - 1][c].hasRoad) tiles.push({ col: c, row: GRID_ROWS - 1 });
  }
  for (let r = 0; r < GRID_ROWS; r++){
    if (grid[r][0].hasRoad) tiles.push({ col: 0, row: r });
    if (grid[r][GRID_COLS - 1].hasRoad) tiles.push({ col: GRID_COLS - 1, row: r });
  }
  return tiles;
}

function roadNeighbors(col, row, goalCol, goalRow){
  return [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]
    .filter(([c, r]) => {
      if (!inBounds(c, r)) return false;
      if (c === goalCol && r === goalRow) return true;
      return grid[r][c].hasRoad;
    })
    .map(([c, r]) => ({ col: c, row: r }));
}

function findRoadPath(start, goal){
  if (start.col === goal.col && start.row === goal.row) return [];
  const startKey = start.col + ',' + start.row;
  const goalKey = goal.col + ',' + goal.row;
  const queue = [start];
  const cameFrom = { [startKey]: null };
  let head = 0;
  while (head < queue.length){
    const cur = queue[head++];
    const curKey = cur.col + ',' + cur.row;
    if (curKey === goalKey) break;
    for (const n of roadNeighbors(cur.col, cur.row, goal.col, goal.row)){
      const k = n.col + ',' + n.row;
      if (cameFrom[k] === undefined){
        cameFrom[k] = curKey;
        queue.push(n);
      }
    }
  }
  if (cameFrom[goalKey] === undefined) return [];
  const path = [];
  let k = goalKey;
  while (k && k !== startKey){
    const [c, r] = k.split(',').map(Number);
    path.unshift({ col: c, row: r });
    k = cameFrom[k];
  }
  return path;
}

function nearestRoadAdjacentToHouse(houseCol, houseRow){
  const neighbors = [[houseCol - 1, houseRow], [houseCol + 1, houseRow], [houseCol, houseRow - 1], [houseCol, houseRow + 1]]
    .filter(([c, r]) => inBounds(c, r) && grid[r][c].hasRoad)
    .map(([c, r]) => ({ col: c, row: r }));
  if (neighbors.length === 0) return null;
  return neighbors[0];
}

function pickNearestEdgeRoad(fromCol, fromRow){
  const edges = findEdgeRoadTiles();
  if (edges.length === 0) return null;
  let best = edges[0], bestLen = Infinity;
  for (const e of edges){
    const path = findRoadPath(e, { col: fromCol, row: fromRow });
    const len = path.length;
    if (len < bestLen){ bestLen = len; best = e; }
  }
  return best;
}

function applyHouseGrowth(col, row){
  const cell = grid[row][col];
  cell.houseLevel++;
  cell.population = HOUSE_LEVELS[cell.houseLevel].population;
  debugInfo(`Maison évoluée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
}

function applyHouseEmigration(col, row){
  const cell = grid[row][col];
  cell.houseLevel--;
  cell.population = HOUSE_LEVELS[cell.houseLevel].population;
  debugWarn(`Émigration : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
}

function queueImmigration(houseCol, houseRow){
  const roadTile = nearestRoadAdjacentToHouse(houseCol, houseRow);
  if (!roadTile) return false;
  const entry = pickNearestEdgeRoad(roadTile.col, roadTile.row);
  if (!entry) return false;
  const path = findRoadPath(entry, roadTile);
  if (path.length === 0 && (entry.col !== roadTile.col || entry.row !== roadTile.row)) return false;

  migrants.push({
    type: 'in',
    col: entry.col, row: entry.row,
    prevCol: entry.col, prevRow: entry.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    moveCooldown: MIGRANT_MOVE_EVERY_TICKS,
  });
  showNotification(t('migration.arrival'), 'good');
  return true;
}

function queueEmigration(houseCol, houseRow){
  const roadTile = nearestRoadAdjacentToHouse(houseCol, houseRow);
  if (!roadTile) return false;
  const exit = pickNearestEdgeRoad(roadTile.col, roadTile.row);
  if (!exit) return false;
  const path = findRoadPath(roadTile, exit);
  if (path.length === 0 && (roadTile.col !== exit.col || roadTile.row !== exit.row)) return false;

  applyHouseEmigration(houseCol, houseRow);

  migrants.push({
    type: 'out',
    col: roadTile.col, row: roadTile.row,
    prevCol: roadTile.col, prevRow: roadTile.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    moveCooldown: MIGRANT_MOVE_EVERY_TICKS,
  });
  showNotification(t('migration.departure'), 'bad');
  return true;
}

function tickMigrants(){
  for (let i = migrants.length - 1; i >= 0; i--){
    const m = migrants[i];
    m.prevCol = m.col; m.prevRow = m.row;
    m.moveCooldown--;
    if (m.moveCooldown > 0) continue;
    m.moveCooldown = MIGRANT_MOVE_EVERY_TICKS;

    if (m.pathIndex >= m.path.length){
      if (m.type === 'in'){
        applyHouseGrowth(m.houseCol, m.houseRow);
      }
      migrants.splice(i, 1);
      continue;
    }

    const next = m.path[m.pathIndex];
    m.col = next.col;
    m.row = next.row;
    m.pathIndex++;
  }
}

function getMigrantsScreenPos(agent, now){
  return getCreatureScreenPos(agent, now);
}
