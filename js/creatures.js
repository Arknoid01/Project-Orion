/* ===================== MONSTRES & HEROS ===================== */
// Contrairement aux walkers (trajet figé sur les routes), monstre et héros se
// déplacent LIBREMENT sur la grille, case par case. Le héros poursuit une cible
// MOBILE (le monstre) : son chemin est donc recalculé à chaque pas via un BFS sur
// les cases praticables (tout sauf l'eau). C'est la première mécanique du jeu qui
// demande un vrai pathfinding point-à-point.
let monster = null; // { typeKey, icon, col, row, prevCol, prevRow, hp, moveCooldown }
let hero = null;    // { col, row, prevCol, prevRow, moveCooldown, leaving, exit }

function resetCreatures(){ monster = null; hero = null; }

/* ===================== PRATICABILITE & PATHFINDING ===================== */
function isWalkable(col, row){
  return inBounds(col, row) && grid[row][col].terrain !== 'water';
}

function walkableNeighbors(col, row){
  return [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]
    .filter(([c, r]) => isWalkable(c, r))
    .map(([c, r]) => ({ col: c, row: r }));
}

// BFS de start vers goal. Renvoie la liste des cases du chemin SANS le départ
// (donc path[0] = première case où avancer), ou [] si la cible est inatteignable
// ou déjà atteinte. Grille 20x20 : largement assez rapide pour un recalcul/tick.
function findPath(start, goal){
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
    for (const n of walkableNeighbors(cur.col, cur.row)){
      const k = n.col + ',' + n.row;
      if (cameFrom[k] === undefined){
        cameFrom[k] = curKey;
        queue.push(n);
      }
    }
  }
  if (cameFrom[goalKey] === undefined) return []; // inatteignable
  const path = [];
  let k = goalKey;
  while (k && k !== startKey){
    const [c, r] = k.split(',').map(Number);
    path.unshift({ col: c, row: r });
    k = cameFrom[k];
  }
  return path;
}

function isAdjacentOrSame(a, b){
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) <= 1;
}

/* ===================== MONSTRE ===================== */
function randomWalkableTile(){
  for (let tries = 0; tries < 200; tries++){
    const col = Math.floor(Math.random() * GRID_COLS);
    const row = Math.floor(Math.random() * GRID_ROWS);
    if (isWalkable(col, row)) return { col, row };
  }
  return { col: 0, row: 0 };
}

function spawnMonster(){
  const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];
  const tile = randomWalkableTile();
  monster = {
    typeKey: type.key, icon: type.icon,
    col: tile.col, row: tile.row, prevCol: tile.col, prevRow: tile.row,
    hp: MONSTER_HP, moveCooldown: MONSTER_MOVE_EVERY_TICKS,
  };
  showNotification(t('monster.appeared', { monster: t('monster.name.' + type.key) }), 'bad');
  debugInfo('Monstre apparu', { type: type.key, col: tile.col, row: tile.row });
  renderCreaturePanel();
}

function monsterAttack(){
  const around = [[monster.col, monster.row], [monster.col - 1, monster.row], [monster.col + 1, monster.row], [monster.col, monster.row - 1], [monster.col, monster.row + 1]];
  const targets = around.filter(([c, r]) => inBounds(c, r) && grid[r][c].building);
  if (targets.length === 0) return;
  const [c, r] = targets[Math.floor(Math.random() * targets.length)];
  const cell = grid[r][c];
  const name = t(BUILDING_DEFS[cell.building].name);

  // Sur une maison : 50% "mettre le feu" (perte d'un niveau, destruction si déjà cabane).
  if (cell.building === 'maison' && Math.random() < 0.5){
    if (cell.houseLevel > 0){
      cell.houseLevel--;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      showNotification(t('monster.fire', { building: name }), 'bad');
    } else {
      cell.building = null; cell.houseLevel = 0; cell.population = 0;
      showNotification(t('monster.fireDestroyed'), 'bad');
    }
  } else {
    cell.building = null; cell.houseLevel = 0; cell.population = 0;
    showNotification(t('monster.destroyed', { building: name }), 'bad');
  }

  recomputeAllWalkers();
  recomputeBeauty();
  if (typeof recomputeLabor === 'function') recomputeLabor();
  updateResourceBar();
}

function tickMonster(){
  if (!monster) return;
  monster.prevCol = monster.col; monster.prevRow = monster.row;
  monster.moveCooldown--;
  if (monster.moveCooldown > 0) return;
  monster.moveCooldown = MONSTER_MOVE_EVERY_TICKS;

  const neighbors = walkableNeighbors(monster.col, monster.row);
  if (neighbors.length){
    const n = neighbors[Math.floor(Math.random() * neighbors.length)];
    monster.col = n.col; monster.row = n.row;
  }
  if (Math.random() < MONSTER_ATTACK_CHANCE) monsterAttack();
}

/* ===================== HEROS ===================== */
function countHeroTemples(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isHeroTemple) n++; });
  return n;
}

function findHeroTempleTile(){
  let found = null;
  forEachBuilding((type, col, row) => { if (BUILDING_DEFS[type].isHeroTemple && !found) found = { col, row }; });
  return found;
}

