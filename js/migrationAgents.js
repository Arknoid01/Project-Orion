/* ===================== AGENTS DE MIGRATION (VISUEL) ===================== */
// Colons qui arrivent depuis un point fixe au bord de la carte (pose, montée de niveau)
// ou repartent vers ce même point (régression, destruction, émigration).
// Montée de niveau : appliquée à l'arrivée. Régression : appliquée au départ.
// Destruction : le bâtiment disparaît quand le colon a quitté la carte.

let migrants = []; // { type, reason, col, row, prevCol, prevRow, path, pathIndex, houseCol, houseRow, moveCooldown, destroyOnComplete? }

function resetMigrants(){ migrants = []; }

function getFixedMigrantEntry(){
  if (typeof getMapWalkerEntry === 'function') return getMapWalkerEntry();
  const col = MIGRANT_ENTRY_COL;
  const row = MIGRANT_ENTRY_ROW;
  if (inBounds(col, row) && isWalkable(col, row)) return { col, row };
  for (let dc = 0; dc < GRID_COLS; dc++){
    for (const c of [col - dc, col + dc]){
      if (c < 0 || c >= GRID_COLS) continue;
      if (isWalkable(c, row)) return { col: c, row };
    }
  }
  return { col, row };
}

function walkableGoalForHouse(houseCol, houseRow){
  if (isWalkable(houseCol, houseRow)) return { col: houseCol, row: houseRow };
  for (const [c, r] of [[houseCol - 1, houseRow], [houseCol + 1, houseRow], [houseCol, houseRow - 1], [houseCol, houseRow + 1]]){
    if (inBounds(c, r) && isWalkable(c, r)) return { col: c, row: r };
  }
  return null;
}

function destroyHouseAt(col, row){
  const cell = grid[row][col];
  if (cell.building !== 'maison') return;
  cell.building = null;
  cell.houseLevel = 0;
  cell.population = 0;
  if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
  else if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  if (typeof recomputeAllWalkers === 'function') recomputeAllWalkers();
  if (typeof recomputeBeauty === 'function') recomputeBeauty();
}

function applyHouseGrowth(col, row){
  const cell = grid[row][col];
  if (cell.building !== 'maison') return;
  cell.houseLevel++;
  cell.population = HOUSE_LEVELS[cell.houseLevel].population;
  debugInfo(`Maison évoluée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
  if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
}

function applyHouseSettlement(col, row){
  const cell = grid[row][col];
  if (cell.building !== 'maison') return;
  cell.population = HOUSE_LEVELS[cell.houseLevel].population;
  debugInfo(`Colon installé : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
  if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
}

function applyHouseEmigration(col, row){
  const cell = grid[row][col];
  if (cell.building !== 'maison') return;
  cell.houseLevel--;
  cell.population = HOUSE_LEVELS[cell.houseLevel].population;
  debugWarn(`Maison dégradée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
  if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
}

function pushMigrant(agent){
  migrants.push(agent);
}

function queueMigrantIn(houseCol, houseRow, reason){
  const cell = grid[houseRow][houseCol];
  if (cell.building !== 'maison') return false;

  const entry = getFixedMigrantEntry();
  const goal = walkableGoalForHouse(houseCol, houseRow);
  if (!goal) return false;
  const path = findPath(entry, goal);
  if (path.length === 0 && (entry.col !== goal.col || entry.row !== goal.row)) return false;

  pushMigrant({
    type: 'in',
    reason: reason || 'growth',
    col: entry.col, row: entry.row,
    prevCol: entry.col, prevRow: entry.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    moveCooldown: MIGRANT_MOVE_EVERY_TICKS,
    facing: 'down', mirrorX: false,
  });

  const msgKey = reason === 'placement' ? 'migration.newHouse' : 'migration.arrival';
  showNotification(t(msgKey), 'good');
  return true;
}

function queueMigrantOut(houseCol, houseRow, opts){
  opts = opts || {};
  const cell = grid[houseRow][houseCol];
  if (cell.building !== 'maison') return false;

  const entry = getFixedMigrantEntry();
  const start = walkableGoalForHouse(houseCol, houseRow);
  if (!start) return false;
  const path = findPath(start, entry);
  if (path.length === 0 && (start.col !== entry.col || start.row !== entry.row)) return false;

  if (opts.applyRegress) applyHouseEmigration(houseCol, houseRow);

  pushMigrant({
    type: 'out',
    reason: opts.reason || (opts.destroyOnComplete ? 'destroy' : 'regress'),
    col: start.col, row: start.row,
    prevCol: start.col, prevRow: start.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    moveCooldown: MIGRANT_MOVE_EVERY_TICKS,
    destroyOnComplete: !!opts.destroyOnComplete,
    facing: 'down', mirrorX: false,
  });

  if (opts.notify !== false) showNotification(t('migration.departure'), 'bad');
  return true;
}

function queueImmigration(houseCol, houseRow){
  return queueMigrantIn(houseCol, houseRow, 'growth');
}

function queueHouseSettlement(houseCol, houseRow){
  return queueMigrantIn(houseCol, houseRow, 'placement');
}

function queueEmigration(houseCol, houseRow, notify){
  return queueMigrantOut(houseCol, houseRow, { applyRegress: true, notify: notify !== false, reason: 'regress' });
}

function queueHouseDeparture(houseCol, houseRow, notify){
  return queueMigrantOut(houseCol, houseRow, { destroyOnComplete: true, notify: notify !== false, reason: 'destroy' });
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
        if (m.reason === 'placement') applyHouseSettlement(m.houseCol, m.houseRow);
        else applyHouseGrowth(m.houseCol, m.houseRow);
      } else if (m.destroyOnComplete){
        destroyHouseAt(m.houseCol, m.houseRow);
      }
      migrants.splice(i, 1);
      continue;
    }

    const next = m.path[m.pathIndex];
    m.col = next.col;
    m.row = next.row;
    m.pathIndex++;
    if (typeof updateAgentFacing === 'function') updateAgentFacing(m);
  }
}

function getMigrantsScreenPos(agent, now){
  return getCreatureScreenPos(agent, now);
}
