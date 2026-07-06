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
  migrants.push(agent);
}

function getMigrantMoveInterval(){
  const every = typeof MIGRANT_MOVE_EVERY_TICKS !== 'undefined' ? MIGRANT_MOVE_EVERY_TICKS : 1;
  return every;
}

function finishMigrant(m){
  if (m.type === 'in'){
    if (m.reason === 'placement') applyHouseSettlement(m.houseCol, m.houseRow);
    else applyHouseGrowth(m.houseCol, m.houseRow);
  } else if (m.destroyOnComplete){
    destroyHouseAt(m.houseCol, m.houseRow);
  }
}

function getMigrantStepDurationMs(){
  const tickMs = typeof TICK_DURATION_MS !== 'undefined' ? TICK_DURATION_MS : 1000;
  const every = getMigrantMoveInterval();
  const mult = typeof MIGRANT_SPEED_MULTIPLIER !== 'undefined' ? MIGRANT_SPEED_MULTIPLIER : 1;
  return (tickMs * every) / mult;
}

function isMigrantMoving(agent, now){
  if (agent.prevCol === agent.col && agent.prevRow === agent.row) return false;
  now = now || performance.now();
  return getMigrantMoveProgress(agent, now) < 1;
}

function getMigrantMoveProgress(agent, now){
  if (agent.prevCol === agent.col && agent.prevRow === agent.row) return 1;
  const stepMs = getMigrantStepDurationMs();
  const start = Number.isFinite(agent.moveStartTime)
    ? agent.moveStartTime
    : (typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : now);
  return Math.min(1, Math.max(0, (now - start) / stepMs));
}

function advanceMigrantStep(m, now){
  if (m.pathIndex >= m.path.length) return false;
  m.prevCol = m.col;
  m.prevRow = m.row;
  const next = m.path[m.pathIndex];
  m.col = next.col;
  m.row = next.row;
  m.pathIndex++;
  m.moveStartTime = now || performance.now();
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
    moveStartTime: null,
    facing: 'down', mirrorX: false,
  };
  if (path.length && typeof applyIsoFacingFromDelta === 'function'){
    applyIsoFacingFromDelta(agent, path[0].col - entry.col, path[0].row - entry.row);
  }
  pushMigrant(agent);
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();

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
    destroyOnComplete: !!opts.destroyOnComplete,
    moveStartTime: null,
    facing: 'down', mirrorX: false,
  };
  if (path.length && typeof applyIsoFacingFromDelta === 'function'){
    applyIsoFacingFromDelta(agent, path[0].col - start.col, path[0].row - start.row);
  }
  pushMigrant(agent);
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();

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

function tickMigrants(now){
  if (typeof isGamePaused === 'function' && isGamePaused()) return;
  if (!migrants.length) return;
  now = now || performance.now();
  const stepMs = getMigrantStepDurationMs();
  let dirty = false;

  for (let i = migrants.length - 1; i >= 0; i--){
    const m = migrants[i];

    if (m.pathIndex >= m.path.length){
      finishMigrant(m);
      migrants.splice(i, 1);
      dirty = true;
      continue;
    }

    const walking = m.prevCol !== m.col || m.prevRow !== m.row;

    if (!walking){
      advanceMigrantStep(m, now);
      dirty = true;
      continue;
    }

    if (!Number.isFinite(m.moveStartTime)) m.moveStartTime = now;
    if ((now - m.moveStartTime) >= stepMs){
      advanceMigrantStep(m, now);
      dirty = true;
    }
  }

  if (dirty || migrants.length){
    if (typeof markRenderDirty === 'function') markRenderDirty();
    if (typeof markOverlayDirty === 'function') markOverlayDirty();
  }
}

function getMigrantsScreenPos(agent, now){
  now = now || performance.now();
  const k = getMigrantMoveProgress(agent, now);
  if (typeof getMigrantWorld3ScreenPos === 'function'
      && typeof isThreeReady === 'function' && isThreeReady()){
    const s3 = getMigrantWorld3ScreenPos(agent, now, k);
    if (s3) return s3;
  }
  const fromPos = tileDiamondCenter(agent.prevCol, agent.prevRow);
  const toPos = tileDiamondCenter(agent.col, agent.row);
  return {
    x: fromPos.x + (toPos.x - fromPos.x) * k,
    y: fromPos.y + (toPos.y - fromPos.y) * k,
  };
}

/** Position écran migrant via projection Three (overlay Pixi). */
function getMigrantWorld3ScreenPos(agent, now, kOverride){
  if (typeof worldToScreen !== 'function' || !window._threeGridOffset) return null;
  now = now || performance.now();
  const k = typeof kOverride === 'number' ? kOverride : getMigrantMoveProgress(agent, now);
  const col = agent.prevCol + (agent.col - agent.prevCol) * k;
  const row = agent.prevRow + (agent.row - agent.prevRow) * k;
  const yFrom = window.getTerrainSurfaceY(agent.prevCol, agent.prevRow);
  const yTo = window.getTerrainSurfaceY(agent.col, agent.row);
  const footLift = 0.04;
  const { offC, offR } = window._threeGridOffset;
  return worldToScreen(
    col - offC + 0.5,
    yFrom + (yTo - yFrom) * k + footLift,
    row - offR + 0.5,
  );
}
window.getMigrantWorld3ScreenPos = getMigrantWorld3ScreenPos;
window.getMigrantsScreenPos = getMigrantsScreenPos;
window.getMigrantMoveProgress = getMigrantMoveProgress;
window.isMigrantMoving = isMigrantMoving;
window.tickMigrants = tickMigrants;
