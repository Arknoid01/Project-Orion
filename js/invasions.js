/* ===================== INVASIONS MILITAIRES (VISUEL) ===================== */
// Armée ennemie qui marche sur la grille jusqu'à la cité, puis résout un combat
// abstrait (military.js) à l'arrivée.

let invasion = null; // { cityName, icon, power, col, row, prevCol, prevRow, path, pathIndex, moveCooldown }

function resetInvasion(){ invasion = null; }

function findInvasionTarget(){
  let barracks = null;
  forEachBuilding((type, col, row) => {
    if (type === 'barracks' && !barracks) barracks = { col, row };
  });
  if (barracks) return barracks;

  let sumCol = 0, sumRow = 0, n = 0;
  forEachBuilding((type, col, row) => {
    if (type === 'maison'){ sumCol += col; sumRow += row; n++; }
  });
  if (n > 0) return { col: Math.round(sumCol / n), row: Math.round(sumRow / n) };
  return { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) };
}

function spawnInvasion(city){
  if (invasion) return;
  const target = findInvasionTarget();
  const entry = nearestEdgeTile(target.col, target.row);
  const path = findPath(entry, target);
  if (path.length === 0) return;

  invasion = {
    cityName: city.name,
    icon: '⚔️',
    power: cityPower(city),
    col: entry.col, row: entry.row,
    prevCol: entry.col, prevRow: entry.row,
    path, pathIndex: 0,
    moveCooldown: INVASION_MOVE_EVERY_TICKS,
    cityId: city.id,
  };
  showNotification(t('invasion.approaching', { city: city.name }), 'bad');
  debugInfo('Invasion lancée', { city: city.name, power: invasion.power });
}

function resolveInvasionArrival(){
  if (!invasion) return;
  ensureArmyState();
  const defense = getMilitaryPoints();
  const enemy = invasion.power;
  const cityName = invasion.cityName;

  if (defense > enemy){
    showNotification(t('invasion.repelled', { city: cityName }), 'good');
    showChoice({
      title: `🛡️ ${t('invasion.repelledTitle')}`,
      body: t('invasion.repelledBody', { city: cityName, defense, enemy }),
      choices: [{ label: 'OK', type: 'good' }],
    });
    debugInfo('Invasion repoussée', { city: cityName, defense, enemy });
  } else {
    const tribute = Math.round(enemy * TRIBUTE_PER_POWER * 0.5) + 80;
    const paid = Math.min(Math.floor(treasury), tribute);
    treasury -= paid;
    resources.wheat = Math.max(0, (resources.wheat || 0) - 15);
    army.morale = Math.max(0.2, army.morale - 0.15);
    showNotification(t('invasion.breached', { city: cityName }), 'bad');
    showChoice({
      title: `💀 ${t('invasion.breachedTitle')}`,
      body: t('invasion.breachedBody', { city: cityName, gold: paid, defense, enemy }),
      choices: [{ label: 'OK', type: 'danger' }],
    });
    debugInfo('Invasion réussie (ennemi)', { city: cityName, defense, enemy, paid });
  }

  invasion = null;
  updateResourceBar();
  saveGame({ silent: true });
}

function tickInvasion(){
  if (!invasion){
    if (typeof getCalendarState !== 'function') return;
    const day = getCalendarState().day;
    if (day < INVASION_MIN_DAY || !worldCities || worldCities.length === 0) return;
    if (Math.random() >= INVASION_SPAWN_CHANCE) return;
    const hostile = worldCities.filter(c => !c.conquered && c.relation <= DIPLO_HOSTILE_THRESHOLD);
    if (hostile.length === 0) return;
    spawnInvasion(hostile[Math.floor(Math.random() * hostile.length)]);
    return;
  }

  invasion.prevCol = invasion.col; invasion.prevRow = invasion.row;
  invasion.moveCooldown--;
  if (invasion.moveCooldown > 0) return;

  if (invasion.pathIndex >= invasion.path.length){
    resolveInvasionArrival();
    return;
  }

  const next = invasion.path[invasion.pathIndex];
  invasion.col = next.col;
  invasion.row = next.row;
  invasion.pathIndex++;
  invasion.moveCooldown = INVASION_MOVE_EVERY_TICKS;
}