function hasSummonResources(){
  return Object.entries(HERO_SUMMON_COST).every(([res, amt]) => (resources[res] || 0) >= amt);
}

function canSummonHero(){
  return !!monster && !hero && countHeroTemples() > 0 && hasSummonResources();
}

function summonHero(){
  if (!canSummonHero()){
    showNotification(t('hero.cantSummon'), 'bad');
    return;
  }
  for (const [res, amt] of Object.entries(HERO_SUMMON_COST)) resources[res] -= amt;
  const tile = findHeroTempleTile() || randomWalkableTile();
  hero = { col: tile.col, row: tile.row, prevCol: tile.col, prevRow: tile.row, moveCooldown: HERO_MOVE_EVERY_TICKS, leaving: false, exit: null };
  showNotification(t('hero.summoned'), 'good');
  debugInfo('Héros invoqué', tile);
  updateResourceBar();
  renderCreaturePanel();
}

function nearestEdgeTile(col, row){
  const options = [{ col: 0, row }, { col: GRID_COLS - 1, row }, { col, row: 0 }, { col, row: GRID_ROWS - 1 }];
  let best = options[0], bestD = Infinity;
  for (const o of options){
    if (!isWalkable(o.col, o.row)) continue;
    const d = Math.abs(o.col - col) + Math.abs(o.row - row);
    if (d < bestD){ bestD = d; best = o; }
  }
  return best;
}

function tickHero(){
  if (!hero) return;
  hero.prevCol = hero.col; hero.prevRow = hero.row;

  // Phase de retraite : le monstre est mort, le héros rejoint un bord puis disparaît.
  if (hero.leaving){
    if (!hero.exit) hero.exit = nearestEdgeTile(hero.col, hero.row);
    if (hero.col === hero.exit.col && hero.row === hero.exit.row){
      hero = null;
      showNotification(t('hero.left'), 'good');
      renderCreaturePanel();
      return;
    }
    stepHeroToward(hero.exit);
    return;
  }

  if (!monster){ hero.leaving = true; return; }

  // Au contact : combat. Sinon, on recalcule le chemin vers la cible MOBILE.
  if (isAdjacentOrSame(hero, monster)){
    monster.hp -= HERO_DAMAGE;
    if (monster.hp <= 0){
      const name = t('monster.name.' + monster.typeKey);
      monster = null;
      hero.leaving = true;
      showNotification(t('hero.victory', { monster: name }), 'good');
      debugInfo('Monstre vaincu par le héros');
      renderCreaturePanel();
    }
    return;
  }

  hero.moveCooldown--;
  if (hero.moveCooldown > 0) return;
  hero.moveCooldown = HERO_MOVE_EVERY_TICKS;
  stepHeroToward(monster);
}

function stepHeroToward(goal){
  const path = findPath({ col: hero.col, row: hero.row }, goal);
  if (path.length){ hero.col = path[0].col; hero.row = path[0].row; }
}

/* ===================== TICK GLOBAL ===================== */
function tickCreatures(){
  if (!monster && Math.random() < MONSTER_SPAWN_CHANCE
      && getCalendarState().day >= MONSTER_MIN_DAY
      && computeTotalPopulation() > 0){
    spawnMonster();
  }
  tickMonster();
  tickHero();
}

/* ===================== POSITION ECRAN INTERPOLEE ===================== */
function getCreatureScreenPos(agent, now){
  const fromPos = tileCenter(agent.prevCol, agent.prevRow);
  const toPos = tileCenter(agent.col, agent.row);
  const elapsed = now - lastTickTimestamp;
  const k = Math.min(1, Math.max(0, elapsed / TICK_DURATION_MS));
  return { x: fromPos.x + (toPos.x - fromPos.x) * k, y: fromPos.y + (toPos.y - fromPos.y) * k };
}

/* ===================== PANNEAU ===================== */
function summonCostLabel(){
  return Object.entries(HERO_SUMMON_COST).map(([res, amt]) => `${amt} ${t('resource.' + res)}`).join(', ');
}

function renderCreaturePanel(){
  const el = document.getElementById('creatureList');
  if (!el) return;
  let html = '';

  if (monster){
    const name = t('monster.name.' + monster.typeKey);
    html += `<p class="creatureThreat">${monster.icon} ${t('monster.threat', { monster: name })}</p>`;
    const pct = Math.max(0, (monster.hp / MONSTER_HP) * 100);
    html += `<div class="monsterBar"><div class="monsterBarFill" style="width:${pct}%"></div></div>`;
  } else {
    html += `<p class="creatureCalm">${t('creature.noMonster')}</p>`;
  }

  if (hero) html += `<p class="creatureHero">🦸 ${t('hero.active')}</p>`;

  if (countHeroTemples() === 0){
    html += `<p class="placeholder">${t('hero.noTemple')}</p>`;
  } else {
    const can = canSummonHero();
    html += `<button class="buildBtn ${can ? '' : 'unaffordable'}" ${can ? '' : 'disabled'} onclick="summonHero()">${t('hero.summon')}</button>`;
    html += `<p class="creatureCost">${t('hero.cost')} : ${summonCostLabel()}</p>`;
  }

  el.innerHTML = html;
}
