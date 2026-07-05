/* ===================== AGENTS DE MIGRATION (VISUEL) ===================== */
// Colons qui arrivent depuis un point fixe au bord de la carte (pose, montée de niveau)
// ou repartent vers ce même point (régression, destruction, émigration).
// Montée de niveau : appliquée à l'arrivée. Régression : appliquée au départ.
// Destruction : le bâtiment disparaît quand le colon a quitté la carte.

let migrants = []; // { type, reason, col, row, prevCol, prevRow, path, pathIndex, houseCol, houseRow, stepCredit, destroyOnComplete? }

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
  // Retire la dalle de sol Three.js (sinon la tuile reste après destruction).
  if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
  if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
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
  agent.stepCredit = 0;
  migrants.push(agent);
}

function getMigrantMoveInterval(){
  const every = typeof MIGRANT_MOVE_EVERY_TICKS !== 'undefined' ? MIGRANT_MOVE_EVERY_TICKS : 1;
  return every;
}

function getMigrantSpeedPerTick(){
  const mult = typeof MIGRANT_SPEED_MULTIPLIER !== 'undefined' ? MIGRANT_SPEED_MULTIPLIER : 1;
  return getMigrantMoveInterval() > 0 ? mult / getMigrantMoveInterval() : mult;
}

function getMigrantStepDurationMs(){
  const tickMs = typeof TICK_DURATION_MS !== 'undefined' ? TICK_DURATION_MS : 1000;
  const mult = typeof MIGRANT_SPEED_MULTIPLIER !== 'undefined' ? MIGRANT_SPEED_MULTIPLIER : 1;
  return tickMs / mult;
}

function isMigrantMoving(agent, now){
  if (agent.col === agent.prevCol && agent.row === agent.prevRow) return false;
  const ts = typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : 0;
  return (now - ts) < getMigrantStepDurationMs();
}

function advanceMigrantStep(m){
  if (m.pathIndex >= m.path.length){
    if (m.type === 'in'){
      if (m.reason === 'placement') applyHouseSettlement(m.houseCol, m.houseRow);
      else applyHouseGrowth(m.houseCol, m.houseRow);
    } else if (m.destroyOnComplete){
      destroyHouseAt(m.houseCol, m.houseRow);
    }
    return false;
  }
  m.prevCol = m.col;
  m.prevRow = m.row;
  const next = m.path[m.pathIndex];
  m.col = next.col;
  m.row = next.row;
  m.pathIndex++;
  if (typeof updateAgentFacing === 'function') updateAgentFacing(m);
  return true;
}

function queueMigrantIn(houseCol, houseRow, reason){
  const cell = grid[houseRow][houseCol];
  if (cell.building !== 'maison') return false;

  const entry = getFixedMigrantEntry();
  const goal = walkableGoalForHouse(houseCol, houseRow);
  if (!goal) return false;
  const path = findPath(entry, goal);
  if (path.length === 0 && (entry.col !== goal.col || entry.row !== goal.row)) return false;

  const agent = {
    type: 'in',
    reason: reason || 'growth',
    col: entry.col, row: entry.row,
    prevCol: entry.col, prevRow: entry.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    stepCredit: 0,
    facing: 'down', mirrorX: false,
  };
  if (path.length && typeof applyIsoFacingFromDelta === 'function'){
    applyIsoFacingFromDelta(agent, path[0].col - entry.col, path[0].row - entry.row);
  }
  pushMigrant(agent);

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

  const agent = {
    type: 'out',
    reason: opts.reason || (opts.destroyOnComplete ? 'destroy' : 'regress'),
    col: start.col, row: start.row,
    prevCol: start.col, prevRow: start.row,
    path, pathIndex: 0,
    houseCol, houseRow,
    stepCredit: 0,
    destroyOnComplete: !!opts.destroyOnComplete,
    facing: 'down', mirrorX: false,
  };
  if (path.length && typeof applyIsoFacingFromDelta === 'function'){
    applyIsoFacingFromDelta(agent, path[0].col - start.col, path[0].row - start.row);
  }
  pushMigrant(agent);

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

/** Destruction immédiate + colon partant (cosmétique) — comme la démolition manuelle. */
function destroyHouseWithDepartureVisual(houseCol, houseRow){
  const cell = grid[houseRow][houseCol];
  if (!cell || cell.building !== 'maison') return false;
  if (typeof queueMigrantOut === 'function'){
    queueMigrantOut(houseCol, houseRow, { destroyOnComplete: false, notify: false, reason: 'destroy' });
  }
  destroyHouseAt(houseCol, houseRow);
  return true;
}

function queueHouseDeparture(houseCol, houseRow, notify){
  const ok = destroyHouseWithDepartureVisual(houseCol, houseRow);
  if (ok && notify !== false) showNotification(t('migration.departure'), 'bad');
  return ok;
}

function tickMigrants(){
  const interval = getMigrantMoveInterval();
  const speedPerTick = getMigrantSpeedPerTick();
  for (let i = migrants.length - 1; i >= 0; i--){
    const m = migrants[i];
    m.stepCredit = (m.stepCredit || 0) + speedPerTick;

    while (m.stepCredit >= interval){
      m.stepCredit -= interval;
      if (m.pathIndex >= m.path.length){
        if (m.type === 'in'){
          if (m.reason === 'placement') applyHouseSettlement(m.houseCol, m.houseRow);
          else applyHouseGrowth(m.houseCol, m.houseRow);
        } else if (m.destroyOnComplete){
          destroyHouseAt(m.houseCol, m.houseRow);
        }
        migrants.splice(i, 1);
        break;
      }
      advanceMigrantStep(m);
    }
  }
}

function getMigrantsScreenPos(agent, now){
  const fromPos = tileDiamondCenter(agent.prevCol, agent.prevRow);
  const toPos = tileDiamondCenter(agent.col, agent.row);
  const elapsed = now - (typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : 0);
  const stepMs = getMigrantStepDurationMs();
  const k = Math.min(1, Math.max(0, elapsed / stepMs));
  return {
    x: fromPos.x + (toPos.x - fromPos.x) * k,
    y: fromPos.y + (toPos.y - fromPos.y) * k,
  };
}
