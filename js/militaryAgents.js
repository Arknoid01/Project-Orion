/* ===================== TROUPES VISUELLES (DÉPART / RETOUR) ===================== */
// 1 PNJ par tranche de TROOPS_NPCS_PER_POWER points. Phase « outbound » : marche vers
// le champ de bataille ; phase « return » : revient ; le résultat du combat ne se
// déclenche que lorsque le dernier PNJ concerné a terminé son retour.

let militaryCampaign = null;
// { kind:'attack'|'invasion', phase:'outbound'|'return', city, cityName, cityId,
//   points, enemyPower, defensePoints, soldiers[], target, entry, barracks }

function resetMilitaryAgents(){ militaryCampaign = null; }

function isMilitaryBusy(){ return militaryCampaign !== null; }

function troopsNpcCount(power){
  return Math.max(1, Math.ceil((power || 0) / TROOPS_NPCS_PER_POWER));
}

function getMilitaryEntry(){
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

function walkableTileAt(col, row){
  if (isWalkable(col, row)) return { col, row };
  for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
    if (inBounds(c, r) && isWalkable(c, r)) return { col: c, row: r };
  }
  return null;
}

function findBarracksTile(){
  let tile = null;
  forEachBuilding((type, col, row) => {
    if (BUILDING_DEFS[type].isBarracks && !tile) tile = { col, row };
  });
  return tile;
}

function findBattleTarget(){
  if (typeof findInvasionTarget === 'function') return findInvasionTarget();
  const barracks = findBarracksTile();
  if (barracks) return barracks;
  return { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) };
}

function buildSoldierPath(from, to){
  if (!from || !to) return null;
  const path = findPath(from, to);
  if (path.length === 0 && (from.col !== to.col || from.row !== to.row)) return null;
  return path;
}

function spawnSoldier(side, from, to, stagger){
  const path = buildSoldierPath(from, to);
  if (!path && (from.col !== to.col || from.row !== to.row)) return null;
  return {
    side,
    col: from.col, row: from.row,
    prevCol: from.col, prevRow: from.row,
    path: path || [],
    pathIndex: 0,
    moveCooldown: TROOPS_MOVE_EVERY_TICKS + (stagger || 0),
    legComplete: false,
  };
}

function spawnSoldierGroup(side, from, to, power){
  const soldiers = [];
  const count = troopsNpcCount(power);
  for (let i = 0; i < count; i++){
    const s = spawnSoldier(side, from, to, i * 2);
    if (s) soldiers.push(s);
  }
  return soldiers;
}

function beginAttackCampaign(city){
  if (militaryCampaign) return false;
  const points = getMilitaryPoints();
  const barracks = findBarracksTile();
  if (!barracks) return false;
  const entry = getMilitaryEntry();
  const rally = walkableTileAt(barracks.col, barracks.row);
  if (!rally) return false;

  const soldiers = spawnSoldierGroup('friendly', rally, entry, points);
  if (soldiers.length === 0) return false;

  militaryCampaign = {
    kind: 'attack',
    phase: 'outbound',
    city,
    cityName: city.name,
    points,
    enemyPower: cityPower(city),
    soldiers,
    target: rally,
    entry,
    barracks: rally,
  };
  showNotification(t('army.departing', { city: city.name, n: soldiers.length }), 'info');
  debugInfo('Campagne d\'attaque lancée', { city: city.name, soldiers: soldiers.length, points });
  return true;
}

function beginInvasionCampaign(city){
  if (militaryCampaign) return false;
  const targetPos = findBattleTarget();
  const target = walkableTileAt(targetPos.col, targetPos.row);
  if (!target) return false;
  const entry = getMilitaryEntry();
  const enemyPower = cityPower(city);
  const defense = getMilitaryPoints();
  const barracks = findBarracksTile();
  const rally = barracks ? walkableTileAt(barracks.col, barracks.row) : null;

  const soldiers = spawnSoldierGroup('enemy', entry, target, enemyPower);
  if (rally) soldiers.push(...spawnSoldierGroup('friendly', rally, target, defense));
  if (soldiers.length === 0) return false;

  militaryCampaign = {
    kind: 'invasion',
    phase: 'outbound',
    city,
    cityId: city.id,
    cityName: city.name,
    enemyPower,
    defensePoints: defense,
    soldiers,
    target,
    entry,
    barracks: rally,
  };
  showNotification(t('invasion.approaching', { city: city.name }), 'bad');
  debugInfo('Invasion lancée', { city: city.name, soldiers: soldiers.length, enemyPower });
  return true;
}

function startCampaignReturn(campaign){
  campaign.phase = 'return';
  campaign.soldiers.forEach((s, i) => {
    let from, dest;
    if (campaign.kind === 'attack'){
      from = campaign.entry;
      dest = campaign.barracks;
    } else {
      from = campaign.target;
      dest = s.side === 'enemy' ? campaign.entry : (campaign.barracks || campaign.target);
    }
    const path = buildSoldierPath(from, dest) || [];
    s.col = from.col;
    s.row = from.row;
    s.prevCol = from.col;
    s.prevRow = from.row;
    s.path = path;
    s.pathIndex = 0;
    s.moveCooldown = TROOPS_MOVE_EVERY_TICKS + i * 2;
    s.legComplete = path.length === 0;
  });
  if (campaign.kind === 'attack'){
    showNotification(t('army.returning', { city: campaign.cityName }), 'info');
  }
}

function finishMilitaryCampaign(campaign){
  if (campaign.kind === 'attack'){
    resolveAttack(campaign.city);
  } else if (typeof resolveInvasionBattle === 'function'){
    resolveInvasionBattle(campaign.cityName, campaign.enemyPower, campaign.defensePoints);
  }
  militaryCampaign = null;
}

function tickMilitaryAgents(){
  if (!militaryCampaign) return;

  const campaign = militaryCampaign;
  for (const s of campaign.soldiers){
    if (s.legComplete) continue;
    s.prevCol = s.col;
    s.prevRow = s.row;
    s.moveCooldown--;
    if (s.moveCooldown > 0) continue;
    s.moveCooldown = TROOPS_MOVE_EVERY_TICKS;

    if (s.pathIndex >= s.path.length){
      s.legComplete = true;
      continue;
    }

    const next = s.path[s.pathIndex];
    s.col = next.col;
    s.row = next.row;
    s.pathIndex++;
  }

  if (campaign.soldiers.every(s => s.legComplete)){
    if (campaign.phase === 'outbound'){
      startCampaignReturn(campaign);
    } else {
      finishMilitaryCampaign(campaign);
    }
  }
}

function getMilitarySoldiers(){
  return militaryCampaign ? militaryCampaign.soldiers : [];
}

function getMilitarySoldierScreenPos(soldier, now){
  return getCreatureScreenPos(soldier, now);
}

function serializeMilitaryCampaign(){
  if (!militaryCampaign) return null;
  const c = militaryCampaign;
  return {
    kind: c.kind,
    phase: c.phase,
    cityId: c.city?.id ?? c.cityId,
    cityName: c.cityName,
    points: c.points,
    enemyPower: c.enemyPower,
    defensePoints: c.defensePoints,
    soldiers: c.soldiers,
    target: c.target,
    entry: c.entry,
    barracks: c.barracks,
  };
}

function restoreMilitaryCampaign(data){
  if (!data){
    militaryCampaign = null;
    return;
  }
  const city = (worldCities || []).find(c => c.id === data.cityId) || { id: data.cityId, name: data.cityName };
  militaryCampaign = Object.assign({}, data, { city });
}
